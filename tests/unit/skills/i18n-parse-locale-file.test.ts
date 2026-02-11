import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  detectFormat,
  parseLocaleFile,
  serializeLocaleFile,
} from '../../../.claude/skills/i18n-translate/scripts/lib/parse-locale-file';

describe('parse-locale-file', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-parse-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('detectFormat', () => {
    it('should detect JSON', () => {
      expect(detectFormat('locales/en.json')).toBe('json');
    });

    it('should detect YAML (.yaml)', () => {
      expect(detectFormat('config/locales/en.yaml')).toBe('yaml');
    });

    it('should detect YAML (.yml)', () => {
      expect(detectFormat('config/locales/en.yml')).toBe('yaml');
    });

    it('should detect ARB', () => {
      expect(detectFormat('lib/l10n/app_en.arb')).toBe('arb');
    });

    it('should default to JSON for unknown extensions', () => {
      expect(detectFormat('locales/en.txt')).toBe('json');
    });
  });

  describe('parseLocaleFile', () => {
    it('should parse a JSON file', async () => {
      const filePath = path.join(tmpDir, 'en.json');
      await fs.writeFile(filePath, JSON.stringify({ hello: 'world' }, null, 2) + '\n');

      const result = await parseLocaleFile(filePath);
      expect(result.data).toEqual({ hello: 'world' });
      expect(result.format).toBe('json');
      expect(result.indent).toBe(2);
      expect(result.trailingNewline).toBe(true);
    });

    it('should parse a JSON file with 4-space indent', async () => {
      const filePath = path.join(tmpDir, 'en.json');
      await fs.writeFile(filePath, JSON.stringify({ a: 'b' }, null, 4) + '\n');

      const result = await parseLocaleFile(filePath);
      expect(result.indent).toBe(4);
    });

    it('should detect missing trailing newline', async () => {
      const filePath = path.join(tmpDir, 'en.json');
      await fs.writeFile(filePath, JSON.stringify({ a: 'b' }, null, 2));

      const result = await parseLocaleFile(filePath);
      expect(result.trailingNewline).toBe(false);
    });

    it('should parse a YAML file', async () => {
      const filePath = path.join(tmpDir, 'en.yml');
      await fs.writeFile(filePath, 'en:\n  hello: world\n  greeting: hi\n');

      const result = await parseLocaleFile(filePath);
      expect(result.data).toEqual({ en: { hello: 'world', greeting: 'hi' } });
      expect(result.format).toBe('yaml');
      expect(result.trailingNewline).toBe(true);
    });

    it('should parse an ARB file (JSON format)', async () => {
      const filePath = path.join(tmpDir, 'app_en.arb');
      const arb = {
        '@@locale': 'en',
        hello: 'Hello',
        '@hello': { description: 'Greeting' },
      };
      await fs.writeFile(filePath, JSON.stringify(arb, null, 2) + '\n');

      const result = await parseLocaleFile(filePath);
      expect(result.data['hello']).toBe('Hello');
      expect(result.format).toBe('arb');
    });

    it('should throw on invalid JSON', async () => {
      const filePath = path.join(tmpDir, 'bad.json');
      await fs.writeFile(filePath, '{ invalid json }');

      await expect(parseLocaleFile(filePath)).rejects.toThrow();
    });

    it('should throw on JSON array at root', async () => {
      const filePath = path.join(tmpDir, 'array.json');
      await fs.writeFile(filePath, '["a", "b"]');

      await expect(parseLocaleFile(filePath)).rejects.toThrow(/expected object at root/);
    });

    it('should throw on YAML scalar at root', async () => {
      const filePath = path.join(tmpDir, 'scalar.yml');
      await fs.writeFile(filePath, 'just a string\n');

      await expect(parseLocaleFile(filePath)).rejects.toThrow(/expected object at root/);
    });

    it('should throw on file not found', async () => {
      await expect(parseLocaleFile(path.join(tmpDir, 'nonexistent.json'))).rejects.toThrow();
    });
  });

  describe('serializeLocaleFile', () => {
    it('should round-trip JSON with trailing newline', async () => {
      const filePath = path.join(tmpDir, 'en.json');
      const original = JSON.stringify({ a: 'hello', b: { c: 'world' } }, null, 2) + '\n';
      await fs.writeFile(filePath, original);

      const parsed = await parseLocaleFile(filePath);
      const serialized = serializeLocaleFile(parsed);
      expect(serialized).toBe(original);
    });

    it('should round-trip JSON without trailing newline', async () => {
      const filePath = path.join(tmpDir, 'en.json');
      const original = JSON.stringify({ a: 'hello' }, null, 2);
      await fs.writeFile(filePath, original);

      const parsed = await parseLocaleFile(filePath);
      const serialized = serializeLocaleFile(parsed);
      expect(serialized).toBe(original);
    });

    it('should serialize YAML', async () => {
      const filePath = path.join(tmpDir, 'en.yml');
      await fs.writeFile(filePath, 'hello: world\n');

      const parsed = await parseLocaleFile(filePath);
      const serialized = serializeLocaleFile(parsed);
      expect(serialized).toBe('hello: world\n');
    });

    it('should preserve indent in JSON serialization', async () => {
      const filePath = path.join(tmpDir, 'en.json');
      const original = JSON.stringify({ a: 'hello' }, null, 4) + '\n';
      await fs.writeFile(filePath, original);

      const parsed = await parseLocaleFile(filePath);
      const serialized = serializeLocaleFile(parsed);
      expect(serialized).toBe(original);
    });
  });
});
