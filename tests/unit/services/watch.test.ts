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

    it('should throw error for non-existent path', async () => {
      const nonExistent = path.join(testDir, 'nonexistent');

      await expect(
        watchService.watch(nonExistent, {
          targetLangs: ['es'],
          outputDir: testDir,
        })
      ).rejects.toThrow('not found');
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

      await watchService.watch(testDir, options);

      // Should not throw, just log error
      await expect(watchService.handleFileChange(testFile)).resolves.not.toThrow();
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
  });
});
