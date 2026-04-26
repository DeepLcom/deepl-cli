/**
 * Integration tests for sync init auto-detection per i18n framework.
 *
 * Uses REAL fast-glob (not mocked) against real filesystem structures
 * to verify that detectI18nFiles() produces include patterns that
 * actually match source files — the exact bug that sync-qsn reported.
 */

jest.unmock('fast-glob');

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as YAML from 'yaml';
import fg from 'fast-glob';
import {
  detectI18nFiles,
  generateSyncConfig,
} from '../../src/sync/sync-init';

function makeTmpDir(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `deepl-sync-init-integ-${label}-`));
  return dir;
}

function writeFile(root: string, relPath: string, content: string): void {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
}

interface ParsedConfig {
  version: number;
  source_locale: string;
  target_locales: string[];
  buckets: Record<string, { include: string[]; target_path_pattern?: string }>;
}

describe('sync init auto-detection with real fast-glob', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('JSON (i18next)', () => {
    it('should detect, generate config, and match source files with fast-glob', async () => {
      tmpDir = makeTmpDir('json');
      writeFile(tmpDir, 'locales/en.json', '{"greeting":"Hello","farewell":"Goodbye"}');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'json');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('locales/en.json');
      expect(project!.targetPathPattern).toBeUndefined();
      expect(project!.keyCount).toBe(2);

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        format: project!.format,
        pattern: project!.pattern,
        targetPathPattern: project!.targetPathPattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;
      expect(parsed.buckets['json']!.target_path_pattern).toBeUndefined();

      const matched = await fg(parsed.buckets['json']!.include, { cwd: tmpDir });
      expect(matched).toContain('locales/en.json');
    });
  });

  describe('YAML (Rails)', () => {
    it('should detect, generate config, and match source files with fast-glob', async () => {
      tmpDir = makeTmpDir('yaml');
      writeFile(tmpDir, 'locales/en.yaml', 'greeting: Hello\nfarewell: Goodbye\n');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'yaml');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('locales/en.yaml');
      expect(project!.targetPathPattern).toBeUndefined();

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        format: project!.format,
        pattern: project!.pattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;

      const matched = await fg(parsed.buckets['yaml']!.include, { cwd: tmpDir });
      expect(matched).toContain('locales/en.yaml');
    });
  });

  describe('Android XML', () => {
    it('should detect with target_path_pattern and match source files', async () => {
      tmpDir = makeTmpDir('android');
      writeFile(tmpDir, 'res/values/strings.xml',
        '<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">App</string></resources>');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'android_xml');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('res/values/strings.xml');
      expect(project!.targetPathPattern).toBe('res/values-{locale}/strings.xml');

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de', 'fr'],
        format: project!.format,
        pattern: project!.pattern,
        targetPathPattern: project!.targetPathPattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;
      expect(parsed.buckets['android_xml']!.target_path_pattern).toBe('res/values-{locale}/strings.xml');

      const matched = await fg(parsed.buckets['android_xml']!.include, { cwd: tmpDir });
      expect(matched).toContain('res/values/strings.xml');
    });

    it('should resolve target paths from target_path_pattern', async () => {
      const { resolveTargetPath } = await import('../../src/sync/sync-utils');
      const result = resolveTargetPath(
        'res/values/strings.xml', 'en', 'de',
        'res/values-{locale}/strings.xml',
      );
      expect(result).toBe('res/values-de/strings.xml');
    });
  });

  describe('iOS Strings', () => {
    it('should detect and match source files (locale in path)', async () => {
      tmpDir = makeTmpDir('ios');
      writeFile(tmpDir, 'en.lproj/Localizable.strings', '"greeting" = "Hello";\n"farewell" = "Goodbye";');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'ios_strings');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('en.lproj/Localizable.strings');
      expect(project!.targetPathPattern).toBeUndefined();

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        format: project!.format,
        pattern: project!.pattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;

      const matched = await fg(parsed.buckets['ios_strings']!.include, { cwd: tmpDir });
      expect(matched).toContain('en.lproj/Localizable.strings');
    });
  });

  describe('PO (Django)', () => {
    it('should detect and match source files (locale in path)', async () => {
      tmpDir = makeTmpDir('po');
      writeFile(tmpDir, 'locale/en/LC_MESSAGES/django.po',
        'msgid "greeting"\nmsgstr "Hello"\n');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'po');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('locale/en/LC_MESSAGES/*.po');
      expect(project!.targetPathPattern).toBeUndefined();

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        format: project!.format,
        pattern: project!.pattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;

      const matched = await fg(parsed.buckets['po']!.include, { cwd: tmpDir });
      expect(matched).toContain('locale/en/LC_MESSAGES/django.po');
    });
  });

  describe('XLIFF (Angular)', () => {
    it('should detect with target_path_pattern and match source files', async () => {
      tmpDir = makeTmpDir('xliff');
      writeFile(tmpDir, 'src/locale/messages.xlf',
        '<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2"></xliff>');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'xliff');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('src/locale/messages.xlf');
      expect(project!.targetPathPattern).toBe('src/locale/messages.{locale}.xlf');

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        format: project!.format,
        pattern: project!.pattern,
        targetPathPattern: project!.targetPathPattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;
      expect(parsed.buckets['xliff']!.target_path_pattern).toBe('src/locale/messages.{locale}.xlf');

      const matched = await fg(parsed.buckets['xliff']!.include, { cwd: tmpDir });
      expect(matched).toContain('src/locale/messages.xlf');
    });

    it('should resolve target paths from target_path_pattern', async () => {
      const { resolveTargetPath } = await import('../../src/sync/sync-utils');
      const result = resolveTargetPath(
        'src/locale/messages.xlf', 'en', 'de',
        'src/locale/messages.{locale}.xlf',
      );
      expect(result).toBe('src/locale/messages.de.xlf');
    });
  });

  describe('ARB (Flutter)', () => {
    it('should detect and match source files (locale in filename)', async () => {
      tmpDir = makeTmpDir('arb');
      // pubspec.yaml is required by the ARB detector (Flutter-only gate).
      writeFile(tmpDir, 'pubspec.yaml', 'name: app\n');
      writeFile(tmpDir, 'l10n/app_en.arb', '{"greeting":"Hello"}');

      const detected = await detectI18nFiles(tmpDir);
      const project = detected.find(p => p.format === 'arb');
      expect(project).toBeDefined();
      expect(project!.pattern).toBe('l10n/app_en.arb');
      expect(project!.targetPathPattern).toBeUndefined();

      const yaml = generateSyncConfig({
        sourceLocale: 'en',
        targetLocales: ['de'],
        format: project!.format,
        pattern: project!.pattern,
      });
      const parsed = YAML.parse(yaml) as ParsedConfig;

      const matched = await fg(parsed.buckets['arb']!.include, { cwd: tmpDir });
      expect(matched).toContain('l10n/app_en.arb');
    });

    it('does NOT detect ARB when pubspec.yaml is absent (Flutter-gate)', async () => {
      tmpDir = makeTmpDir('arb-no-pubspec');
      writeFile(tmpDir, 'l10n/app_en.arb', '{"greeting":"Hello"}');

      const detected = await detectI18nFiles(tmpDir);
      expect(detected.find(p => p.format === 'arb')).toBeUndefined();
    });
  });
});
