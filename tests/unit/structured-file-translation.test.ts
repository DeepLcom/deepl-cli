/**
 * Tests for StructuredFileTranslationService
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StructuredFileTranslationService } from '../../src/services/structured-file-translation';
import { TranslationService } from '../../src/services/translation';
import { NetworkError } from '../../src/utils/errors';
import { createMockTranslationService } from '../helpers/mock-factories';

jest.mock('../../src/services/translation');

describe('StructuredFileTranslationService', () => {
  let service: StructuredFileTranslationService;
  let mockTranslationService: jest.Mocked<TranslationService>;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `deepl-structured-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    mockTranslationService = createMockTranslationService();

    service = new StructuredFileTranslationService(mockTranslationService);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('isStructuredFile()', () => {
    it('should return true for .json files', () => {
      expect(service.isStructuredFile('locales/en.json')).toBe(true);
    });

    it('should return true for .yaml files', () => {
      expect(service.isStructuredFile('config.yaml')).toBe(true);
    });

    it('should return true for .yml files', () => {
      expect(service.isStructuredFile('config.yml')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(service.isStructuredFile('FILE.JSON')).toBe(true);
      expect(service.isStructuredFile('FILE.YAML')).toBe(true);
      expect(service.isStructuredFile('FILE.YML')).toBe(true);
    });

    it('should return false for non-structured file types', () => {
      expect(service.isStructuredFile('readme.md')).toBe(false);
      expect(service.isStructuredFile('file.txt')).toBe(false);
      expect(service.isStructuredFile('doc.pdf')).toBe(false);
    });
  });

  describe('JSON translation', () => {
    it('should translate flat JSON object', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            greeting: 'Hello',
            farewell: 'Goodbye',
          },
          null,
          2
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
        { text: 'Adiós', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(output.greeting).toBe('Hola');
      expect(output.farewell).toBe('Adiós');
    });

    it('should translate nested JSON objects', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            nav: {
              home: 'Home',
              about: 'About',
            },
            footer: {
              copyright: 'All rights reserved',
            },
          },
          null,
          2
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Inicio', detectedSourceLang: 'en' },
        { text: 'Acerca de', detectedSourceLang: 'en' },
        { text: 'Todos los derechos reservados', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(output.nav.home).toBe('Inicio');
      expect(output.nav.about).toBe('Acerca de');
      expect(output.footer.copyright).toBe('Todos los derechos reservados');
    });

    it('should preserve non-string values (numbers, booleans, null)', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            label: 'Hello',
            count: 42,
            active: true,
            data: null,
          },
          null,
          2
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(output.label).toBe('Hola');
      expect(output.count).toBe(42);
      expect(output.active).toBe(true);
      expect(output.data).toBeNull();
    });

    it('should translate strings inside arrays', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            items: ['Apple', 'Banana'],
            mixed: ['Text', 42, true],
          },
          null,
          2
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Manzana', detectedSourceLang: 'en' },
        { text: 'Plátano', detectedSourceLang: 'en' },
        { text: 'Texto', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(output.items).toEqual(['Manzana', 'Plátano']);
      expect(output.mixed).toEqual(['Texto', 42, true]);
    });

    it('should preserve JSON indentation (2 spaces)', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('  "key"');
    });

    it('should preserve JSON indentation (4 spaces)', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 4));

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('    "key"');
    });

    it('should preserve JSON indentation (tab)', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(inputPath, '{\n\t"key": "Hello"\n}');

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('\t"key"');
    });

    it('should handle empty JSON object', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(inputPath, '{}');

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(output).toEqual({});
      expect(mockTranslationService.translateBatch).not.toHaveBeenCalled();
    });

    it('should throw on invalid JSON', async () => {
      const inputPath = path.join(testDir, 'bad.json');
      const outputPath = path.join(testDir, 'out.json');

      fs.writeFileSync(inputPath, '{ invalid json }');

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow();
    });

    it('should throw on empty file', async () => {
      const inputPath = path.join(testDir, 'empty.json');
      const outputPath = path.join(testDir, 'out.json');

      fs.writeFileSync(inputPath, '');

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Cannot translate empty file');
    });

    it('should handle deeply nested structures', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            a: { b: { c: { d: 'Deep value' } } },
          },
          null,
          2
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Valor profundo', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      expect(output.a.b.c.d).toBe('Valor profundo');
    });

    it('should preserve key order', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            zebra: 'Zebra',
            apple: 'Apple',
            mango: 'Mango',
          },
          null,
          2
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Cebra', detectedSourceLang: 'en' },
        { text: 'Manzana', detectedSourceLang: 'en' },
        { text: 'Mango', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      const zebraIdx = raw.indexOf('zebra');
      const appleIdx = raw.indexOf('apple');
      const mangoIdx = raw.indexOf('mango');
      expect(zebraIdx).toBeLessThan(appleIdx);
      expect(appleIdx).toBeLessThan(mangoIdx);
    });

    it('should add trailing newline to output', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify({ key: 'Hello' }, null, 2) + '\n'
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw.endsWith('\n')).toBe(true);
    });
  });

  describe('YAML translation', () => {
    it('should translate flat YAML', async () => {
      const inputPath = path.join(testDir, 'en.yaml');
      const outputPath = path.join(testDir, 'es.yaml');

      fs.writeFileSync(inputPath, 'greeting: Hello\nfarewell: Goodbye\n');

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
        { text: 'Adiós', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('greeting: Hola');
      expect(raw).toContain('farewell: Adiós');
    });

    it('should translate nested YAML', async () => {
      const inputPath = path.join(testDir, 'en.yaml');
      const outputPath = path.join(testDir, 'es.yaml');

      fs.writeFileSync(
        inputPath,
        [
          'nav:',
          '  home: Home',
          '  about: About',
          'footer:',
          '  copyright: All rights reserved',
          '',
        ].join('\n')
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Inicio', detectedSourceLang: 'en' },
        { text: 'Acerca de', detectedSourceLang: 'en' },
        { text: 'Todos los derechos reservados', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('home: Inicio');
      expect(raw).toContain('about: Acerca de');
      expect(raw).toContain('copyright: Todos los derechos reservados');
    });

    it('should preserve YAML comments', async () => {
      const inputPath = path.join(testDir, 'en.yaml');
      const outputPath = path.join(testDir, 'es.yaml');

      fs.writeFileSync(
        inputPath,
        [
          '# This is the main config',
          'greeting: Hello # inline comment',
          '# Section break',
          'farewell: Goodbye',
          '',
        ].join('\n')
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
        { text: 'Adiós', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('# This is the main config');
      expect(raw).toContain('# inline comment');
      expect(raw).toContain('# Section break');
    });

    it('should preserve non-string values in YAML', async () => {
      const inputPath = path.join(testDir, 'en.yaml');
      const outputPath = path.join(testDir, 'es.yaml');

      fs.writeFileSync(
        inputPath,
        ['label: Hello', 'count: 42', 'active: true', 'data: null', ''].join(
          '\n'
        )
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('label: Hola');
      expect(raw).toContain('count: 42');
      expect(raw).toContain('active: true');
      expect(raw).toContain('data: null');
    });

    it('should handle .yml extension', async () => {
      const inputPath = path.join(testDir, 'en.yml');
      const outputPath = path.join(testDir, 'es.yml');

      fs.writeFileSync(inputPath, 'greeting: Hello\n');

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('greeting: Hola');
    });

    it('should translate YAML arrays', async () => {
      const inputPath = path.join(testDir, 'en.yaml');
      const outputPath = path.join(testDir, 'es.yaml');

      fs.writeFileSync(
        inputPath,
        ['items:', '  - Apple', '  - Banana', ''].join('\n')
      );

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Manzana', detectedSourceLang: 'en' },
        { text: 'Plátano', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      const raw = fs.readFileSync(outputPath, 'utf-8');
      expect(raw).toContain('- Manzana');
      expect(raw).toContain('- Plátano');
    });

    it('should throw on invalid YAML', async () => {
      const inputPath = path.join(testDir, 'bad.yaml');
      const outputPath = path.join(testDir, 'out.yaml');

      fs.writeFileSync(inputPath, ':\n  :\n    - : :\n');

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow();
    });

    it('should handle empty YAML', async () => {
      const inputPath = path.join(testDir, 'empty.yaml');
      const outputPath = path.join(testDir, 'out.yaml');

      fs.writeFileSync(inputPath, '');

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Cannot translate empty file');
    });
  });

  describe('batching', () => {
    it('should batch strings well under 128KB into a single call', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      const data: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        data[`key${i}`] = `Value ${i}`;
      }
      fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

      const batchResults = Object.values(data).map((v) => ({
        text: `Translated ${v}`,
        detectedSourceLang: 'en' as const,
      }));

      mockTranslationService.translateBatch.mockResolvedValue(batchResults);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      expect(mockTranslationService.translateBatch).toHaveBeenCalledTimes(1);
      expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
        expect.arrayContaining(['Value 0']),
        expect.objectContaining({ targetLang: 'es' }),
        { skipCache: undefined }
      );
    });

    it('should split at TRANSLATE_BATCH_SIZE even when far under 128KB', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      const data: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        data[`key${i}`] = `Value ${i}`;
      }
      fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

      mockTranslationService.translateBatch.mockImplementation(
        (texts: string[]) =>
          Promise.resolve(texts.map((t) => ({ text: `Translated ${t}` })))
      );

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      expect(
        mockTranslationService.translateBatch.mock.calls.map((c) => c[0].length)
      ).toEqual([50, 50]);
    });

    it('should split strings into multiple batches when over 128KB', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      // Create data with large strings that exceed 128KB total
      const data: Record<string, string> = {};
      const bigStr = 'A'.repeat(50000); // ~50KB each
      data['key1'] = bigStr;
      data['key2'] = bigStr;
      data['key3'] = bigStr; // 150KB total > 128KB

      fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

      mockTranslationService.translateBatch
        .mockResolvedValueOnce([
          { text: 'T1', detectedSourceLang: 'en' },
          { text: 'T2', detectedSourceLang: 'en' },
        ])
        .mockResolvedValueOnce([{ text: 'T3', detectedSourceLang: 'en' }]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      expect(mockTranslationService.translateBatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('input size ceiling', () => {
    /**
     * Writes a JSON file of at least `bytes` without holding it in memory.
     * A real file is needed because the guard reads `fs.stat`, not the content.
     */
    function writeJsonOfSize(filePath: string, bytes: number): void {
      const handle = fs.openSync(filePath, 'w');
      try {
        fs.writeSync(handle, '{\n');
        let written = 2;
        let i = 0;
        while (written < bytes) {
          const line = `  "key_${i}": "value ${i}",\n`;
          fs.writeSync(handle, line);
          written += line.length;
          i += 1;
        }
        fs.writeSync(handle, '  "last": "value"\n}\n');
      } finally {
        fs.closeSync(handle);
      }
    }

    it('refuses a file over the ceiling before reading or translating it', async () => {
      const inputPath = path.join(testDir, 'huge.json');
      writeJsonOfSize(inputPath, 11 * 1024 * 1024);

      await expect(
        service.translateFile(inputPath, path.join(testDir, 'huge.de.json'), {
          targetLang: 'de',
        } as never)
      ).rejects.toThrow(/exceeds the maximum/i);
      expect(mockTranslationService.translateBatch).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(testDir, 'huge.de.json'))).toBe(false);
    });

    it('refuses it on the multi-target path too', async () => {
      const inputPath = path.join(testDir, 'huge-multi.json');
      writeJsonOfSize(inputPath, 11 * 1024 * 1024);

      await expect(
        service.translateFileToMultiple(inputPath, ['de', 'fr'], {
          outputDir: testDir,
        })
      ).rejects.toThrow(/exceeds the maximum/i);
      expect(mockTranslationService.translateBatch).not.toHaveBeenCalled();
    });

    it('names the size, the limit and a way forward', async () => {
      const inputPath = path.join(testDir, 'huge-msg.json');
      writeJsonOfSize(inputPath, 11 * 1024 * 1024);

      let error: unknown;
      expect.assertions(4);
      try {
        await service.translateFile(inputPath, path.join(testDir, 'out.json'), {
          targetLang: 'de',
        } as never);
      } catch (err) {
        error = err;
      }
      expect((error as Error).name).toBe('ValidationError');
      expect((error as Error).message).toMatch(/huge-msg\.json/);
      expect((error as Error).message).toMatch(/10 MiB/);
      expect((error as Error & { suggestion?: string }).suggestion).toMatch(
        /deepl sync/
      );
    });

    it('translates a file just under the ceiling', async () => {
      const inputPath = path.join(testDir, 'large-ok.json');
      writeJsonOfSize(inputPath, 9 * 1024 * 1024);
      mockTranslationService.translateBatch.mockImplementation(
        async (texts: string[]) =>
          texts.map((t) => ({ text: `[de] ${t}`, billedCharacters: t.length }))
      );

      await service.translateFile(
        inputPath,
        path.join(testDir, 'large-ok.de.json'),
        { targetLang: 'de' } as never
      );

      expect(fs.existsSync(path.join(testDir, 'large-ok.de.json'))).toBe(true);
    }, 120000);
  });

  describe('translateFileToMultiple()', () => {
    it('should translate to multiple target languages', async () => {
      const inputPath = path.join(testDir, 'en.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify({ greeting: 'Hello' }, null, 2)
      );

      mockTranslationService.translateBatch.mockImplementation(
        async (_texts, opts) => {
          if (opts.targetLang === 'es')
            return [{ text: 'Hola', detectedSourceLang: 'en' }];
          if (opts.targetLang === 'fr')
            return [{ text: 'Bonjour', detectedSourceLang: 'en' }];
          return [];
        }
      );

      const results = await service.translateFileToMultiple(inputPath, [
        'es',
        'fr',
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]?.targetLang).toBe('es');
      expect(results[1]?.targetLang).toBe('fr');
    });

    it('should write output files with language suffix', async () => {
      const inputPath = path.join(testDir, 'en.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify({ greeting: 'Hello' }, null, 2)
      );

      mockTranslationService.translateBatch.mockImplementation(
        async (_texts, opts) => {
          if (opts.targetLang === 'es')
            return [{ text: 'Hola', detectedSourceLang: 'en' }];
          if (opts.targetLang === 'fr')
            return [{ text: 'Bonjour', detectedSourceLang: 'en' }];
          return [];
        }
      );

      const results = await service.translateFileToMultiple(
        inputPath,
        ['es', 'fr'],
        { outputDir: testDir }
      );

      expect(results[0]?.outputPath).toContain('en.es.json');
      expect(results[1]?.outputPath).toContain('en.fr.json');

      const esContent = JSON.parse(
        fs.readFileSync(results[0]!.outputPath!, 'utf-8')
      );
      expect(esContent.greeting).toBe('Hola');
    });

    it('should run translations concurrently', async () => {
      const inputPath = path.join(testDir, 'en.json');
      fs.writeFileSync(
        inputPath,
        JSON.stringify({ greeting: 'Hello' }, null, 2)
      );

      let inflight = 0;
      let maxInflight = 0;

      mockTranslationService.translateBatch.mockImplementation(
        async (_texts, opts) => {
          inflight++;
          maxInflight = Math.max(maxInflight, inflight);
          await new Promise((r) => setTimeout(r, 10));
          inflight--;
          if (opts.targetLang === 'es')
            return [{ text: 'Hola', detectedSourceLang: 'en' }];
          if (opts.targetLang === 'fr')
            return [{ text: 'Bonjour', detectedSourceLang: 'en' }];
          return [];
        }
      );

      await service.translateFileToMultiple(inputPath, ['es', 'fr']);

      expect(maxInflight).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw for non-existent file', async () => {
      await expect(
        service.translateFile(
          path.join(testDir, 'nonexistent.json'),
          path.join(testDir, 'out.json'),
          { targetLang: 'es' }
        )
      ).rejects.toThrow();
    });

    it('should create output directory if needed', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'nested', 'dir', 'es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should pass translation options through to batch API', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(inputPath, JSON.stringify({ key: 'Hello' }, null, 2));

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, {
        targetLang: 'es',
        formality: 'more',
        glossaryId: 'g-123',
      });

      expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
        ['Hello'],
        expect.objectContaining({
          targetLang: 'es',
          formality: 'more',
          glossaryId: 'g-123',
        }),
        { skipCache: undefined }
      );
    });
  });

  describe('batch-mismatch error', () => {
    it('should throw NetworkError when translateBatch returns fewer results than expected', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            a: 'Hello',
            b: 'World',
            c: 'Goodbye',
          },
          null,
          2
        )
      );

      // Return only 2 results for 3 strings → triggers mismatch
      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
        { text: 'Mundo', detectedSourceLang: 'en' },
      ]);

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(
        /Translation batch failed: expected 3 results but got 2/
      );
    });

    it('should throw NetworkError when translateBatch returns more results than expected', async () => {
      const inputPath = path.join(testDir, 'en.json');
      const outputPath = path.join(testDir, 'es.json');

      fs.writeFileSync(
        inputPath,
        JSON.stringify(
          {
            a: 'Hello',
          },
          null,
          2
        )
      );

      // Return 2 results for 1 string → triggers mismatch
      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
        { text: 'Extra', detectedSourceLang: 'en' },
      ]);

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(NetworkError);
      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(
        /Translation batch failed: expected 1 results but got 2/
      );
    });

    it('should throw on mismatch in the final batch of a multi-batch translation', async () => {
      const inputPath = path.join(testDir, 'big.json');
      const outputPath = path.join(testDir, 'big-es.json');

      // Create data that forces two batches (strings > 128KB boundary)
      const bigStr = 'A'.repeat(70000); // ~70KB each
      const data: Record<string, string> = {
        key1: bigStr,
        key2: bigStr, // ~140KB total → batch split
      };
      fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

      // First batch succeeds
      mockTranslationService.translateBatch
        .mockResolvedValueOnce([{ text: 'T1', detectedSourceLang: 'en' }])
        // Second batch returns mismatch (0 results for 1 string)
        .mockResolvedValueOnce([]);

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(/Translation batch failed/);
    });

    it('should throw mismatch with abort message', async () => {
      const inputPath = path.join(testDir, 'mismatch.json');
      const outputPath = path.join(testDir, 'out.json');

      fs.writeFileSync(inputPath, JSON.stringify({ x: 'test' }, null, 2));

      mockTranslationService.translateBatch.mockResolvedValue([]);

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow('Aborting to prevent misaligned output');
    });
  });

  describe('deeply nested input', () => {
    it('should reject a file nested past the depth ceiling with a named error', async () => {
      const inputPath = path.join(testDir, 'deep.json');
      const outputPath = path.join(testDir, 'deep-es.json');

      // 8,000 nested arrays, ~16KB — well under any size limit, but enough to
      // exhaust the stack in a recursive walk.
      fs.writeFileSync(
        inputPath,
        `{"a":${'['.repeat(8000)}"x"${']'.repeat(8000)}}`
      );

      await expect(
        service.translateFile(inputPath, outputPath, { targetLang: 'es' })
      ).rejects.toThrow(/nesting depth/i);

      expect(mockTranslationService.translateBatch).not.toHaveBeenCalled();
      expect(fs.existsSync(outputPath)).toBe(false);
    });

    it('should still translate a file nested well within the ceiling', async () => {
      const inputPath = path.join(testDir, 'ok-deep.json');
      const outputPath = path.join(testDir, 'ok-deep-es.json');

      let inner = '"Hello"';
      for (let i = 0; i < 20; i++) inner = `{"k${i}":${inner}}`;
      fs.writeFileSync(inputPath, inner);

      mockTranslationService.translateBatch.mockResolvedValue([
        { text: 'Hola', detectedSourceLang: 'en' },
      ]);

      await service.translateFile(inputPath, outputPath, { targetLang: 'es' });

      expect(fs.readFileSync(outputPath, 'utf-8')).toContain('Hola');
    });
  });
});
