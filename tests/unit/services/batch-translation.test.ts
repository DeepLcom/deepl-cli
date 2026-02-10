/**
 * Tests for Batch Translation Service
 * Following TDD approach - RED phase
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BatchTranslationService } from '../../../src/services/batch-translation';
import { FileTranslationService } from '../../../src/services/file-translation';
import pLimit from 'p-limit';
import fg from 'fast-glob';
import { createMockFileTranslationService } from '../../helpers/mock-factories';

// Mock ESM modules
jest.mock('p-limit');
jest.mock('fast-glob');

// Mock FileTranslationService
jest.mock('../../../src/services/file-translation');

const mockPLimit = pLimit as jest.MockedFunction<typeof pLimit>;
const mockFastGlob = fg as jest.MockedFunction<typeof fg>;

describe('BatchTranslationService', () => {
  let batchTranslationService: BatchTranslationService;
  let mockFileTranslationService: jest.Mocked<FileTranslationService>;
  let testDir: string;

  beforeEach(() => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `deepl-batch-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Mock p-limit to execute tasks immediately
    (mockPLimit as any).mockImplementation((_concurrency: number) => {
      return (fn: () => Promise<any>) => fn();
    });

    mockFileTranslationService = createMockFileTranslationService({
      getSupportedFileTypes: jest.fn().mockReturnValue(['.txt', '.md']),
      isSupportedFile: jest.fn((filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        return ['.txt', '.md'].includes(ext);
      }),
    });

    batchTranslationService = new BatchTranslationService(
      mockFileTranslationService
    );
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create a BatchTranslationService instance', () => {
      expect(batchTranslationService).toBeInstanceOf(BatchTranslationService);
    });

    it('should accept custom concurrency limit', () => {
      const service = new BatchTranslationService(
        mockFileTranslationService,
        { concurrency: 5 }
      );
      expect(service).toBeInstanceOf(BatchTranslationService);
    });
  });

  describe('translateFiles()', () => {
    it('should translate multiple files in parallel', async () => {
      const files = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.txt'),
        path.join(testDir, 'file3.txt'),
      ];

      // Create test files
      files.forEach((file, i) => {
        fs.writeFileSync(file, `Content ${i + 1}`);
      });

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const results = await batchTranslationService.translateFiles(
        files,
        { targetLang: 'es' },
        { outputDir: testDir }
      );

      expect(results.successful).toHaveLength(3);
      expect(results.failed).toHaveLength(0);
      expect(mockFileTranslationService.translateFile).toHaveBeenCalledTimes(3);
    });

    it('should handle errors gracefully and continue processing', async () => {
      const files = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.txt'),
        path.join(testDir, 'file3.txt'),
      ];

      files.forEach((file, i) => {
        fs.writeFileSync(file, `Content ${i + 1}`);
      });

      // Make second file fail
      mockFileTranslationService.translateFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Translation failed'))
        .mockResolvedValueOnce(undefined);

      const results = await batchTranslationService.translateFiles(
        files,
        { targetLang: 'es' },
        { outputDir: testDir }
      );

      expect(results.successful).toHaveLength(2);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0]?.file).toBe(files[1]);
      expect(results.failed[0]?.error).toContain('Translation failed');
    });

    // Note: We don't test p-limit's concurrency behavior as it's a well-tested
    // third-party library. Concurrency limiting should be verified through manual
    // testing: `deepl translate ./large-dir --concurrency 3`

    it('should filter out unsupported file types', async () => {
      const files = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.pdf'),
        path.join(testDir, 'file3.md'),
      ];

      files.forEach((file, i) => {
        fs.writeFileSync(file, `Content ${i + 1}`);
      });

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const results = await batchTranslationService.translateFiles(
        files,
        { targetLang: 'es' },
        { outputDir: testDir }
      );

      expect(results.successful).toHaveLength(2);
      expect(results.skipped).toHaveLength(1);
      expect(results.skipped[0]?.file).toBe(files[1]);
      expect(mockFileTranslationService.translateFile).toHaveBeenCalledTimes(2);
    });

    it('should generate output paths based on input files', async () => {
      const files = [path.join(testDir, 'input.txt')];
      fs.writeFileSync(files[0]!, 'Content');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      await batchTranslationService.translateFiles(
        files,
        { targetLang: 'es' },
        { outputDir: testDir }
      );

      expect(mockFileTranslationService.translateFile).toHaveBeenCalledWith(
        files[0],
        path.join(testDir, 'input.es.txt'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should support custom output filename pattern', async () => {
      const files = [path.join(testDir, 'input.txt')];
      fs.writeFileSync(files[0]!, 'Content');

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      await batchTranslationService.translateFiles(
        files,
        { targetLang: 'es' },
        {
          outputDir: testDir,
          outputPattern: '{name}-translated-{lang}{ext}',
        }
      );

      expect(mockFileTranslationService.translateFile).toHaveBeenCalledWith(
        files[0],
        path.join(testDir, 'input-translated-es.txt'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should handle empty file list', async () => {
      const results = await batchTranslationService.translateFiles(
        [],
        { targetLang: 'es' },
        { outputDir: testDir }
      );

      expect(results.successful).toHaveLength(0);
      expect(results.failed).toHaveLength(0);
      expect(results.skipped).toHaveLength(0);
    });

    it('should call progress callback during translation', async () => {
      const files = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.txt'),
      ];

      files.forEach((file, i) => {
        fs.writeFileSync(file, `Content ${i + 1}`);
      });

      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const progressCalls: any[] = [];
      const onProgress = jest.fn((progress) => {
        progressCalls.push({ ...progress });
      });

      await batchTranslationService.translateFiles(
        files,
        { targetLang: 'es' },
        { outputDir: testDir, onProgress }
      );

      expect(onProgress).toHaveBeenCalled();
      expect(progressCalls[progressCalls.length - 1]?.completed).toBe(2);
      expect(progressCalls[progressCalls.length - 1]?.total).toBe(2);
    });
  });

  describe('translateDirectory()', () => {
    it('should translate all supported files in a directory', async () => {
      const inputDir = path.join(testDir, 'input');
      const outputDir = path.join(testDir, 'output');

      fs.mkdirSync(inputDir);

      const files = ['file1.txt', 'file2.md', 'file3.txt'];
      const absoluteFiles = files.map(f => path.join(inputDir, f));
      files.forEach(file => {
        fs.writeFileSync(path.join(inputDir, file), 'Content');
      });

      mockFastGlob.mockResolvedValue(absoluteFiles);
      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const results = await batchTranslationService.translateDirectory(
        inputDir,
        { targetLang: 'es' },
        { outputDir }
      );

      expect(results.successful).toHaveLength(3);
      expect(mockFileTranslationService.translateFile).toHaveBeenCalledTimes(3);
    });

    it('should handle subdirectories when recursive option is enabled', async () => {
      const inputDir = path.join(testDir, 'input');
      const outputDir = path.join(testDir, 'output');

      fs.mkdirSync(inputDir);
      fs.mkdirSync(path.join(inputDir, 'sub1'));
      fs.mkdirSync(path.join(inputDir, 'sub2'));

      const absoluteFiles = [
        path.join(inputDir, 'file1.txt'),
        path.join(inputDir, 'sub1', 'file2.txt'),
        path.join(inputDir, 'sub2', 'file3.txt'),
      ];
      absoluteFiles.forEach(file => fs.writeFileSync(file, 'Content'));

      mockFastGlob.mockResolvedValue(absoluteFiles);
      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const results = await batchTranslationService.translateDirectory(
        inputDir,
        { targetLang: 'es' },
        { outputDir, recursive: true }
      );

      expect(results.successful).toHaveLength(3);
    });

    it('should not process subdirectories when recursive is false', async () => {
      const inputDir = path.join(testDir, 'input');
      const outputDir = path.join(testDir, 'output');

      fs.mkdirSync(inputDir);
      fs.mkdirSync(path.join(inputDir, 'sub'));

      fs.writeFileSync(path.join(inputDir, 'file1.txt'), 'Content');
      fs.writeFileSync(path.join(inputDir, 'sub', 'file2.txt'), 'Content');

      mockFastGlob.mockResolvedValue([path.join(inputDir, 'file1.txt')]);
      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const results = await batchTranslationService.translateDirectory(
        inputDir,
        { targetLang: 'es' },
        { outputDir, recursive: false }
      );

      expect(results.successful).toHaveLength(1);
      expect(mockFileTranslationService.translateFile).toHaveBeenCalledTimes(1);
    });

    it('should throw error for non-existent directory', async () => {
      const inputDir = path.join(testDir, 'nonexistent');
      const outputDir = path.join(testDir, 'output');

      await expect(
        batchTranslationService.translateDirectory(
          inputDir,
          { targetLang: 'es' },
          { outputDir }
        )
      ).rejects.toThrow('not found');
    });

    it('should preserve directory structure in output', async () => {
      const inputDir = path.join(testDir, 'input');
      const outputDir = path.join(testDir, 'output');

      fs.mkdirSync(inputDir);
      fs.mkdirSync(path.join(inputDir, 'sub'));

      const absoluteFiles = [
        path.join(inputDir, 'file1.txt'),
        path.join(inputDir, 'sub', 'file2.txt'),
      ];
      absoluteFiles.forEach(file => fs.writeFileSync(file, 'Content'));

      mockFastGlob.mockResolvedValue(absoluteFiles);
      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      await batchTranslationService.translateDirectory(
        inputDir,
        { targetLang: 'es' },
        { outputDir, recursive: true }
      );

      const calls = mockFileTranslationService.translateFile.mock.calls;
      expect(calls[0]?.[1]).toBe(path.join(outputDir, 'file1.es.txt'));
      expect(calls[1]?.[1]).toBe(path.join(outputDir, 'sub', 'file2.es.txt'));
    });

    it('should support glob patterns', async () => {
      const inputDir = path.join(testDir, 'input');
      const outputDir = path.join(testDir, 'output');

      fs.mkdirSync(inputDir);

      fs.writeFileSync(path.join(inputDir, 'file1.txt'), 'Content');
      fs.writeFileSync(path.join(inputDir, 'file2.md'), 'Content');
      fs.writeFileSync(path.join(inputDir, 'file3.txt'), 'Content');

      const txtFiles = [
        path.join(inputDir, 'file1.txt'),
        path.join(inputDir, 'file3.txt'),
      ];
      mockFastGlob.mockResolvedValue(txtFiles);
      mockFileTranslationService.translateFile.mockResolvedValue(undefined);

      const results = await batchTranslationService.translateDirectory(
        inputDir,
        { targetLang: 'es' },
        { outputDir, pattern: '*.txt' }
      );

      expect(results.successful).toHaveLength(2);
      expect(mockFileTranslationService.translateFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStatistics()', () => {
    it('should return statistics from batch translation results', () => {
      const results = {
        successful: [{ file: 'file1.txt', outputPath: 'file1.es.txt' }],
        failed: [{ file: 'file2.txt', error: 'Error' }],
        skipped: [{ file: 'file3.pdf', reason: 'Unsupported' }],
      };

      const stats = batchTranslationService.getStatistics(results);

      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.skipped).toBe(1);
    });
  });
});
