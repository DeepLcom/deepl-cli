import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  getConfigPath,
  loadProjectConfig,
  saveProjectConfig,
  createDefaultConfig,
  validateConfig,
} from '../../../.claude/skills/i18n-translate/scripts/lib/config';

describe('i18n project config', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getConfigPath', () => {
    it('should resolve to .deepl-i18n.json in given root', () => {
      const result = getConfigPath('/some/project');
      expect(result).toBe(path.resolve('/some/project', '.deepl-i18n.json'));
    });

    it('should use cwd when root is not provided', () => {
      const result = getConfigPath();
      expect(result).toBe(path.resolve(process.cwd(), '.deepl-i18n.json'));
    });
  });

  describe('loadProjectConfig', () => {
    it('should read a valid config file', async () => {
      const config = { sourceLocale: 'en', targetLocales: ['es', 'fr'] };
      await fs.writeFile(path.join(tmpDir, '.deepl-i18n.json'), JSON.stringify(config));

      const result = await loadProjectConfig(tmpDir);
      expect(result).toEqual(config);
    });

    it('should return null when file does not exist', async () => {
      const result = await loadProjectConfig(tmpDir);
      expect(result).toBeNull();
    });

    it('should throw on invalid JSON', async () => {
      await fs.writeFile(path.join(tmpDir, '.deepl-i18n.json'), '{not valid json');

      await expect(loadProjectConfig(tmpDir)).rejects.toThrow('Invalid JSON');
    });

    it('should throw when sourceLocale is missing', async () => {
      const config = { targetLocales: ['es'] };
      await fs.writeFile(path.join(tmpDir, '.deepl-i18n.json'), JSON.stringify(config));

      await expect(loadProjectConfig(tmpDir)).rejects.toThrow('sourceLocale');
    });

    it('should throw when targetLocales is missing', async () => {
      const config = { sourceLocale: 'en' };
      await fs.writeFile(path.join(tmpDir, '.deepl-i18n.json'), JSON.stringify(config));

      await expect(loadProjectConfig(tmpDir)).rejects.toThrow('targetLocales');
    });
  });

  describe('saveProjectConfig', () => {
    it('should write config with 2-space indent and trailing newline', async () => {
      const config = { sourceLocale: 'en', targetLocales: ['de'] };
      await saveProjectConfig(config, tmpDir);

      const raw = await fs.readFile(path.join(tmpDir, '.deepl-i18n.json'), 'utf-8');
      expect(raw).toBe(JSON.stringify(config, null, 2) + '\n');
      expect(raw.endsWith('\n')).toBe(true);
    });

    it('should round-trip with loadProjectConfig', async () => {
      const config = {
        sourceLocale: 'en',
        targetLocales: ['es', 'fr', 'de'],
        framework: 'i18next',
        formality: 'prefer_more',
        glossary: 'my-glossary',
        localePaths: ['public/locales/'],
        excludePaths: ['**/node_modules/**'],
        monorepo: { packages: ['packages/*'] },
      };
      await saveProjectConfig(config, tmpDir);
      const loaded = await loadProjectConfig(tmpDir);
      expect(loaded).toEqual(config);
    });
  });

  describe('createDefaultConfig', () => {
    it('should return defaults', () => {
      const config = createDefaultConfig();
      expect(config).toEqual({ sourceLocale: 'en', targetLocales: [] });
    });

    it('should apply overrides', () => {
      const config = createDefaultConfig({
        sourceLocale: 'de',
        targetLocales: ['en', 'fr'],
        framework: 'vue-i18n',
      });
      expect(config.sourceLocale).toBe('de');
      expect(config.targetLocales).toEqual(['en', 'fr']);
      expect(config.framework).toBe('vue-i18n');
    });
  });

  describe('validateConfig', () => {
    it('should accept valid minimal config', () => {
      expect(validateConfig({ sourceLocale: 'en', targetLocales: [] })).toBe(true);
    });

    it('should accept config with all optional fields', () => {
      expect(validateConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        framework: 'i18next',
        formality: 'prefer_more',
        glossary: 'g1',
        localePaths: ['locales/'],
        excludePaths: ['**/node_modules/**'],
        monorepo: { packages: ['packages/*'] },
      })).toBe(true);
    });

    it('should reject non-object', () => {
      expect(validateConfig('string')).toBe(false);
      expect(validateConfig(null)).toBe(false);
      expect(validateConfig(42)).toBe(false);
      expect(validateConfig([])).toBe(false);
    });

    it('should reject missing sourceLocale', () => {
      expect(validateConfig({ targetLocales: [] })).toBe(false);
    });

    it('should reject non-string sourceLocale', () => {
      expect(validateConfig({ sourceLocale: 123, targetLocales: [] })).toBe(false);
    });

    it('should reject missing targetLocales', () => {
      expect(validateConfig({ sourceLocale: 'en' })).toBe(false);
    });

    it('should reject non-array targetLocales', () => {
      expect(validateConfig({ sourceLocale: 'en', targetLocales: 'es' })).toBe(false);
    });

    it('should reject targetLocales with non-string elements', () => {
      expect(validateConfig({ sourceLocale: 'en', targetLocales: [123] })).toBe(false);
    });
  });
});
