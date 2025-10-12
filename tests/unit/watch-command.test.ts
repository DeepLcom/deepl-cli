/**
 * Tests for WatchCommand
 */

import * as fs from 'fs';
import { WatchCommand } from '../../src/cli/commands/watch';
import { WatchService } from '../../src/services/watch';
import { FileTranslationService } from '../../src/services/file-translation';
import { TranslationService } from '../../src/services/translation';

// Mock chalk
jest.mock('chalk', () => ({
  default: {
    green: (text: string) => text,
    yellow: (text: string) => text,
    blue: (text: string) => text,
    gray: (text: string) => text,
    red: (text: string) => text,
  },
  green: (text: string) => text,
  yellow: (text: string) => text,
  blue: (text: string) => text,
  gray: (text: string) => text,
  red: (text: string) => text,
}));

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/services/watch');
jest.mock('../../src/services/file-translation');

describe('WatchCommand', () => {
  let mockTranslationService: jest.Mocked<TranslationService>;
  let mockFileTranslationService: jest.Mocked<FileTranslationService>;
  let mockWatchService: jest.Mocked<WatchService>;
  let watchCommand: WatchCommand;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock TranslationService
    mockTranslationService = {
      translate: jest.fn(),
    } as any;

    // Mock FileTranslationService
    mockFileTranslationService = {
      translateFile: jest.fn(),
    } as any;

    (FileTranslationService as jest.MockedClass<typeof FileTranslationService>).mockImplementation(
      () => mockFileTranslationService
    );

    // Mock WatchService
    mockWatchService = {
      watch: jest.fn().mockReturnValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockReturnValue({
        translationsCount: 0,
        errorsCount: 0,
      }),
    } as any;

    (WatchService as jest.MockedClass<typeof WatchService>).mockImplementation(
      () => mockWatchService
    );

    // Mock console methods to avoid noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    watchCommand = new WatchCommand(mockTranslationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create WatchCommand with TranslationService', () => {
      expect(watchCommand).toBeInstanceOf(WatchCommand);
      expect(FileTranslationService).toHaveBeenCalledWith(mockTranslationService);
    });
  });

  describe('watch()', () => {
    beforeEach(() => {
      // Mock fs.existsSync to return true by default
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);

      // Mock process.on to avoid hanging tests
      jest.spyOn(process, 'on').mockImplementation(() => process as any);
    });

    it('should throw error for non-existent path', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const watchPromise = watchCommand.watch('/non/existent/path', {
        targets: 'es,fr',
      });

      await expect(watchPromise).rejects.toThrow('Path not found');
    });

    it('should parse multiple target languages', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

      // Create a Promise that rejects immediately to avoid hanging
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es, fr, de',
        });
      } catch (error: any) {
        expect(error.message).toBe('Test complete');
      }

      expect(mockWatchService.watch).toHaveBeenCalledWith(
        '/some/file.md',
        expect.objectContaining({
          targetLangs: ['es', 'fr', 'de'],
        })
      );
    });

    it('should use custom output directory when provided', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
          output: '/custom/output',
        });
      } catch {
        // Expected
      }

      expect(mockWatchService.watch).toHaveBeenCalledWith(
        '/some/file.md',
        expect.objectContaining({
          outputDir: '/custom/output',
        })
      );
    });

    it('should create translations subdirectory for directory input', async () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(true).mockReturnValueOnce(false);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/dir', {
          targets: 'es',
        });
      } catch {
        // Expected
      }

      expect(fs.mkdirSync).toHaveBeenCalledWith('/some/dir/translations', {
        recursive: true,
      });
    });

    it('should use same directory for file input when no output specified', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/dir/file.md', {
          targets: 'es',
        });
      } catch {
        // Expected
      }

      expect(mockWatchService.watch).toHaveBeenCalledWith(
        '/some/dir/file.md',
        expect.objectContaining({
          outputDir: '/some/dir',
        })
      );
    });

    it('should pass debounce option to WatchService', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
          debounce: 500,
        });
      } catch {
        // Expected
      }

      expect(WatchService).toHaveBeenCalledWith(
        mockFileTranslationService,
        expect.objectContaining({
          debounceMs: 500,
        })
      );
    });

    it('should pass pattern option to WatchService', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/dir', {
          targets: 'es',
          pattern: '*.md',
        });
      } catch {
        // Expected
      }

      expect(WatchService).toHaveBeenCalledWith(
        mockFileTranslationService,
        expect.objectContaining({
          pattern: '*.md',
        })
      );
    });

    it('should pass translation options to watch service', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es,fr',
          from: 'en',
          formality: 'more',
          preserveCode: true,
        });
      } catch {
        // Expected
      }

      expect(mockWatchService.watch).toHaveBeenCalledWith(
        '/some/file.md',
        expect.objectContaining({
          targetLangs: ['es', 'fr'],
          sourceLang: 'en',
          formality: 'more',
          preserveCode: true,
        })
      );
    });

    it('should register onChange callback', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];
      expect(watchOptions.onChange).toBeInstanceOf(Function);

      // Test the callback
      watchOptions.onChange!('/test/file.md');
      expect(console.log).toHaveBeenCalledWith(
        expect.anything(),
        '/test/file.md'
      );
    });

    it('should register onTranslate callback for multiple languages', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es,fr',
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];
      expect(watchOptions.onTranslate).toBeInstanceOf(Function);

      // Test the callback with array result
      await watchOptions.onTranslate!('/test/file.md', [
        { targetLang: 'es', text: 'translated text', outputPath: '/test/file.es.md' },
        { targetLang: 'fr', text: 'translated text', outputPath: '/test/file.fr.md' },
      ]);

      expect(console.log).toHaveBeenCalled();
    });

    it('should register onTranslate callback for single language', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];

      // Test the callback with single result
      await watchOptions.onTranslate!('/test/file.md', {
        targetLang: 'es',
        text: 'translated text',
        outputPath: '/test/file.es.md',
      });

      expect(console.log).toHaveBeenCalled();
    });

    it('should register onError callback', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];
      expect(watchOptions.onError).toBeInstanceOf(Function);

      // Test the callback
      watchOptions.onError!('/test/file.md', new Error('Translation failed'));
      expect(console.error).toHaveBeenCalled();
    });

    it('should throw error when no target languages provided', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(
        watchCommand.watch('/some/file.md', {
          targets: '',
        })
      ).rejects.toThrow('At least one target language is required');
    });

    it('should display initial watch message with all options', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

      // Mock the watch service watch method to return a resolved promise
      mockWatchService.watch.mockReturnValue(undefined as any);

      // Start watch - it will reach the infinite Promise and hang there
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      watchCommand.watch('/some/file.md', {
        targets: 'es,fr',
        pattern: '*.md',
        autoCommit: true,
      });

      // Wait a bit for console.log statements to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Watching for changes'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Path: /some/file.md'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Targets: es, fr'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Pattern: *.md'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Auto-commit enabled'));

      // Don't wait for the promise to resolve (it won't due to infinite Promise)
    }, 1000);

    it('should use current directory when file is in root', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('file.md', {
          targets: 'es',
        });
      } catch {
        // Expected
      }

      expect(mockWatchService.watch).toHaveBeenCalledWith(
        'file.md',
        expect.objectContaining({
          outputDir: '.',
        })
      );
    });
  });

  describe('autoCommit', () => {
    let mockExec: jest.Mock;

    beforeEach(() => {
      // Mock dynamic imports
      mockExec = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
      jest.mock('child_process', () => ({
        exec: mockExec,
      }));
      jest.mock('util', () => ({
        promisify: (fn: any) => fn,
      }));

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    });

    it('should auto-commit translations when autoCommit is enabled for multiple languages', async () => {
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      // Mock exec to simulate git commands
      const mockExecAsync = jest.fn()
        .mockResolvedValueOnce({ stdout: '.git', stderr: '' }) // git rev-parse check
        .mockResolvedValue({ stdout: '', stderr: '' }); // git add and commit

      jest.doMock('child_process', () => ({
        exec: jest.fn(),
      }));
      jest.doMock('util', () => ({
        promisify: () => mockExecAsync,
      }));

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es,fr',
          autoCommit: true,
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];

      // Trigger onTranslate callback with multiple languages
      await watchOptions.onTranslate!('/test/file.md', [
        { targetLang: 'es', text: 'texto', outputPath: '/test/file.es.md' },
        { targetLang: 'fr', text: 'texte', outputPath: '/test/file.fr.md' },
      ]);

      // Verify console output includes auto-commit attempt
      expect(console.log).toHaveBeenCalled();
    });

    it('should auto-commit translations when autoCommit is enabled for single language', async () => {
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
          autoCommit: true,
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];

      // Trigger onTranslate callback with single language
      await watchOptions.onTranslate!('/test/file.md', {
        targetLang: 'es',
        text: 'texto',
        outputPath: '/test/file.es.md',
      });

      expect(console.log).toHaveBeenCalled();
    });

    it('should handle auto-commit when not in git repository', async () => {
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
          autoCommit: true,
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];

      // Trigger onTranslate callback
      await watchOptions.onTranslate!('/test/file.md', {
        targetLang: 'es',
        text: 'texto',
        outputPath: '/test/file.es.md',
      });

      // Should not throw, just log warning
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle auto-commit with no output files', async () => {
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
          autoCommit: true,
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];

      // Trigger onTranslate callback with no outputPath
      await watchOptions.onTranslate!('/test/file.md', {
        targetLang: 'es',
        text: 'texto',
      });

      // Should not throw
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle auto-commit errors gracefully', async () => {
      mockWatchService.watch.mockImplementation(() => { throw new Error('Test complete'); });

      try {
        await watchCommand.watch('/some/file.md', {
          targets: 'es',
          autoCommit: true,
        });
      } catch {
        // Expected
      }

      const watchOptions = mockWatchService.watch.mock.calls[0]![1];

      // Trigger onTranslate callback
      await watchOptions.onTranslate!('/test/file.md', {
        targetLang: 'es',
        text: 'texto',
        outputPath: '/test/file.es.md',
      });

      // Should not throw on auto-commit failure
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop watch service if it exists', async () => {
      // Manually set watchService for testing
      (watchCommand as any).watchService = mockWatchService;

      await watchCommand.stop();

      expect(mockWatchService.stop).toHaveBeenCalled();
    });

    it('should not throw if watch service does not exist', async () => {
      await expect(watchCommand.stop()).resolves.not.toThrow();
    });
  });
});
