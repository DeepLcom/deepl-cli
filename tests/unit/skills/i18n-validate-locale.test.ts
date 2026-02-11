import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { validateLocale, getVariablePatterns } from '../../../.claude/skills/i18n-translate/scripts/validate-locale';

describe('validate-locale', () => {
  describe('validateLocale', () => {
    it('should pass for a valid locale with all keys and translations', () => {
      const source = { greeting: 'Hello', farewell: 'Goodbye' };
      const translated = { greeting: 'Hola', farewell: 'Adiós' };
      const result = validateLocale(source, translated);
      expect(result.valid).toBe(true);
      expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    });

    it('should detect missing keys', () => {
      const source = { greeting: 'Hello', farewell: 'Goodbye', thanks: 'Thank you' };
      const translated = { greeting: 'Hola' };
      const result = validateLocale(source, translated);
      expect(result.valid).toBe(false);
      const missingIssues = result.issues.filter(i => i.check === 'key-structure' && i.severity === 'error');
      expect(missingIssues).toHaveLength(2);
      expect(missingIssues.map(i => i.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('farewell'),
          expect.stringContaining('thanks'),
        ])
      );
    });

    it('should warn on extra keys', () => {
      const source = { greeting: 'Hello' };
      const translated = { greeting: 'Hola', bonus: 'Extra' };
      const result = validateLocale(source, translated);
      expect(result.valid).toBe(true);
      const extraIssues = result.issues.filter(i => i.check === 'key-structure' && i.severity === 'warning');
      expect(extraIssues).toHaveLength(1);
      expect(extraIssues[0]!.message).toContain('bonus');
    });

    it('should detect placeholder residue', () => {
      const source = { greeting: 'Hello {name}' };
      const translated = { greeting: '__INTL_abc123__' };
      const result = validateLocale(source, translated);
      expect(result.valid).toBe(false);
      const residueIssues = result.issues.filter(i => i.check === 'placeholder-residue');
      expect(residueIssues).toHaveLength(1);
    });

    it('should catch missing i18next variables', () => {
      const source = { msg: 'Hello {{name}}, welcome to {{place}}' };
      const translated = { msg: 'Hola, bienvenido a {{place}}' };
      const result = validateLocale(source, translated, 'i18next');
      expect(result.valid).toBe(false);
      const varIssues = result.issues.filter(i => i.check === 'variable-preservation');
      expect(varIssues).toHaveLength(1);
      expect(varIssues[0]!.message).toContain('{{name}}');
    });

    it('should catch missing rails variables', () => {
      const source = { msg: 'Hello %{name}' };
      const translated = { msg: 'Hola' };
      const result = validateLocale(source, translated, 'rails');
      expect(result.valid).toBe(false);
      const varIssues = result.issues.filter(i => i.check === 'variable-preservation');
      expect(varIssues).toHaveLength(1);
      expect(varIssues[0]!.message).toContain('%{name}');
    });

    it('should pass when all variables match', () => {
      const source = { msg: 'Hello {{name}}' };
      const translated = { msg: 'Hola {{name}}' };
      const result = validateLocale(source, translated, 'i18next');
      const varIssues = result.issues.filter(i => i.check === 'variable-preservation');
      expect(varIssues).toHaveLength(0);
    });

    it('should warn on untranslated values', () => {
      const source = { a: 'Hello', b: 'World', c: 'Foo' };
      const translated = { a: 'Hello', b: 'World', c: 'Bar' };
      const result = validateLocale(source, translated);
      const untranslated = result.issues.filter(i => i.check === 'untranslated');
      expect(untranslated).toHaveLength(1);
      expect(untranslated[0]!.message).toContain('2/3');
    });

    it('should not warn when all values are translated', () => {
      const source = { a: 'Hello', b: 'World' };
      const translated = { a: 'Hola', b: 'Mundo' };
      const result = validateLocale(source, translated);
      const untranslated = result.issues.filter(i => i.check === 'untranslated');
      expect(untranslated).toHaveLength(0);
    });

    it('should handle generic framework patterns', () => {
      const source = { msg: 'Hello {name}, you have %d items and ${total} dollars' };
      const translated = { msg: 'Hola {name}, tienes %d articulos y ${total} dolares' };
      const result = validateLocale(source, translated, 'generic');
      const varIssues = result.issues.filter(i => i.check === 'variable-preservation');
      expect(varIssues).toHaveLength(0);
    });

    it('should detect multiple check failures simultaneously', () => {
      const source = { a: 'Hello {{name}}', b: 'World', c: 'Missing' };
      const translated = { a: '__INTL_deadbeef__', b: 'World', extra: 'Bonus' };
      const result = validateLocale(source, translated, 'i18next');
      expect(result.valid).toBe(false);
      const checks = new Set(result.issues.map(i => i.check));
      expect(checks.has('key-structure')).toBe(true);
      expect(checks.has('placeholder-residue')).toBe(true);
      expect(checks.has('variable-preservation')).toBe(true);
    });

    it('should handle empty data objects', () => {
      const result = validateLocale({}, {});
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should handle nested keys', () => {
      const source = { nav: { home: 'Home', about: 'About' } };
      const translated = { nav: { home: 'Inicio' } };
      const result = validateLocale(source, translated);
      expect(result.valid).toBe(false);
      const missing = result.issues.filter(i => i.check === 'key-structure' && i.severity === 'error');
      expect(missing).toHaveLength(1);
      expect(missing[0]!.message).toContain('about');
    });
  });

  describe('getVariablePatterns', () => {
    it('should return i18next patterns', () => {
      const patterns = getVariablePatterns('i18next');
      expect(patterns).toHaveLength(1);
      expect('{{name}}'.match(patterns[0]!)).toBeTruthy();
    });

    it('should return angular patterns (same as i18next)', () => {
      const patterns = getVariablePatterns('angular');
      expect(patterns).toHaveLength(1);
      expect('{{name}}'.match(patterns[0]!)).toBeTruthy();
    });

    it('should return rails patterns', () => {
      const patterns = getVariablePatterns('rails');
      expect(patterns).toHaveLength(2);
      expect('%{name}'.match(patterns[0]!)).toBeTruthy();
    });

    it('should return vue-i18n patterns', () => {
      const patterns = getVariablePatterns('vue-i18n');
      expect(patterns).toHaveLength(2);
      expect('{name}'.match(patterns[0]!)).toBeTruthy();
      expect('@:common.title'.match(patterns[1]!)).toBeTruthy();
    });

    it('should return react-intl patterns', () => {
      const patterns = getVariablePatterns('react-intl');
      expect(patterns).toHaveLength(1);
      expect('{count}'.match(patterns[0]!)).toBeTruthy();
    });

    it('should return generic patterns', () => {
      const patterns = getVariablePatterns('generic');
      expect(patterns.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('CLI output formats', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-validate-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should produce JSON format output', () => {
      const source = { greeting: 'Hello' };
      const translated = { greeting: 'Hola' };
      const result = validateLocale(source, translated);
      const json = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(json);
      expect(parsed.valid).toBe(true);
      expect(Array.isArray(parsed.issues)).toBe(true);
    });

    it('should produce structured ValidationResult', () => {
      const source = { a: 'Hello {{name}}' };
      const translated = { a: 'Hola' };
      const result = validateLocale(source, translated, 'i18next');
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('issues');
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(issue).toHaveProperty('check');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('message');
        expect(['error', 'warning']).toContain(issue.severity);
      }
    });
  });
});
