/**
 * Unit tests for the `deepl watch` command registration.
 *
 * Covers what the registration decides before the watcher exists: resolving
 * --to from config, applying a glossary's source language, the output directory
 * --dry-run reports, and the optional lines that report only when their flag
 * is present.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';

jest.mock('chalk', () => {
  const passthrough = (s: string): string => s;
  return {
    __esModule: true,
    default: { level: 0, yellow: passthrough, green: passthrough },
  };
});

jest.mock('../../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    output: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/cli/commands/service-factory', () => ({
  createWatchCommand: jest.fn(),
}));

import { registerWatch } from '../../../src/cli/commands/register-watch';
import { createWatchCommand } from '../../../src/cli/commands/service-factory';
import { Logger } from '../../../src/utils/logger';
import { ValidationError } from '../../../src/utils/errors';
import type { ServiceDeps } from '../../../src/cli/commands/service-factory';

const mockCreateWatchCommand = createWatchCommand as jest.MockedFunction<
  typeof createWatchCommand
>;

describe('registerWatch', () => {
  let program: Command;
  let handleError: jest.Mock;
  let watch: jest.Mock;
  let configValues: Record<string, unknown>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-'));
    configValues = {};
    watch = jest.fn().mockResolvedValue(undefined);
    mockCreateWatchCommand.mockResolvedValue({ watch } as unknown as Awaited<
      ReturnType<typeof createWatchCommand>
    >);

    handleError = jest.fn((error: unknown) => {
      throw error;
    });
    program = new Command();
    program.exitOverride();
    registerWatch(program, {
      createDeepLClient: jest.fn(),
      getApiKeyAndOptions: jest.fn(),
      getConfigService: () =>
        ({
          getValue: (key: string) => configValues[key],
        }) as unknown as ReturnType<ServiceDeps['getConfigService']>,
      getCacheService: jest.fn(),
      handleError: handleError as unknown as ServiceDeps['handleError'],
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runWatch(argv: string[]): Promise<void> {
    await program.parseAsync(['node', 'deepl', 'watch', ...argv]);
  }

  /** The single string --dry-run writes through Logger.output. */
  function dryRunReport(): string {
    const [report] = (Logger.output as jest.Mock).mock.calls[0] as [string];
    return report;
  }

  describe('resolving the target language', () => {
    it('falls back to defaults.targetLangs when --to is omitted', async () => {
      configValues['defaults.targetLangs'] = ['de', 'fr'];

      await runWatch([tmpDir]);

      expect(watch).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({ to: 'de,fr' })
      );
    });

    it('rejects when --to is omitted and no default is configured', async () => {
      await expect(runWatch([tmpDir])).rejects.toThrow(
        'No target language specified.'
      );

      expect(handleError.mock.calls[0]![0]).toBeInstanceOf(ValidationError);
      expect(watch).not.toHaveBeenCalled();
    });

    it('rejects when defaults.targetLangs is configured but empty', async () => {
      configValues['defaults.targetLangs'] = [];

      await expect(runWatch([tmpDir])).rejects.toThrow(
        'No target language specified.'
      );
    });
  });

  describe('glossary source language', () => {
    it('takes the source language from config when --glossary needs one', async () => {
      configValues['defaults.sourceLang'] = 'EN';

      await runWatch([tmpDir, '--to', 'de', '--glossary', 'my-terms']);

      expect(watch).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({ from: 'en', glossary: 'my-terms' })
      );
    });

    it('rejects a glossary with no source language available', async () => {
      await expect(
        runWatch([tmpDir, '--to', 'de', '--glossary', 'my-terms'])
      ).rejects.toThrow('Source language (--from) is required');

      expect(watch).not.toHaveBeenCalled();
    });

    it('resolves the glossary before --dry-run reports the run as viable', async () => {
      await expect(
        runWatch([tmpDir, '--to', 'de', '--glossary', 'my-terms', '--dry-run'])
      ).rejects.toThrow('Source language (--from) is required');

      expect(Logger.output).not.toHaveBeenCalled();
    });
  });

  describe('--dry-run output directory', () => {
    it('reports <path>/translations for a directory', async () => {
      await runWatch([tmpDir, '--to', 'de', '--dry-run']);

      expect(dryRunReport()).toContain(
        `Output directory: ${tmpDir}/translations`
      );
      expect(watch).not.toHaveBeenCalled();
    });

    it('reports the containing directory for a single file', async () => {
      const file = path.join(tmpDir, 'notes.md');
      fs.writeFileSync(file, '# notes');

      await runWatch([file, '--to', 'de', '--dry-run']);

      expect(dryRunReport()).toContain(`Output directory: ${tmpDir}`);
    });

    it('falls back to the current directory for a bare filename', async () => {
      // No '/' to strip, so the derived parent is empty and defaults to '.'
      await runWatch(['notes.md', '--to', 'de', '--dry-run']);

      expect(dryRunReport()).toContain('Output directory: .');
    });

    it('prefers an explicit --output over either default', async () => {
      await runWatch([
        tmpDir,
        '--to',
        'de',
        '--output',
        '/tmp/elsewhere',
        '--dry-run',
      ]);

      expect(dryRunReport()).toContain('Output directory: /tmp/elsewhere');
    });
  });

  describe('--dry-run optional lines', () => {
    it('omits the optional lines when their flags are absent', async () => {
      await runWatch([tmpDir, '--to', 'de', '--dry-run']);
      const report = dryRunReport();

      expect(report).not.toContain('Source language:');
      expect(report).not.toContain('Git-staged:');
      expect(report).not.toContain('Debounce:');
      expect(report).not.toContain('Auto-commit:');
      expect(report).not.toContain('File pattern:');
    });

    it('reports each optional line when its flag is given', async () => {
      await runWatch([
        tmpDir,
        '--to',
        'de',
        '--from',
        'en',
        '--git-staged',
        '--debounce',
        '750',
        '--auto-commit',
        '--pattern',
        '**/*.md',
        '--dry-run',
      ]);
      const report = dryRunReport();

      expect(report).toContain('Source language: en');
      expect(report).toContain('Git-staged: only watching staged files');
      expect(report).toContain('Debounce: 750ms');
      expect(report).toContain('Auto-commit: enabled');
      expect(report).toContain('File pattern: **/*.md');
    });

    it('lists every requested target language', async () => {
      await runWatch([tmpDir, '--to', 'de, fr ,es', '--dry-run']);

      expect(dryRunReport()).toContain('Target language(s): de, fr, es');
    });
  });

  describe('starting the watcher', () => {
    it('passes the resolved options through to WatchCommand.watch', async () => {
      await runWatch([tmpDir, '--to', 'de', '--from', 'en']);

      expect(mockCreateWatchCommand).toHaveBeenCalledTimes(1);
      expect(watch).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({ to: 'de', from: 'en' })
      );
    });

    it('routes a watcher failure to handleError', async () => {
      watch.mockRejectedValue(new Error('watcher exploded'));

      await expect(runWatch([tmpDir, '--to', 'de'])).rejects.toThrow(
        'watcher exploded'
      );

      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'watcher exploded' })
      );
    });
  });
});
