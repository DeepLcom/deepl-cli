import {
  preserveCodeBlocks,
  preserveVariables,
  restorePlaceholders,
  unresolvedPlaceholders,
} from '../../src/utils/text-preservation.js';

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

    it('should preserve Unicode placeholder {имя}', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Hello {имя}!', map);

      expect(result).toBe('Hello __VAR_0__!');
      expect(map.get('__VAR_0__')).toBe('{имя}');
    });

    it('should preserve positional printf specifier %1$s', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('%1$s costs %2$d', map);

      expect(result).toBe('__VAR_0__ costs __VAR_1__');
      expect(map.get('__VAR_0__')).toBe('%1$s');
      expect(map.get('__VAR_1__')).toBe('%2$d');
    });

    it('should preserve {{name}} as a single placeholder without corrupting to {name}', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Hello {{name}}, welcome!', map);

      expect(result).toBe('Hello __VAR_0__, welcome!');
      expect(map.get('__VAR_0__')).toBe('{{name}}');

      const restored = restorePlaceholders('Hallo __VAR_0__, willkommen!', map);
      expect(restored).toBe('Hallo {{name}}, willkommen!');
    });

    it('should preserve %f, %u, and %@ format specifiers', () => {
      const map = new Map<string, string>();
      const result = preserveVariables('Value: %f, count: %u, obj: %@', map);

      expect(result).toContain('__VAR_0__');
      expect(map.get('__VAR_0__')).toBe('%f');
      expect(map.get('__VAR_1__')).toBe('%u');
      expect(map.get('__VAR_2__')).toBe('%@');
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

    it('should restore placeholders whose original value contains $& literally', () => {
      const map = new Map<string, string>();
      map.set('__CODE_0__', '`match is $&`');
      const result = restorePlaceholders('Result: __CODE_0__', map);
      expect(result).toBe('Result: `match is $&`');
    });

    it('should restore placeholders whose original value contains $1 literally', () => {
      const map = new Map<string, string>();
      map.set('__VAR_0__', '${price}');
      map.set('__CODE_0__', '`costs $1`');
      const result = restorePlaceholders('__CODE_0__ for __VAR_0__', map);
      expect(result).toBe('`costs $1` for ${price}');
    });
  });

  describe('round-trip', () => {
    it('should restore original text after preserve → restore cycle', () => {
      const original =
        'Run `npm install` to install ${packageName} (version %s)';
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

  describe('nested preservation (a later span wrapping an earlier token)', () => {
    // FC_SEED=2139537717 FC_PATH="383:2:3:10:15:15:14" counterexample: the
    // fence pass substitutes __CODE_0__, then the inline pass preserves
    // "` __CODE_0__ `" as __CODE_1__, so __CODE_1__'s stored value carries an
    // earlier token.
    const OVERLAP = '` ```\nfenced block\n``` `inline code`';

    it('round-trips a fence overlapping an inline code span byte for byte', () => {
      const map = new Map<string, string>();
      const processed = preserveVariables(
        preserveCodeBlocks(OVERLAP, map),
        map
      );

      expect(restorePlaceholders(processed, map)).toBe(OVERLAP);
    });

    it('round-trips a variable-shaped span wrapping a preserved code token', () => {
      const original = 'set {`x`} here';
      const map = new Map<string, string>();
      const processed = preserveVariables(
        preserveCodeBlocks(original, map),
        map
      );

      expect(restorePlaceholders(processed, map)).toBe(original);
    });

    it('does not report a token that survives inside a later resolved span', () => {
      const map = new Map<string, string>();
      const processed = preserveVariables(
        preserveCodeBlocks(OVERLAP, map),
        map
      );

      expect(unresolvedPlaceholders(processed, map)).toEqual([]);
    });

    it('reports both spans lost when the outer token is gone', () => {
      const map = new Map<string, string>();
      preserveVariables(preserveCodeBlocks(OVERLAP, map), map);

      const missing = unresolvedPlaceholders('the engine ate it all', map);

      expect(missing).toEqual(['```\nfenced block\n```', '` __CODE_0__ `']);
    });
  });
});

describe("a source that literally contains the CLI's own token shape", () => {
  // The tokens are generated by a plain counter, so a source string carrying a
  // literal `__VAR_0__` could be handed the SAME token for a real variable. Two
  // occurrences then went to the engine, and restorePlaceholders uses replaceAll
  // — so the literal copy was rewritten into the preserved value. It also made
  // the loss check accept the literal copy as proof the substituted token
  // survived, reporting a genuine loss as intact.
  it('round-trips a literal __VAR_0__ alongside a real variable', () => {
    const map = new Map<string, string>();
    const source = 'Hi {name}, the token __VAR_0__ is literal text';
    const restored = restorePlaceholders(preserveVariables(source, map), map);
    expect(restored).toBe(source);
  });

  it('does not give a real variable a token the source already contains', () => {
    const map = new Map<string, string>();
    preserveVariables('__VAR_0__ and {name}', map);
    expect([...map.keys()]).not.toContain('__VAR_0__');
    expect(map.size).toBe(1);
  });

  it('skips a whole run of tokens the source contains', () => {
    const map = new Map<string, string>();
    const source = '__VAR_0__ __VAR_1__ __VAR_2__ {a} {b}';
    const restored = restorePlaceholders(preserveVariables(source, map), map);
    expect(restored).toBe(source);
    expect(map.size).toBe(2);
  });

  it('reports a dropped token even when a literal copy survives', () => {
    const map = new Map<string, string>();
    const processed = preserveVariables('__VAR_0__ and {name}', map);
    const token = [...map.keys()][0]!;
    // The engine mangles the substituted token but leaves the literal text.
    const mangled = processed.replace(token, '__ Var_x __');
    expect(unresolvedPlaceholders(mangled, map)).toEqual(['{name}']);
  });

  it('round-trips a literal __CODE_0__ alongside a real code span', () => {
    const map = new Map<string, string>();
    const source = 'see `code` and the literal __CODE_0__ token';
    const restored = restorePlaceholders(preserveCodeBlocks(source, map), map);
    expect(restored).toBe(source);
  });

  it('still uses the low token numbers when the source contains none', () => {
    const map = new Map<string, string>();
    preserveVariables('{a} {b}', map);
    expect([...map.keys()]).toEqual(['__VAR_0__', '__VAR_1__']);
  });
});
