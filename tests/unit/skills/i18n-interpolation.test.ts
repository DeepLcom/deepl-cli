import {
  getFrameworkPatterns,
  preprocessString,
  restoreString,
  validateRestoration,
} from '../../../.claude/skills/i18n-translate/scripts/lib/interpolation';

describe('interpolation', () => {
  describe('getFrameworkPatterns', () => {
    it('should return patterns for known frameworks', () => {
      expect(getFrameworkPatterns('i18next').length).toBeGreaterThan(0);
      expect(getFrameworkPatterns('angular').length).toBeGreaterThan(0);
      expect(getFrameworkPatterns('rails').length).toBeGreaterThan(0);
      expect(getFrameworkPatterns('vue-i18n').length).toBeGreaterThan(0);
      expect(getFrameworkPatterns('react-intl').length).toBeGreaterThan(0);
    });

    it('should return empty array for generic framework', () => {
      expect(getFrameworkPatterns('generic')).toEqual([]);
    });
  });

  describe('preprocessString', () => {
    it('should replace i18next double-brace variables', () => {
      const { processed, map } = preprocessString('Hello {{name}}, welcome!', 'i18next');
      expect(processed).not.toContain('{{name}}');
      expect(processed).toMatch(/__INTL_[0-9a-f]{8}__/);
      expect(map).toHaveLength(1);
      expect(map[0]!.original).toBe('{{name}}');
    });

    it('should replace i18next $t() references', () => {
      const { processed, map } = preprocessString('See $t(common.greeting) for info', 'i18next');
      expect(processed).not.toContain('$t(common.greeting)');
      expect(map).toHaveLength(1);
      expect(map[0]!.original).toBe('$t(common.greeting)');
    });

    it('should replace rails %{} variables', () => {
      const { processed, map } = preprocessString('Hello %{name}, you have %{count} items', 'rails');
      expect(processed).not.toContain('%{name}');
      expect(processed).not.toContain('%{count}');
      expect(map).toHaveLength(2);
    });

    it('should replace rails %<>s format variables', () => {
      const { processed, map } = preprocessString('Price: %<amount>d dollars', 'rails');
      expect(processed).not.toContain('%<amount>d');
      expect(map).toHaveLength(1);
      expect(map[0]!.original).toBe('%<amount>d');
    });

    it('should replace angular {$INTERPOLATION} variables', () => {
      const { processed, map } = preprocessString('Hello {$USER_NAME}!', 'angular');
      expect(processed).not.toContain('{$USER_NAME}');
      expect(map).toHaveLength(1);
      expect(map[0]!.original).toBe('{$USER_NAME}');
    });

    it('should replace vue-i18n pipe modifiers', () => {
      const { processed, map } = preprocessString('Hello {name | upper}', 'vue-i18n');
      expect(processed).not.toContain('{name | upper}');
      expect(map).toHaveLength(1);
      expect(map[0]!.original).toBe('{name | upper}');
    });

    it('should replace vue-i18n @:key references', () => {
      const { processed, map } = preprocessString('See @:common.greeting for details', 'vue-i18n');
      expect(processed).not.toContain('@:common.greeting');
      expect(map).toHaveLength(1);
      expect(map[0]!.original).toBe('@:common.greeting');
    });

    it('should replace ICU plural expressions for react-intl', () => {
      const text = 'You have {count, plural, one {# item} other {# items}}';
      const { processed, map } = preprocessString(text, 'react-intl');
      expect(processed).not.toContain('{count, plural,');
      expect(map).toHaveLength(1);
    });

    it('should handle multiple patterns in one string', () => {
      const { processed, map } = preprocessString(
        'Hi {{name}}, see $t(help.intro) for {{topic}}',
        'i18next',
      );
      expect(map).toHaveLength(3);
      expect(processed).not.toContain('{{name}}');
      expect(processed).not.toContain('$t(help.intro)');
      expect(processed).not.toContain('{{topic}}');
    });

    it('should return unchanged string for generic framework', () => {
      const { processed, map } = preprocessString('Hello {{name}}', 'generic');
      expect(processed).toBe('Hello {{name}}');
      expect(map).toHaveLength(0);
    });

    it('should return unchanged string when no matches found', () => {
      const { processed, map } = preprocessString('No variables here', 'i18next');
      expect(processed).toBe('No variables here');
      expect(map).toHaveLength(0);
    });

    it('should handle empty string', () => {
      const { processed, map } = preprocessString('', 'i18next');
      expect(processed).toBe('');
      expect(map).toHaveLength(0);
    });

    it('should generate unique placeholders for identical patterns', () => {
      const { map } = preprocessString('{{name}} and {{name}}', 'i18next');
      expect(map).toHaveLength(2);
      expect(map[0]!.placeholder).not.toBe(map[1]!.placeholder);
    });
  });

  describe('restoreString', () => {
    it('should restore all placeholders to original values', () => {
      const { processed, map } = preprocessString('Hello {{name}}, welcome to {{place}}!', 'i18next');
      const restored = restoreString(processed, map);
      expect(restored).toBe('Hello {{name}}, welcome to {{place}}!');
    });

    it('should handle round-trip with rails variables', () => {
      const original = 'Dear %{title} %{name}, your order %{id} is ready';
      const { processed, map } = preprocessString(original, 'rails');
      const restored = restoreString(processed, map);
      expect(restored).toBe(original);
    });

    it('should handle empty map', () => {
      expect(restoreString('unchanged text', [])).toBe('unchanged text');
    });
  });

  describe('validateRestoration', () => {
    it('should return empty array when all variables match', () => {
      const issues = validateRestoration(
        'Hello {{name}}, see $t(common.hi)',
        'Bonjour {{name}}, voir $t(common.hi)',
        'i18next',
      );
      expect(issues).toEqual([]);
    });

    it('should report missing variables', () => {
      const issues = validateRestoration(
        'Hello {{name}} and {{place}}',
        'Hello {{name}}',
        'i18next',
      );
      expect(issues).toContainEqual(expect.stringContaining('Missing'));
      expect(issues).toContainEqual(expect.stringContaining('{{place}}'));
    });

    it('should report extra variables', () => {
      const issues = validateRestoration(
        'Hello {{name}}',
        'Hello {{name}} and {{extra}}',
        'i18next',
      );
      expect(issues).toContainEqual(expect.stringContaining('Extra'));
      expect(issues).toContainEqual(expect.stringContaining('{{extra}}'));
    });
  });
});
