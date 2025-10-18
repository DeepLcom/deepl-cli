/**
 * Tests for Watch Service
 * Following TDD approach - RED phase
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as chokidar from 'chokidar';
import { WatchService } from '../../../src/services/watch';
import { FileTranslationService } from '../../../src/services/file-translation';

// Mock chokidar
jest.mock('chokidar');

// Mock FileTranslationService
jest.mock('../../../src/services/file-translation');

const mockWatcher = {
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
};

describe('WatchService', () => {
  let watchService: WatchService;
  let mockFileTranslationService: jest.Mocked<FileTranslationService>;
  let testDir: string;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockWatcher.on.mockReturnThis();

    // Mock chokidar.watch to return our mockWatcher
    (chokidar.watch as jest.Mock).mockImplementation(() => mockWatcher);

    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `deepl-watch-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Create mock FileTranslationService
    mockFileTranslationService = {
      translateFile: jest.fn(),
      translateFileToMultiple: jest.fn(),
      getSupportedFileTypes: jest.fn().mockReturnValue(['.txt', '.md']),
      isSupportedFile: jest.fn((filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        return ['.txt', '.md'].includes(ext);
      }),
    } as unknown as jest.Mocked<FileTranslationService>;

    watchService = new WatchService(mockFileTranslationService);
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create a WatchService instance', () => {
      expect(watchService).toBeInstanceOf(WatchService);
    });

    it('should accept custom options', () => {
      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 1000,
        pattern: '*.md',
      });
      expect(service).toBeInstanceOf(WatchService);
    });
  });

  describe('watch()', () => {
    it('should start watching a directory', async () => {
      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);

      // Verify watcher was created (will be implemented)
      expect(watchService.isWatching()).toBe(true);
    });

    it('should watch a single file', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testFile, options);

      expect(watchService.isWatching()).toBe(true);
    });

    it('should throw error for non-existent path', () => {
      const nonExistent = path.join(testDir, 'nonexistent');

      expect(() => {
        watchService.watch(nonExistent, {
          targetLangs: ['es'],
          outputDir: testDir,
        });
      }).toThrow('not found');
    });

    it('should apply glob pattern filter', async () => {
      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        pattern: '*.md',
      };

      await watchService.watch(testDir, options);

      // Verify pattern was applied
      expect(watchService.isWatching()).toBe(true);
    });

    it('should respect debounce option', async () => {
      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 100,
      });

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await service.watch(testDir, options);

      expect(service.isWatching()).toBe(true);
    });
  });

  describe('file change handling', () => {
    it('should translate file on change event', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);

      // Simulate file change
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockFileTranslationService.translateFile).toHaveBeenCalled();
    });

    it('should debounce rapid file changes', async () => {
      jest.useFakeTimers();

      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 500,
      });

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await service.watch(testDir, options);

      // Simulate multiple rapid changes
      service.handleFileChange(testFile);
      service.handleFileChange(testFile);
      service.handleFileChange(testFile);

      // Fast-forward time
      jest.advanceTimersByTime(500);
      await Promise.resolve(); // Allow promises to resolve

      // Should only translate once due to debouncing
      expect(mockFileTranslationService.translateFile).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should skip unsupported file types', async () => {
      const testFile = path.join(testDir, 'test.pdf');
      fs.writeFileSync(testFile, 'content');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      expect(mockFileTranslationService.translateFile).not.toHaveBeenCalled();
    });

    it('should handle translation errors gracefully', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockRejectedValue(
        new Error('Translation failed')
      );

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      watchService.watch(testDir, options);

      // Should not throw, just log error (it's synchronous but schedules async work)
      expect(() => watchService.handleFileChange(testFile)).not.toThrow();
    });

    it('should translate to multiple target languages', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFileToMultiple.mockResolvedValue([
        { targetLang: 'es', text: 'Hola', outputPath: '/out/test.es.txt' },
        { targetLang: 'fr', text: 'Bonjour', outputPath: '/out/test.fr.txt' },
      ]);

      const options = {
        targetLangs: ['es' as const, 'fr' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockFileTranslationService.translateFileToMultiple).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop watching', async () => {
      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);
      expect(watchService.isWatching()).toBe(true);

      await watchService.stop();
      expect(watchService.isWatching()).toBe(false);
    });

    it('should not error when stopping without watching', async () => {
      await expect(watchService.stop()).resolves.not.toThrow();
    });

    it('should cancel pending translations on stop', async () => {
      jest.useFakeTimers();

      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 500,
      });

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await service.watch(testDir, options);
      service.handleFileChange(testFile);

      // Stop before debounce completes
      await service.stop();

      jest.advanceTimersByTime(500);
      await Promise.resolve();

      // Translation should not occur
      expect(mockFileTranslationService.translateFile).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('event callbacks', () => {
    it('should call onChange callback when file changes', async () => {
      const onChange = jest.fn();
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        onChange,
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('test.txt'));
    });

    it('should call onTranslate callback after translation', async () => {
      const onTranslate = jest.fn();
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        onTranslate,
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(onTranslate).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        expect.any(Object)
      );
    });

    it('should call onError callback on translation failure', async () => {
      // Suppress expected console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const onError = jest.fn();
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockRejectedValue(
        new Error('Translation failed')
      );

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        onError,
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        expect.any(Error)
      );

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getStats()', () => {
    it('should return watch statistics', async () => {
      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);

      const stats = watchService.getStats();

      expect(stats).toHaveProperty('isWatching');
      expect(stats).toHaveProperty('filesWatched');
      expect(stats).toHaveProperty('translationsCount');
      expect(stats).toHaveProperty('errorsCount');
    });

    it('should increment translation count after successful translation', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      const stats = watchService.getStats();
      expect(stats.translationsCount).toBeGreaterThan(0);
    });

    it('should increment error count after failed translation', async () => {
      // Suppress expected console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockRejectedValue(
        new Error('Translation failed')
      );

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      const stats = watchService.getStats();
      expect(stats.errorsCount).toBeGreaterThan(0);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('pattern filtering', () => {
    it('should apply glob pattern with * prefix to filter by extension', async () => {
      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        pattern: '*.md',
      };

      watchService.watch(testDir, options);

      // Verify chokidar.watch was called with ignored function
      const watchCall = (chokidar.watch as jest.Mock).mock.calls[0];
      expect(watchCall).toBeDefined();
      expect(watchCall[1]).toHaveProperty('ignored');
      expect(typeof watchCall[1].ignored).toBe('function');

      // Test the ignored function
      const ignored = watchCall[1].ignored;
      expect(ignored('/path/to/file.txt')).toBe(true);  // Should ignore .txt
      expect(ignored('/path/to/file.md')).toBe(false);   // Should not ignore .md
    });

    it('should not filter when no pattern is specified', async () => {
      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      watchService.watch(testDir, options);

      const watchCall = (chokidar.watch as jest.Mock).mock.calls[0];
      expect(watchCall[1]).not.toHaveProperty('ignored');
    });

    it('should prefer watchOptions pattern over constructor pattern', async () => {
      const service = new WatchService(mockFileTranslationService, {
        pattern: '*.txt',
      });

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        pattern: '*.md',
      };

      service.watch(testDir, options);

      const watchCall = (chokidar.watch as jest.Mock).mock.calls[0];
      const ignored = watchCall[1].ignored;

      // Should use *.md from options, not *.txt from constructor
      expect(ignored('/path/to/file.md')).toBe(false);
      expect(ignored('/path/to/file.txt')).toBe(true);
    });
  });

  describe('translation options passthrough', () => {
    it('should pass sourceLang to translation service', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        sourceLang: 'en' as const,
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockFileTranslationService.translateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ sourceLang: 'en' }),
        expect.any(Object)
      );
    });

    it('should pass formality to translation service', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
        formality: 'more' as const,
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(mockFileTranslationService.translateFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ formality: 'more' }),
        expect.any(Object)
      );
    });

    it('should call onTranslate callback for multiple languages', async () => {
      const onTranslate = jest.fn();
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFileToMultiple.mockResolvedValue([
        { targetLang: 'es', text: 'Hola', outputPath: '/out/test.es.txt' },
        { targetLang: 'fr', text: 'Bonjour', outputPath: '/out/test.fr.txt' },
      ]);

      const options = {
        targetLangs: ['es' as const, 'fr' as const],
        outputDir: path.join(testDir, 'output'),
        onTranslate,
      };

      await watchService.watch(testDir, options);
      await watchService.handleFileChange(testFile);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(onTranslate).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        expect.arrayContaining([
          expect.objectContaining({ targetLang: 'es' }),
          expect.objectContaining({ targetLang: 'fr' }),
        ])
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors in change event handler', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Create a service where handleFileChange will throw
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      watchService.watch(testDir, options);

      // Get the 'change' event handler
      const changeHandler = mockWatcher.on.mock.calls.find(
        call => call[0] === 'change'
      )?.[1];

      expect(changeHandler).toBeDefined();

      // Mock handleFileChange to throw an error
      jest.spyOn(watchService, 'handleFileChange').mockImplementation(() => {
        throw new Error('Handler error');
      });

      // Should not throw, just log error
      expect(() => changeHandler(testFile)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle errors in add event handler', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      watchService.watch(testDir, options);

      // Get the 'add' event handler
      const addHandler = mockWatcher.on.mock.calls.find(
        call => call[0] === 'add'
      )?.[1];

      expect(addHandler).toBeDefined();

      // Mock handleFileChange to throw an error
      jest.spyOn(watchService, 'handleFileChange').mockImplementation(() => {
        throw new Error('Handler error');
      });

      // Should not throw, just log error
      expect(() => addHandler(testFile)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should throw error when handleFileChange called before watch starts', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      // Don't start watch, just call handleFileChange
      expect(() => watchService.handleFileChange(testFile)).toThrow('Watch not started');
    });
  });

  describe('race condition handling (Issue #1)', () => {
    it('should not execute timer callback if watch is stopped after timer is scheduled', async () => {
      jest.useFakeTimers();

      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 500,
      });

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await service.watch(testDir, options);

      // Schedule timer (file change event)
      service.handleFileChange(testFile);

      // Stop immediately (before timer fires)
      await service.stop();

      // Now advance time (timer callback should be cancelled or should check watch state)
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      // Translation should NOT occur because watch was stopped
      expect(mockFileTranslationService.translateFile).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not schedule new timers if watch is stopped', async () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await watchService.watch(testDir, options);
      await watchService.stop();

      // Try to trigger file change after stop
      // Should not throw, but also should not schedule translation
      expect(() => watchService.handleFileChange(testFile)).toThrow('Watch not started');
    });

    it('should handle rapid start/stop cycles without orphaned timers', async () => {
      jest.useFakeTimers();

      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 300,
      });

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      // Rapid start/stop cycles
      await service.watch(testDir, options);
      service.handleFileChange(testFile);
      await service.stop();

      await service.watch(testDir, options);
      service.handleFileChange(testFile);
      await service.stop();

      await service.watch(testDir, options);
      service.handleFileChange(testFile);
      await service.stop();

      // Fast-forward all timers
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // No translations should occur (all timers cancelled on stop)
      expect(mockFileTranslationService.translateFile).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should check watch state inside timer callback to prevent race condition', async () => {
      jest.useFakeTimers();

      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 500,
      });

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await service.watch(testDir, options);
      service.handleFileChange(testFile);

      // Fast-forward to just before timer fires
      jest.advanceTimersByTime(499);

      // Stop now (timer is about to fire in 1ms)
      await service.stop();

      // Fire the timer (it's already in the event loop queue)
      jest.advanceTimersByTime(1);
      await Promise.resolve();

      // Translation should NOT occur - the timer callback should check watch state
      expect(mockFileTranslationService.translateFile).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not throw errors if timer callback executes after stop', async () => {
      jest.useFakeTimers();

      const service = new WatchService(mockFileTranslationService, {
        debounceMs: 300,
      });

      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const options = {
        targetLangs: ['es' as const],
        outputDir: path.join(testDir, 'output'),
      };

      await service.watch(testDir, options);
      service.handleFileChange(testFile);
      await service.stop();

      // Should not throw when timer fires after stop
      expect(() => {
        jest.advanceTimersByTime(300);
      }).not.toThrow();

      jest.useRealTimers();
    });
  });
});
