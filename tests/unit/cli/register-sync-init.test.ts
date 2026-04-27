/**
 * Unit tests for `deepl sync init`'s flag vocabulary.
 *
 * Exercises the --source-locale / --target-locales rename and the
 * --source-lang / --target-langs deprecation aliases. The new primary
 * flags work silently; the old aliases continue to work but emit a
 * stderr deprecation warning pointing at the replacement.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';
import { registerSync } from '../../../src/cli/commands/register-sync';
import type { ServiceDeps } from '../../../src/cli/commands/service-factory';

function makeDeps(handleError: jest.Mock): ServiceDeps {
  return {
    createDeepLClient: jest.fn(),
    getApiKeyAndOptions: jest.fn(),
    getConfigService: jest.fn(),
    getCacheService: jest.fn(),
    handleError: handleError as unknown as ServiceDeps['handleError'],
  };
}

async function runSyncInit(argv: string[], deps: ServiceDeps): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSync(program, deps);
  await program.parseAsync(['node', 'deepl', 'sync', 'init', ...argv]);
}

describe('deepl sync init flag vocabulary', () => {
  let tmpDir: string;
  let originalCwd: string;
  let stderrSpy: jest.SpyInstance;
  let stderrChunks: string[];
  let handleError: jest.Mock;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-init-vocab-'));
    fs.mkdirSync(path.join(tmpDir, 'locales'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'locales', 'en.json'), '{}');
    process.chdir(tmpDir);

    stderrChunks = [];
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => {
        stderrChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
        return true;
      });

    handleError = jest.fn();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function stderrText(): string {
    return stderrChunks.join('');
  }

  it('--source-locale and --target-locales succeed without a deprecation warning', async () => {
    const deps = makeDeps(handleError);
    await runSyncInit(
      [
        '--source-locale', 'en',
        '--target-locales', 'de,fr',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ],
      deps,
    );
    expect(handleError).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, '.deepl-sync.yaml'))).toBe(true);
    expect(stderrText()).not.toMatch(/\[deprecated\]/);
  });

  it('--source-lang works but emits a stderr deprecation warning naming --source-locale', async () => {
    const deps = makeDeps(handleError);
    await runSyncInit(
      [
        '--source-lang', 'en',
        '--target-locales', 'de,fr',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ],
      deps,
    );
    expect(handleError).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, '.deepl-sync.yaml'))).toBe(true);
    const err = stderrText();
    expect(err).toMatch(/\[deprecated\] --source-lang is renamed to --source-locale/);
    expect(err).toMatch(/next major release/);
  });

  it('--target-langs works but emits a stderr deprecation warning naming --target-locales', async () => {
    const deps = makeDeps(handleError);
    await runSyncInit(
      [
        '--source-locale', 'en',
        '--target-langs', 'de,fr',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ],
      deps,
    );
    expect(handleError).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, '.deepl-sync.yaml'))).toBe(true);
    const err = stderrText();
    expect(err).toMatch(/\[deprecated\] --target-langs is renamed to --target-locales/);
    expect(err).toMatch(/next major release/);
  });

  it('both deprecated aliases together emit both warnings', async () => {
    const deps = makeDeps(handleError);
    await runSyncInit(
      [
        '--source-lang', 'en',
        '--target-langs', 'de,fr',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ],
      deps,
    );
    expect(handleError).not.toHaveBeenCalled();
    const err = stderrText();
    expect(err).toMatch(/--source-lang is renamed to --source-locale/);
    expect(err).toMatch(/--target-langs is renamed to --target-locales/);
  });

  it('new flag wins when both new and old are supplied (no warning for the flag with the new form)', async () => {
    const deps = makeDeps(handleError);
    await runSyncInit(
      [
        '--source-locale', 'en',
        '--source-lang', 'xx',
        '--target-locales', 'de',
        '--file-format', 'json',
        '--path', 'locales/en.json',
      ],
      deps,
    );
    expect(handleError).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, '.deepl-sync.yaml'))).toBe(true);
    const yaml = fs.readFileSync(path.join(tmpDir, '.deepl-sync.yaml'), 'utf-8');
    expect(yaml).toMatch(/source_locale:\s*en/);
    expect(yaml).not.toMatch(/source_locale:\s*xx/);
    expect(stderrText()).not.toMatch(/--source-lang is renamed/);
  });
});
