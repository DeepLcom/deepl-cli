import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { diffLocaleKeys } from '../../../.claude/skills/i18n-translate/scripts/diff-locale-keys';
import { pathToDisplayString } from '../../../.claude/skills/i18n-translate/scripts/lib/flatten-keys';

describe('diff-locale-keys', () => {
  describe('diffLocaleKeys', () => {
    it('should find missing keys', () => {
      const source = { greeting: 'Hello', farewell: 'Bye' };
      const target = { greeting: 'Hallo' };
      const result = diffLocaleKeys(source, target, false);
      expect(result.missing).toEqual([['farewell']]);
    });

    it('should find extra keys', () => {
      const source = { greeting: 'Hello' };
      const target = { greeting: 'Hallo', bonus: 'Extra' };
      const result = diffLocaleKeys(source, target, false);
      expect(result.extra).toEqual([['bonus']]);
    });

    it('should find empty values in target', () => {
      const source = { greeting: 'Hello', farewell: 'Bye' };
      const target = { greeting: 'Hallo', farewell: '' };
      const result = diffLocaleKeys(source, target, false);
      expect(result.empty).toEqual([['farewell']]);
    });

    it('should return empty arrays when no differences', () => {
      const source = { greeting: 'Hello', farewell: 'Bye' };
      const target = { greeting: 'Hallo', farewell: 'Tschuess' };
      const result = diffLocaleKeys(source, target, false);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
      expect(result.empty).toEqual([]);
    });

    it('should handle nested objects', () => {
      const source = { nav: { home: 'Home', about: 'About' } };
      const target = { nav: { home: 'Startseite' } };
      const result = diffLocaleKeys(source, target, false);
      expect(result.missing).toEqual([['nav', 'about']]);
    });

    it('should handle array elements', () => {
      const source = { items: ['one', 'two', 'three'] };
      const target = { items: ['eins', 'zwei'] };
      const result = diffLocaleKeys(source, target, true);
      expect(result.missing).toEqual([['items', 2]]);
    });

    it('should filter out non-string values with strings-only', () => {
      const source = { name: 'Alice', count: 42, active: true };
      const target = { name: 'Alicia' };
      const resultStringsOnly = diffLocaleKeys(source, target, true);
      expect(resultStringsOnly.missing).toEqual([]);
      expect(resultStringsOnly.extra).toEqual([]);

      const resultAll = diffLocaleKeys(source, target, false);
      expect(resultAll.missing.length).toBe(2);
    });

    it('should handle dots-in-keys correctly', () => {
      const source = { 'terms.of.service': 'ToS text' };
      const target = { terms: { of: { service: 'ToS text' } } };
      const result = diffLocaleKeys(source, target, true);
      // ["terms.of.service"] vs terms.of.service are different paths
      expect(result.missing.length).toBe(1);
      expect(result.extra.length).toBe(1);
    });

    it('should treat empty target as all missing', () => {
      const source = { a: 'one', b: 'two' };
      const target = {};
      const result = diffLocaleKeys(source, target, false);
      expect(result.missing).toEqual([['a'], ['b']]);
    });

    it('should treat empty source as all extra', () => {
      const source = {};
      const target = { a: 'one', b: 'two' };
      const result = diffLocaleKeys(source, target, false);
      expect(result.extra).toEqual([['a'], ['b']]);
    });

    it('should handle combined missing, extra, and empty', () => {
      const source = { a: 'one', b: 'two' };
      const target = { b: '', c: 'drei' };
      const result = diffLocaleKeys(source, target, false);
      expect(result.missing).toEqual([['a']]);
      expect(result.extra).toEqual([['c']]);
      expect(result.empty).toEqual([['b']]);
    });
  });

  describe('output formatting', () => {
    it('should produce correct display strings for missing/extra paths', () => {
      const result = diffLocaleKeys(
        { nav: { home: 'Home', about: 'About' } },
        { nav: { home: 'Startseite' }, footer: { copyright: 'copy' } },
        false,
      );
      const missingDisplay = result.missing.map(pathToDisplayString);
      const extraDisplay = result.extra.map(pathToDisplayString);
      expect(missingDisplay).toContain('nav.about');
      expect(extraDisplay).toContain('footer.copyright');
    });
  });

  describe('file-based integration', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-keys-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should work with JSON input data', () => {
      const sourceData = { title: 'Hello', subtitle: 'World' };
      const targetData = { title: 'Hallo' };
      const result = diffLocaleKeys(sourceData, targetData, false);
      expect(result.missing).toEqual([['subtitle']]);
    });

    it('should work with YAML-like nested data', () => {
      const sourceData = {
        en: {
          messages: { welcome: 'Welcome', goodbye: 'Goodbye' },
        },
      };
      const targetData = {
        de: {
          messages: { welcome: 'Willkommen' },
        },
      };
      const result = diffLocaleKeys(sourceData, targetData, true);
      expect(result.missing.length).toBeGreaterThan(0);
    });
  });
});
