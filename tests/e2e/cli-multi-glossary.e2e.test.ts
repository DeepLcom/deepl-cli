/**
 * E2E Tests for repeating --glossary on `deepl translate`
 * Covers flag repetition, the five-glossary cap, and dry-run reporting
 */

import { createTestConfigDir, makeNodeRunCLI } from '../helpers';

describe('translate --glossary repetition E2E', () => {
  const testConfig = createTestConfigDir('e2e-multi-glossary');
  const { runCLI, runCLIExpectError } = makeNodeRunCLI(testConfig.path);

  afterAll(() => {
    testConfig.cleanup();
  });

  describe('translate --help', () => {
    it('should document that --glossary is repeatable', () => {
      const output = runCLI('translate --help');

      expect(output).toContain('--glossary');
      expect(output).toMatch(/repeatable/i);
    });

    it('should document the five-glossary maximum', () => {
      expect(runCLI('translate --help')).toMatch(/max 5/i);
    });

    it('should document that the last glossary wins a conflict', () => {
      expect(runCLI('translate --help')).toMatch(/last one wins/i);
    });
  });

  describe('the five-glossary cap', () => {
    it('should reject a sixth --glossary with a clear message', () => {
      const result = runCLIExpectError(
        'translate "Hello" --to de --glossary a --glossary b --glossary c ' +
          '--glossary d --glossary e --glossary f',
      );

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/at most 5 times/i);
      expect(result.output).toContain('got 6');
    });

    it('should not reject exactly five glossaries during flag validation', () => {
      const result = runCLIExpectError(
        'translate "Hello" --from en --to de --dry-run --glossary a --glossary b --glossary c ' +
          '--glossary d --glossary e',
      );

      expect(result.status).toBe(0);
      expect(result.output).not.toMatch(/at most 5 times/i);
    });
  });

  describe('dry run', () => {
    it('should list every requested glossary in order', () => {
      const output = runCLI(
        'translate "Hello" --from en --to de --dry-run --glossary base-terms --glossary project-overrides',
        { noColor: true },
      );

      expect(output).toContain('Glossaries: base-terms, project-overrides');
    });

    it('should keep the singular label for one glossary', () => {
      const output = runCLI('translate "Hello" --from en --to de --dry-run --glossary base-terms', {
        noColor: true,
      });

      expect(output).toContain('Glossary: base-terms');
      expect(output).not.toContain('Glossaries:');
    });

    it('should report no glossary line when none is given', () => {
      const output = runCLI('translate "Hello" --to de --dry-run', { noColor: true });

      expect(output).not.toMatch(/Glossar/i);
    });

    it('should not report a glossary command as runnable when --from is missing', () => {
      // Dry run is where people check a command is well-formed, so it has to
      // apply the same requirement the real run does.
      const result = runCLIExpectError('translate "Hello" --to de --dry-run --glossary base-terms', {
        excludeApiKey: true,
      });

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/Source language \(--from\) is required/i);
    });
  });

  describe('argument handling', () => {
    it('should require a value for each --glossary', () => {
      const result = runCLIExpectError('translate "Hello" --to de --glossary');

      expect(result.status).toBeGreaterThan(0);
      expect(result.output).toMatch(/argument missing|option.*--glossary/i);
    });
  });
});
