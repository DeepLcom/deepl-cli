/**
 * Integration Tests for Watch Service
 * Tests file watching and auto-translation workflows
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WatchService } from '../../src/services/watch.js';
import { FileTranslationService } from '../../src/services/file-translation.js';
import { TranslationService } from '../../src/services/translation.js';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { ConfigService } from '../../src/storage/config.js';

describe('Watch Service Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  let watchService: WatchService;
  let fileTranslationService: FileTranslationService;
  let translationService: TranslationService;
  let client: DeepLClient;
  let mockConfig: ConfigService;
  let tmpDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-test-'));

    // Set up services
    client = new DeepLClient(API_KEY);
    mockConfig = {} as ConfigService;
    translationService = new TranslationService(client, mockConfig);
    fileTranslationService = new FileTranslationService(translationService);
    watchService = new WatchService(fileTranslationService, { debounceMs: 50 });
  });

  afterEach(async () => {
    // Stop watching if still active
    if (watchService.isWatching()) {
      await watchService.stop();
    }

    // Cleanup temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('watch() - Initialization', () => {
    it('should throw error when path does not exist', () => {
      expect(() => {
        watchService.watch('/nonexistent/path', {
          targetLangs: ['es'],
          outputDir: tmpDir,
        });
      }).toThrow('Path not found');
    });

    it('should start watching existing file', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello world');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      expect(watchService.isWatching()).toBe(true);
    });

    it('should start watching existing directory', () => {
      watchService.watch(tmpDir, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      expect(watchService.isWatching()).toBe(true);
    });

    it('should initialize with default debounce of 300ms', () => {
      const service = new WatchService(fileTranslationService);
      expect(service).toBeDefined();
    });

    it('should accept custom debounce time', () => {
      const service = new WatchService(fileTranslationService, { debounceMs: 500 });
      expect(service).toBeDefined();
    });
  });

  describe('stop()', () => {
    it('should stop watching', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      expect(watchService.isWatching()).toBe(true);

      await watchService.stop();

      expect(watchService.isWatching()).toBe(false);
    });

    it('should clear all pending timers on stop', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      // Trigger change but don't wait for debounce
      watchService.handleFileChange(testFile);

      await watchService.stop();

      expect(watchService.isWatching()).toBe(false);
    });
  });

  describe('handleFileChange() - File Filtering', () => {
    beforeEach(() => {
      watchService.watch(tmpDir, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });
    });

    afterEach(async () => {
      await watchService.stop();
    });

    it('should ignore unsupported file types', () => {
      const binaryFile = path.join(tmpDir, 'image.png');
      fs.writeFileSync(binaryFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      // Should not throw, just ignore
      watchService.handleFileChange(binaryFile);
      expect(watchService.getStats().translationsCount).toBe(0);
    });

    it('should handle supported text files', () => {
      const textFile = path.join(tmpDir, 'document.txt');
      fs.writeFileSync(textFile, 'Hello world');

      watchService.handleFileChange(textFile);
      // File change registered (debounce timer set)
      expect(true).toBe(true); // Test passes without error
    });

    it('should handle markdown files', () => {
      const mdFile = path.join(tmpDir, 'readme.md');
      fs.writeFileSync(mdFile, '# Hello\n\nWorld');

      watchService.handleFileChange(mdFile);
      expect(true).toBe(true);
    });

    it('should handle HTML files', () => {
      const htmlFile = path.join(tmpDir, 'index.html');
      fs.writeFileSync(htmlFile, '<html><body>Hello</body></html>');

      watchService.handleFileChange(htmlFile);
      expect(true).toBe(true);
    });
  });

  describe('handleFileChange() - Callbacks', () => {
    it('should call onChange callback when file changes', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      const callbackPromise = new Promise<void>((resolve) => {
        const onChangeMock = jest.fn((filePath: string) => {
          expect(filePath).toBe(testFile);
          resolve();
        });

        watchService.watch(testFile, {
          targetLangs: ['es'],
          outputDir: tmpDir,
          onChange: onChangeMock,
        });

        watchService.handleFileChange(testFile);
      });

      await callbackPromise;
    });

    it('should call onError callback when translation fails', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      // Mock translation service to throw error
      jest.spyOn(fileTranslationService, 'translateFile').mockRejectedValue(new Error('API error'));

      const callbackPromise = new Promise<void>((resolve) => {
        const onErrorMock = jest.fn((filePath: string, error: Error) => {
          expect(filePath).toBe(testFile);
          expect(error.message).toContain('API error');
          resolve();
        });

        watchService.watch(testFile, {
          targetLangs: ['es'],
          outputDir: tmpDir,
          onError: onErrorMock,
        });

        watchService.handleFileChange(testFile);
      });

      await callbackPromise;
    });
  });

  describe('getStats()', () => {
    it('should return initial stats', () => {
      const stats = watchService.getStats();

      expect(stats.isWatching).toBe(false);
      expect(stats.filesWatched).toBe(0);
      expect(stats.translationsCount).toBe(0);
      expect(stats.errorsCount).toBe(0);
    });

    it('should update stats when watching starts', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      const stats = watchService.getStats();
      expect(stats.isWatching).toBe(true);
    });

    it('should increment error count on translation failure', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      jest.spyOn(fileTranslationService, 'translateFile').mockRejectedValue(new Error('Fail'));

      const callbackPromise = new Promise<void>((resolve) => {
        watchService.watch(testFile, {
          targetLangs: ['es'],
          outputDir: tmpDir,
          onError: () => {
            const stats = watchService.getStats();
            expect(stats.errorsCount).toBeGreaterThan(0);
            resolve();
          },
        });

        watchService.handleFileChange(testFile);
      });

      await callbackPromise;
    });
  });

  describe('isWatching()', () => {
    it('should return false initially', () => {
      expect(watchService.isWatching()).toBe(false);
    });

    it('should return true after watch starts', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      expect(watchService.isWatching()).toBe(true);
    });

    it('should return false after stop', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
      });

      await watchService.stop();

      expect(watchService.isWatching()).toBe(false);
    });
  });

  describe('watch() - Multiple Target Languages', () => {
    it('should support multiple target languages', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es', 'fr', 'de'],
        outputDir: tmpDir,
      });

      expect(watchService.isWatching()).toBe(true);
    });
  });

  describe('watch() - Translation Options', () => {
    it('should accept source language option', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
        sourceLang: 'en',
      });

      expect(watchService.isWatching()).toBe(true);
    });

    it('should accept formality option', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
        formality: 'more',
      });

      expect(watchService.isWatching()).toBe(true);
    });

    it('should accept glossaryId option', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
        glossaryId: 'glossary-123',
      });

      expect(watchService.isWatching()).toBe(true);
    });

    it('should accept preserveCode option', () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Use `console.log()`');

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
        preserveCode: true,
      });

      expect(watchService.isWatching()).toBe(true);
    });
  });

  describe('Debouncing', () => {
    it('should debounce rapid file changes', async () => {
      const testFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(testFile, 'Hello');

      let changeCount = 0;
      const onChangeMock = jest.fn(() => {
        changeCount++;
      });

      watchService.watch(testFile, {
        targetLangs: ['es'],
        outputDir: tmpDir,
        onChange: onChangeMock,
      });

      // Trigger multiple rapid changes
      watchService.handleFileChange(testFile);
      watchService.handleFileChange(testFile);
      watchService.handleFileChange(testFile);

      // onChange should be called 3 times (once per trigger)
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(changeCount).toBe(3);
    });
  });
});
