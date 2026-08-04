/**
 * Tests for the language-snapshot generator's rendering contract.
 *
 * The script's output is TypeScript that the next build compiles and the test
 * suite imports, so `GET /v3/languages` is untrusted input to a code generator.
 *
 * Exercised in a spawned Node process: the script is ESM and jest's CJS
 * transform cannot load it.
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'generate-language-registry.mjs');

/** Renders `entries`/`writeTargets` and reports either the output or the rejection. */
function render(
  entries: Array<Record<string, unknown>>,
  writeTargets: string[] = ['de'],
): { ok: boolean; output: string } {
  const source = `
    const gen = await import(${JSON.stringify(SCRIPT)});
    try {
      const out = gen.renderRegistry(${JSON.stringify(entries)}, ${JSON.stringify(writeTargets)});
      process.stdout.write('OK\\n' + out);
    } catch (error) {
      process.stdout.write('ERR\\n' + error.message);
    }
  `;
  const result = spawnSync('node', ['--input-type=module', '-e', source], { encoding: 'utf-8' });
  const stdout = result.stdout ?? '';
  return { ok: stdout.startsWith('OK'), output: stdout.slice(stdout.indexOf('\n') + 1) };
}

describe('generate-language-registry', () => {
  describe('benign responses', () => {
    it('should render an entry as a single-quoted literal', () => {
      const { ok, output } = render([{ code: 'de', name: 'German', category: 'core' }]);

      expect(ok).toBe(true);
      expect(output).toContain("{ code: 'de', name: 'German', category: 'core' },");
      expect(output).toContain("  'de',");
    });

    it('should mark a target-only entry', () => {
      const { ok, output } = render(
        [{ code: 'en-gb', name: 'English (British)', category: 'regional', targetOnly: true }],
        ['en-gb'],
      );

      expect(ok).toBe(true);
      expect(output).toContain('targetOnly: true');
    });

    it('should accept the punctuation real display names use', () => {
      for (const name of ['Norwegian (bokmål)', 'Kurdish (Sorani)', 'Chinese (simplified)']) {
        expect(render([{ code: 'nb', name, category: 'core' }]).ok).toBe(true);
      }
    });
  });

  describe('hostile responses', () => {
    it('should reject a language code that could terminate the literal', () => {
      const { ok, output } = render([
        {
          code: "x' }] as const; eval('boom'); const z = [{ code: 'y",
          name: 'X',
          category: 'core',
        },
      ]);

      expect(ok).toBe(false);
      expect(output).toMatch(/not shaped like a language tag/);
    });

    it('should reject a display name carrying a quote or comment marker', () => {
      const { ok, output } = render([{ code: 'de', name: "Ger'; eval('x'); //", category: 'core' }]);

      expect(ok).toBe(false);
      expect(output).toMatch(/refusing to write display name/);
    });

    it.each([['newline', 'German\nExtra'], ['backslash', 'German\\']])(
      'should reject a display name containing a %s',
      (_label, name) => {
        expect(render([{ code: 'de', name, category: 'core' }]).ok).toBe(false);
      },
    );

    it('should reject a category outside the three tiers', () => {
      const { ok, output } = render([{ code: 'de', name: 'German', category: "core'; eval('x')" }]);

      expect(ok).toBe(false);
      expect(output).toMatch(/unexpected category/);
    });

    it('should reject a non-string code or name', () => {
      expect(render([{ code: 42, name: 'X', category: 'core' }]).ok).toBe(false);
      expect(render([{ code: 'de', name: 42, category: 'core' }]).ok).toBe(false);
    });

    it('should reject a Write target that is not a language tag', () => {
      const { ok } = render([{ code: 'de', name: 'German', category: 'core' }], [
        "de' ], evil = [",
      ]);

      // The Write list is validated in main(); rendering it quotes the value so
      // it cannot escape the literal even when reached directly.
      expect(ok).toBe(true);
      expect(render([{ code: 'de', name: 'German', category: 'core' }], ["de' ], evil = ["]).output)
        .toContain("'de\\' ], evil = ['");
    });
  });

  describe('failure reporting', () => {
    it('should report a thrown fetch as its own error line, not an unhandled rejection', () => {
      // A DNS failure or a socket reset throws rather than returning a response,
      // and the script has to name it the way it names every other failure.
      const preload = path.join(
        __dirname,
        '..',
        'fixtures',
        'throwing-fetch.mjs',
      );
      const result = spawnSync('node', ['--import', pathToFileURL(preload).href, SCRIPT], {
        encoding: 'utf-8',
        env: { ...process.env, DEEPL_API_KEY: 'test-key-for-generator:fx' },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('error: simulated transport failure');
      expect(result.stderr).not.toContain('UnhandledPromiseRejection');
      expect(result.stderr).not.toContain('at async main');
    });
  });
});
