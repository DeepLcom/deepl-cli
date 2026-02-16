import { preserveCodeBlocks, preserveVariables, restorePlaceholders } from '../../src/utils/text-preservation.js';

describe('text-preservation', () => {
  describe('preserveCodeBlocks', () => {
    it('should preserve multi-line code blocks', () => {
      const map = new Map<string, string>();
      const text = 'Before\n```js\nconst x = 1;\n```\nAfter';
      const result = preserveCodeBlocks(text, map);

      expect(result).toBe('Before\n__CODE_0__\nAfter');
      expect(map.get('__CODE_0__')).toBe('```js\nconst x = 1;\n```');
    });

    it('should preserve inline code blocks', () => {
      const map = new Map<string, string>();
      const text = 'Use `console.log` for debugging';
      const result = preserveCodeBlocks(text, map);

      expect(result).toBe('Use __CODE_0__ for debugging');
      expect(map.get('__CODE_0__')).toBe('`console.log`');
    });

    it('should preserve both multi-line and inline code blocks', () => {
      const map = new Map<string, string>();
      const text = 'Run `npm install` then:\n```\nnpm start\n```';
      const result = preserveCodeBlocks(text, map);

      expect(result).toBe('Run __CODE_1__ then:\n__CODE_0__');
      expect(map.get('__CODE_0__')).toBe('```\nnpm start\n```');
      expect(map.get('__CODE_1__')).toBe('`npm install`');
    });

    it('should return text unchanged when no code blocks', () => {
      const map = new Map<string, string>();
      const result = preserveCodeBlocks('Hello world', map);

      expect(result).toBe('Hello world');
      expect(map.size).toBe(0);
    });

    it('should handle empty string', () => {
      const map = new Map<string, string>();
      const result = preserveCodeBlocks('', map);

      expect(result).toBe('');
      expect(map.size).toBe(0);
    });
  });

  describe('preserveVariables', () => {
    it('should preserve ${var} patterns', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Hello ${name}!', map);

      expect(result).toBe('Hello __VAR_0__!');
      expect(map.get('__VAR_0__')).toBe('${name}');
    });

    it('should preserve {var} patterns', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Hello {name}!', map);

      expect(result).toBe('Hello __VAR_0__!');
      expect(map.get('__VAR_0__')).toBe('{name}');
    });

    it('should preserve %s and %d patterns', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Found %d items: %s', map);

      expect(result).toBe('Found __VAR_0__ items: __VAR_1__');
      expect(map.get('__VAR_0__')).toBe('%d');
      expect(map.get('__VAR_1__')).toBe('%s');
    });

    it('should preserve multiple variable types together', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('${greeting} {name}, count: %d', map);

      expect(result).toBe('__VAR_0__ __VAR_1__, count: __VAR_2__');
      expect(map.get('__VAR_0__')).toBe('${greeting}');
      expect(map.get('__VAR_1__')).toBe('{name}');
      expect(map.get('__VAR_2__')).toBe('%d');
    });

    it('should return text unchanged when no variables', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Hello world', map);

      expect(result).toBe('Hello world');
      expect(map.size).toBe(0);
    });

    it('should handle empty string', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('', map);

      expect(result).toBe('');
      expect(map.size).toBe(0);
    });
  });

  describe('restorePlaceholders', () => {
    it('should restore all placeholders from the map', () => {
      const map = new Map<string, string>();
      map.set('__CODE_0__', '`code`');
      map.set('__VAR_0__', '${name}');

      const result = restorePlaceholders('__CODE_0__ says __VAR_0__', map);
      expect(result).toBe('`code` says ${name}');
    });

    it('should return text unchanged with empty map', () => {
      const map = new Map<string, string>();
      const result = restorePlaceholders('Hello world', map);
      expect(result).toBe('Hello world');
    });

    it('should handle empty string', () => {
      const map = new Map<string, string>();
      map.set('__CODE_0__', '`x`');
      const result = restorePlaceholders('', map);
      expect(result).toBe('');
    });
  });

  describe('round-trip', () => {
    it('should restore original text after preserve → restore cycle', () => {
      const original = 'Run `npm install` to install ${packageName} (version %s)';
      const map = new Map<string, string>();

      let processed = preserveCodeBlocks(original, map);
      processed = preserveVariables(processed, map);
      const restored = restorePlaceholders(processed, map);

      expect(restored).toBe(original);
    });

    it('should handle text with code blocks and variables together', () => {
      const original = '```js\nconst x = ${val};\n```\nUse {name} or %d';
      const map = new Map<string, string>();

      let processed = preserveCodeBlocks(original, map);
      processed = preserveVariables(processed, map);
      const restored = restorePlaceholders(processed, map);

      expect(restored).toBe(original);
    });

    it('should handle text with no preservable content', () => {
      const original = 'Just plain text here.';
      const map = new Map<string, string>();

      let processed = preserveCodeBlocks(original, map);
      processed = preserveVariables(processed, map);
      const restored = restorePlaceholders(processed, map);

      expect(restored).toBe(original);
    });
  });
});
