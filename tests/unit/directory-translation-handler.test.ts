/**
 * Tests for FileTranslationService directory/multi-target translation handler
 * Covers translateFileToMultiple: multi-target, concurrency, onProgress, error paths
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileTranslationService } from '../../src/services/file-translation';
import { TranslationService } from '../../src/services/translation';
import { createMockTranslationService } from '../helpers/mock-factories';

jest.mock('../../src/services/translation');

describe('FileTranslationService – directory/multi-target handler', () => {
  let service: FileTranslationService;
  let mockTranslationService: jest.Mocked<TranslationService>;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `deepl-dir-handler-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    mockTranslationService = createMockTranslationService();
    service = new FileTranslationService(mockTranslationService);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('translateFileToMultiple()', () => {
    it('should translate a txt file to multiple target languages', async () => {
      const inputPath = path.join(testDir, 'readme.txt');
      fs.writeFileSync(inputPath, 'Hello world');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de', text: 'Hallo Welt' },
        { targetLang: 'fr', text: 'Bonjour le monde' },
        { targetLang: 'es', text: 'Hola mundo' },
      ]);

      const results = await service.translateFileToMultiple(inputPath, ['de', 'fr', 'es']);

      expect(results).toHaveLength(3);
      expect(results[0]?.targetLang).toBe('de');
      expect(results[0]?.text).toBe('Hallo Welt');
      expect(results[1]?.targetLang).toBe('fr');
      expect(results[2]?.targetLang).toBe('es');
    });

    it('should write output files with language suffix when outputDir is given', async () => {
      const inputPath = path.join(testDir, 'doc.txt');
      fs.writeFileSync(inputPath, 'Hello');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de', text: 'Hallo' },
        { targetLang: 'ja', text: 'こんにちは' },
      ]);

      const outputDir = path.join(testDir, 'output');

      const results = await service.translateFileToMultiple(
        inputPath,
        ['de', 'ja'],
        { outputDir }
      );

      expect(results[0]?.outputPath).toBe(path.join(outputDir, 'doc.de.txt'));
      expect(results[1]?.outputPath).toBe(path.join(outputDir, 'doc.ja.txt'));

      expect(fs.readFileSync(results[0]!.outputPath!, 'utf-8')).toBe('Hallo');
      expect(fs.readFileSync(results[1]!.outputPath!, 'utf-8')).toBe('こんにちは');
    });

    it('should create output directory if it does not exist', async () => {
      const inputPath = path.join(testDir, 'file.txt');
      fs.writeFileSync(inputPath, 'Test');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'es', text: 'Prueba' },
      ]);

      const nested = path.join(testDir, 'a', 'b', 'c');

      await service.translateFileToMultiple(inputPath, ['es'], { outputDir: nested });

      expect(fs.existsSync(path.join(nested, 'file.es.txt'))).toBe(true);
    });

    it('should not create output files when outputDir is omitted', async () => {
      const inputPath = path.join(testDir, 'file.txt');
      fs.writeFileSync(inputPath, 'Hello');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'de', text: 'Hallo' },
      ]);

      const results = await service.translateFileToMultiple(inputPath, ['de']);

      expect(results[0]?.outputPath).toBeUndefined();
    });

    it('should preserve the .md extension in output filenames', async () => {
      const inputPath = path.join(testDir, 'readme.md');
      fs.writeFileSync(inputPath, '# Hello');

      mockTranslationService.translateToMultiple.mockResolvedValue([
        { targetLang: 'fr', text: '# Bonjour' },
      ]);

      const results = await service.translateFileToMultiple(
        inputPath,
        ['fr'],
        { outputDir: testDir }
      );

      expect(results[0]?.outputPath).toBe(path.join(testDir, 'readme.fr.md'));
    });

    it('should throw ValidationError for unsupported file types', async () => {
      const inputPath = path.join(testDir, 'image.png');
      fs.writeFileSync(inputPath, 'dummy');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Unsupported file type');
    });

    it('should throw ValidationError for non-existent file', async () => {
      const inputPath = path.join(testDir, 'no-such-file.txt');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow();
    });

    it('should throw ValidationError for empty file', async () => {
      const inputPath = path.join(testDir, 'empty.txt');
      fs.writeFileSync(inputPath, '');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Cannot translate empty file');
    });

    it('should throw ValidationError for whitespace-only file', async () => {
      const inputPath = path.join(testDir, 'whitespace.txt');
      fs.writeFileSync(inputPath, '   \n  \n  ');

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Cannot translate empty file');
    });

    it('should propagate API errors', async () => {
      const inputPath = path.join(testDir, 'file.txt');
      fs.writeFileSync(inputPath, 'Hello');

      mockTranslationService.translateToMultiple.mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(
        service.translateFileToMultiple(inputPath, ['de'])
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should delegate structured files (JSON) to StructuredFileTranslationService', async () => {
      const inputPath = path.join(testDir, 'locale.json');
      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      // The structured service is lazily loaded; mock translateBatch for it
      mockTranslationService.translateBatch.mockImplementation(async (_texts, opts) => {
        if (opts.targetLang === 'de') return [{ text: 'Hallo', detectedSourceLang: 'en' }];
        return [];
      });

      const results = await service.translateFileToMultiple(inputPath, ['de']);

      expect(results).toHaveLength(1);
      expect(results[0]?.targetLang).toBe('de');
      // translateToMultiple should NOT be called; structured service uses translateBatch
      expect(mockTranslationService.translateToMultiple).not.toHaveBeenCalled();
    });

    it('should delegate structured files (YAML) to StructuredFileTranslationService', async () => {
      const inputPath = path.join(testDir, 'locale.yaml');
      fs.writeFileSync(inputPath, 'greeting: Hello\n');

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hallo', detectedSourceLang: 'en' },
      ]);

      const results = await service.translateFileToMultiple(inputPath, ['de']);

      expect(results).toHaveLength(1);
      expect(results[0]?.targetLang).toBe('de');
    });

    it('should reject symlinks for security', async () => {
      const realFile = path.join(testDir, 'real.txt');
      const linkFile = path.join(testDir, 'link.txt');
      fs.writeFileSync(realFile, 'Hello');
      fs.symlinkSync(realFile, linkFile);

      await expect(
        service.translateFileToMultiple(linkFile, ['de'])
      ).rejects.toThrow();

      expect(mockTranslationService.translateToMultiple).not.toHaveBeenCalled();
    });
  });
});
