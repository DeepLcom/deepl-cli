/**
 * Tests for --dry-run flag across CLI commands
 * Tests translate (file/directory), glossary delete, cache clear, and watch commands
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.mock('chalk', () => {
  const passthrough = (s: string) => s;
  const mockChalk: Record<string, unknown> & { level: number } = {
    level: 3,
    red: passthrough,
    green: passthrough,
    blue: passthrough,
    yellow: passthrough,
    gray: passthrough,
    bold: passthrough,
  };
  return { __esModule: true, default: mockChalk };
});

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    output: jest.fn(),
    shouldShowSpinner: jest.fn(() => false),
    setQuiet: jest.fn(),
    isQuiet: jest.fn(() => false),
  },
}));

jest.mock('../../src/cli/commands/cache', () => ({
  CacheCommand: jest.fn().mockImplementation(() => ({
    stats: jest.fn().mockResolvedValue({
      entries: 42,
      totalSize: 1024 * 1024 * 5,
      maxSize: 1024 * 1024 * 1024,
      enabled: true,
    }),
    clear: jest.fn(),
    formatStats: jest.fn(),
  })),
}));

import { Logger } from '../../src/utils/logger';
const mockLogger = Logger as jest.Mocked<typeof Logger>;

describe('--dry-run flag', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-dry-run-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('translate command --dry-run', () => {
    it('should show dry-run message for file translation', async () => {
      const testFile = path.join(tmpDir, 'test-translate.txt');
      fs.writeFileSync(testFile, 'Hello world');

      const { registerTranslate } = await import('../../src/cli/commands/register-translate');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(() => ({
          getValue: jest.fn(),
        })),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerTranslate(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'translate', testFile,
        '--to', 'es',
        '--output', '/tmp/out.txt',
        '--dry-run',
      ]);

      expect(mockLogger.output).toHaveBeenCalled();
      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('[dry-run]');
      expect(outputCall).toContain('No translations will be performed');
      expect(outputCall).toContain(testFile);
      expect(outputCall).toContain('es');

      expect(mockDeps.createDeepLClient).not.toHaveBeenCalled();
    });

    it('should show dry-run message for directory translation', async () => {
      const subDir = path.join(tmpDir, 'translate-dir');
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      fs.writeFileSync(path.join(subDir, 'a.txt'), 'content');

      const { registerTranslate } = await import('../../src/cli/commands/register-translate');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(() => ({
          getValue: jest.fn(),
        })),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerTranslate(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'translate', subDir,
        '--to', 'de,fr',
        '--output', '/tmp/out',
        '--pattern', '*.txt',
        '--dry-run',
      ]);

      expect(mockLogger.output).toHaveBeenCalled();
      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('[dry-run]');
      expect(outputCall).toContain('Would translate directory');
      expect(outputCall).toContain('de');
      expect(outputCall).toContain('fr');
      expect(outputCall).toContain('*.txt');

      expect(mockDeps.createDeepLClient).not.toHaveBeenCalled();
    });

    it('should include source language in dry-run output when specified', async () => {
      const testFile = path.join(tmpDir, 'test-src-lang.txt');
      fs.writeFileSync(testFile, 'Bonjour');

      const { registerTranslate } = await import('../../src/cli/commands/register-translate');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(() => ({
          getValue: jest.fn(),
        })),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerTranslate(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'translate', testFile,
        '--to', 'en',
        '--from', 'fr',
        '--output', '/tmp/out.txt',
        '--dry-run',
      ]);

      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('Source language: fr');
    });

    it('should NOT activate dry-run for plain text translation', async () => {
      const { registerTranslate } = await import('../../src/cli/commands/register-translate');

      const program = new Command();

      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(() => ({
          getValue: jest.fn(),
        })),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerTranslate(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'translate', 'Hello world',
        '--to', 'es',
        '--dry-run',
      ]);

      const outputCalls = mockLogger.output.mock.calls;
      const hasDryRun = outputCalls.some(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[dry-run]')
      );
      expect(hasDryRun).toBe(false);
    });
  });

  describe('glossary delete --dry-run', () => {
    it('should show dry-run message without deleting', async () => {
      const { registerGlossary } = await import('../../src/cli/commands/register-glossary');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerGlossary(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'glossary', 'delete', 'my-glossary',
        '--dry-run',
      ]);

      expect(mockLogger.output).toHaveBeenCalled();
      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('[dry-run]');
      expect(outputCall).toContain('No deletions will be performed');
      expect(outputCall).toContain('my-glossary');

      expect(mockDeps.createDeepLClient).not.toHaveBeenCalled();
    });
  });

  describe('cache clear --dry-run', () => {
    it('should show cache stats without clearing', async () => {
      const { registerCache } = await import('../../src/cli/commands/register-cache');

      const program = new Command();
      const mockCacheService = {
        stats: jest.fn().mockReturnValue({
          entries: 42,
          totalSize: 1024 * 1024 * 5,
          maxSize: 1024 * 1024 * 1024,
          enabled: true,
        }),
      };
      const mockConfigService = {};

      const mockDeps = {
        getConfigService: jest.fn(() => mockConfigService),
        getCacheService: jest.fn().mockResolvedValue(mockCacheService),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerCache(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'cache', 'clear',
        '--dry-run',
      ]);

      expect(mockLogger.output).toHaveBeenCalled();
      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('[dry-run]');
      expect(outputCall).toContain('No cache entries will be cleared');
      expect(outputCall).toContain('42');
    });
  });

  describe('watch command --dry-run', () => {
    it('should show watch info without starting watcher', async () => {
      const watchDir = path.join(tmpDir, 'watch-dir');
      if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
      }

      const { registerWatch } = await import('../../src/cli/commands/register-watch');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerWatch(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'watch', watchDir,
        '--targets', 'es,fr',
        '--dry-run',
      ]);

      expect(mockLogger.output).toHaveBeenCalled();
      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('[dry-run]');
      expect(outputCall).toContain('Watch mode will not be started');
      expect(outputCall).toContain(watchDir);
      expect(outputCall).toContain('es');
      expect(outputCall).toContain('fr');

      expect(mockDeps.createDeepLClient).not.toHaveBeenCalled();
    });

    it('should include pattern in dry-run output when specified', async () => {
      const watchDir = path.join(tmpDir, 'watch-dir-pattern');
      if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
      }

      const { registerWatch } = await import('../../src/cli/commands/register-watch');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerWatch(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'watch', watchDir,
        '--targets', 'de',
        '--pattern', '*.json',
        '--auto-commit',
        '--dry-run',
      ]);

      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('*.json');
      expect(outputCall).toContain('Auto-commit: enabled');
    });

    it('should show output directory in dry-run output', async () => {
      const watchFile = path.join(tmpDir, 'watch-single.txt');
      fs.writeFileSync(watchFile, 'content');

      const { registerWatch } = await import('../../src/cli/commands/register-watch');

      const program = new Command();
      const mockDeps = {
        createDeepLClient: jest.fn(),
        getConfigService: jest.fn(),
        getCacheService: jest.fn(),
        handleError: jest.fn() as jest.Mock & ((error: unknown) => never),
      };

      registerWatch(program, mockDeps as any);

      await program.parseAsync([
        'node', 'deepl', 'watch', watchFile,
        '--targets', 'ja',
        '--output', '/tmp/translations',
        '--dry-run',
      ]);

      const outputCall = mockLogger.output.mock.calls[0]![0] as string;
      expect(outputCall).toContain('/tmp/translations');
    });
  });
});
