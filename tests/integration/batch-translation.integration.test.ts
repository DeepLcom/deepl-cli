/**
 * Integration Tests for Batch Translation Service
 * Tests parallel file translation with progress tracking and error recovery
 */

// Import fs and path BEFORE mocks since they're needed in mock implementation
import * as fs from 'fs';
import * as path from 'path';

// Mock p-limit BEFORE other imports - return a factory function
jest.mock('p-limit', () => ({
  __esModule: true,
  default: (_concurrency: number) => {
    // Return a limit function that executes tasks immediately (ignoring concurrency for tests)
    return (fn: () => Promise<any>) => fn();
  },
}));

// Mock fast-glob with implementation inline
jest.mock('fast-glob', () => ({
  __esModule: true,
  default: async (pattern: string | string[], options: any) => {
    // Simple mock implementation that scans directories
    const globPattern = (Array.isArray(pattern) ? pattern[0] : pattern) || '';

    // Extract base directory from pattern by removing glob parts
    let baseDir = globPattern;
    if (baseDir.includes('**')) {
      baseDir = baseDir.split('**')[0] || '';
    }
    baseDir = baseDir.replace(/[/*]+$/, '');

    if (!baseDir || !fs.existsSync(baseDir)) {
      return [];
    }

    // Recursively scan directory
    const scanDir = (dir: string, currentDepth: number = 0): string[] => {
      if (!fs.existsSync(dir)) return [];

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Check depth limit
          if (options.deep === undefined || options.deep === null || currentDepth < options.deep - 1) {
            files.push(...scanDir(fullPath, currentDepth + 1));
          }
        } else if (entry.isFile()) {
          // Pattern matching
          if (globPattern.includes('*.txt') && !fullPath.endsWith('.txt')) {
            continue;
          }
          if (globPattern.includes('*.md') && !fullPath.endsWith('.md')) {
            continue;
          }

          files.push(options.absolute ? fullPath : path.relative(baseDir, fullPath));
        }
      }

      return files;
    };

    return scanDir(baseDir, 1);
  },
}));

import * as os from 'os';
import { BatchTranslationService } from '../../src/services/batch-translation.js';
import { FileTranslationService } from '../../src/services/file-translation.js';
import { TranslationService } from '../../src/services/translation.js';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { ConfigService } from '../../src/storage/config.js';

describe('Batch Translation Service Integration', () => {
  const API_KEY = 'test-api-key-123:fx';
  let batchService: BatchTranslationService;
  let fileTranslationService: FileTranslationService;
  let translationService: TranslationService;
  let client: DeepLClient;
  let mockConfig: ConfigService;
  let tmpDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-batch-test-'));

    // Set up services
    client = new DeepLClient(API_KEY);
    mockConfig = {
      get: () => ({
        auth: {},
        api: { baseUrl: '', usePro: false },
        defaults: { targetLangs: [], formality: 'default', preserveFormatting: false },
        cache: { enabled: true },
        output: { format: 'text', color: true },
        proxy: {},
      }),
      getValue: () => true,
    } as unknown as ConfigService;

    translationService = new TranslationService(client, mockConfig);
    fileTranslationService = new FileTranslationService(translationService);
    batchService = new BatchTranslationService(fileTranslationService);
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create service with default concurrency', () => {
      const service = new BatchTranslationService(fileTranslationService);
      expect(service).toBeInstanceOf(BatchTranslationService);
    });

    it('should create service with custom concurrency', () => {
      const service = new BatchTranslationService(fileTranslationService, { concurrency: 10 });
      expect(service).toBeInstanceOf(BatchTranslationService);
    });

    it('should throw error for concurrency less than 1', () => {
      expect(() => {
        new BatchTranslationService(fileTranslationService, { concurrency: 0 });
      }).toThrow('Concurrency must be at least 1');
    });

    it('should throw error for concurrency greater than 100', () => {
      expect(() => {
        new BatchTranslationService(fileTranslationService, { concurrency: 101 });
      }).toThrow('Concurrency cannot exceed 100');
    });

    it('should accept concurrency of 1', () => {
      const service = new BatchTranslationService(fileTranslationService, { concurrency: 1 });
      expect(service).toBeInstanceOf(BatchTranslationService);
    });

    it('should accept concurrency of 100', () => {
      const service = new BatchTranslationService(fileTranslationService, { concurrency: 100 });
      expect(service).toBeInstanceOf(BatchTranslationService);
    });
  });

  describe('translateFiles', () => {
    it('should return empty result for empty file list', async () => {
      const result = await batchService.translateFiles([], { targetLang: 'es' });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('should translate multiple files', async () => {
      // Create test files
      const file1 = path.join(tmpDir, 'file1.txt');
      const file2 = path.join(tmpDir, 'file2.txt');
      fs.writeFileSync(file1, 'Hello world');
      fs.writeFileSync(file2, 'Good morning');

      // Mock translation
      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola mundo',
      });

      const result = await batchService.translateFiles(
        [file1, file2],
        { targetLang: 'es' },
        { outputDir: tmpDir }
      );

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });

    it('should skip unsupported file types', async () => {
      const txtFile = path.join(tmpDir, 'test.txt');
      const pdfFile = path.join(tmpDir, 'test.pdf');
      fs.writeFileSync(txtFile, 'Hello');
      fs.writeFileSync(pdfFile, Buffer.from([0x25, 0x50, 0x44, 0x46]));

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateFiles(
        [txtFile, pdfFile],
        { targetLang: 'es' },
        { outputDir: tmpDir }
      );

      expect(result.successful).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.file).toBe(pdfFile);
      expect(result.skipped[0]?.reason).toBe('Unsupported file type');
    });

    it('should handle translation errors', async () => {
      const file1 = path.join(tmpDir, 'file1.txt');
      const file2 = path.join(tmpDir, 'file2.txt');
      fs.writeFileSync(file1, 'Hello');
      fs.writeFileSync(file2, 'World');

      // First translation succeeds, second fails
      jest.spyOn(translationService, 'translate')
        .mockResolvedValueOnce({ text: 'Hola' })
        .mockRejectedValueOnce(new Error('API error'));

      const result = await batchService.translateFiles(
        [file1, file2],
        { targetLang: 'es' },
        { outputDir: tmpDir }
      );

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.file).toBe(file2);
      expect(result.failed[0]?.error).toContain('API error');
    });

    it('should call progress callback', async () => {
      const file1 = path.join(tmpDir, 'file1.txt');
      const file2 = path.join(tmpDir, 'file2.txt');
      fs.writeFileSync(file1, 'Hello');
      fs.writeFileSync(file2, 'World');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const progressCalls: Array<{ completed: number; total: number; current?: string }> = [];
      const onProgress = jest.fn((progress) => {
        progressCalls.push(progress);
      });

      await batchService.translateFiles(
        [file1, file2],
        { targetLang: 'es' },
        { outputDir: tmpDir, onProgress }
      );

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]?.total).toBe(2);
      expect(progressCalls[1]?.total).toBe(2);
      expect(progressCalls[1]?.completed).toBe(2);
    });

    it('should generate default output paths', async () => {
      const file = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(file, 'Hello');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateFiles(
        [file],
        { targetLang: 'es' },
        { outputDir: tmpDir }
      );

      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]?.outputPath).toBe(path.join(tmpDir, 'test.es.txt'));
    });

    it('should use custom output pattern', async () => {
      const file = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(file, 'Hello');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateFiles(
        [file],
        { targetLang: 'es' },
        { outputDir: tmpDir, outputPattern: '{name}-{lang}{ext}' }
      );

      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]?.outputPath).toBe(path.join(tmpDir, 'test-es.txt'));
    });

    it('should preserve directory structure when baseDir is provided', async () => {
      const subDir = path.join(tmpDir, 'sub', 'nested');
      fs.mkdirSync(subDir, { recursive: true });
      const file = path.join(subDir, 'test.txt');
      fs.writeFileSync(file, 'Hello');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const outputDir = path.join(tmpDir, 'output');
      const result = await batchService.translateFiles(
        [file],
        { targetLang: 'es' },
        { outputDir, baseDir: tmpDir }
      );

      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]?.outputPath).toBe(
        path.join(outputDir, 'sub', 'nested', 'test.es.txt')
      );
    });
  });

  describe('translateDirectory', () => {
    it('should throw error for non-existent directory', async () => {
      await expect(
        batchService.translateDirectory('/nonexistent', { targetLang: 'es' })
      ).rejects.toThrow('Directory not found');
    });

    it('should throw error when path is not a directory', async () => {
      const file = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(file, 'Hello');

      await expect(
        batchService.translateDirectory(file, { targetLang: 'es' })
      ).rejects.toThrow('Not a directory');
    });

    it('should translate all files in directory', async () => {
      // Create test files
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'Hello');
      fs.writeFileSync(path.join(tmpDir, 'file2.md'), '# World');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateDirectory(
        tmpDir,
        { targetLang: 'es' },
        { outputDir: tmpDir }
      );

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should filter to only supported file types', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'Hello');
      fs.writeFileSync(path.join(tmpDir, 'file2.pdf'), Buffer.from([0x25]));
      fs.writeFileSync(path.join(tmpDir, 'file3.md'), '# World');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateDirectory(
        tmpDir,
        { targetLang: 'es' },
        { outputDir: tmpDir }
      );

      // Only .txt and .md should be translated
      expect(result.successful).toHaveLength(2);
    });

    it('should respect recursive option (false)', async () => {
      fs.writeFileSync(path.join(tmpDir, 'root.txt'), 'Root');

      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateDirectory(
        tmpDir,
        { targetLang: 'es' },
        { outputDir: tmpDir, recursive: false }
      );

      // Only root.txt should be found
      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]?.file).toBe(path.join(tmpDir, 'root.txt'));
    });

    it('should respect recursive option (true, default)', async () => {
      fs.writeFileSync(path.join(tmpDir, 'root.txt'), 'Root');

      const subDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(subDir, 'nested.txt'), 'Nested');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateDirectory(
        tmpDir,
        { targetLang: 'es' },
        { outputDir: tmpDir, recursive: true }
      );

      // Both files should be found
      expect(result.successful).toHaveLength(2);
    });

    it('should use custom pattern for file filtering', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'Hello');
      fs.writeFileSync(path.join(tmpDir, 'file2.md'), '# World');

      jest.spyOn(translationService, 'translate').mockResolvedValue({
        text: 'Hola',
      });

      const result = await batchService.translateDirectory(
        tmpDir,
        { targetLang: 'es' },
        { outputDir: tmpDir, pattern: '*.txt' }
      );

      // Only .txt files should be matched
      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]?.file).toBe(path.join(tmpDir, 'file1.txt'));
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics correctly', () => {
      const result = {
        successful: [{ file: 'a', outputPath: 'a.es' }, { file: 'b', outputPath: 'b.es' }],
        failed: [{ file: 'c', error: 'Error' }],
        skipped: [{ file: 'd', reason: 'Unsupported' }, { file: 'e', reason: 'Unsupported' }],
      };

      const stats = batchService.getStatistics(result);

      expect(stats.total).toBe(5);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.skipped).toBe(2);
    });

    it('should return zero statistics for empty result', () => {
      const result = {
        successful: [],
        failed: [],
        skipped: [],
      };

      const stats = batchService.getStatistics(result);

      expect(stats.total).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
    });
  });
});
