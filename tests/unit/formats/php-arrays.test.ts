import * as fs from 'fs';
import * as path from 'path';
import {
  PhpArraysFormatParser,
  PhpArraysCapExceededError,
  SKIP_REASON_PIPE_PLURALIZATION,
} from '../../../src/formats/php-arrays';
import { createDefaultRegistry } from '../../../src/formats/index';
import { ValidationError } from '../../../src/utils/errors';
import { Logger } from '../../../src/utils/logger';

const parser = new PhpArraysFormatParser();

describe('PhpArraysFormatParser', () => {
  it('is registered in the default registry under laravel_php', async () => {
    const registry = await createDefaultRegistry();
    expect(registry.getParserByFormatKey('laravel_php')?.name).toBe('Laravel PHP arrays');
    expect(registry.getSupportedExtensions()).toContain('.php');
  });

  describe('extract()', () => {
    it('returns [] for empty content', () => {
      expect(parser.extract('')).toEqual([]);
      expect(parser.extract('   \n   ')).toEqual([]);
    });

    it('returns [] for a PHP file with no return statement', () => {
      expect(parser.extract('<?php\n')).toEqual([]);
    });

    it('returns [] for an empty return array', () => {
      expect(parser.extract('<?php return [];')).toEqual([]);
      expect(parser.extract('<?php return array();')).toEqual([]);
    });

    it('extracts flat string entries', () => {
      const content = `<?php
return [
    'greeting' => 'Hello',
    'farewell' => 'Goodbye',
];
`;
      const entries = parser.extract(content);
      expect(entries).toHaveLength(2);
      expect(entries.find((e) => e.key === 'greeting')?.value).toBe('Hello');
      expect(entries.find((e) => e.key === 'farewell')?.value).toBe('Goodbye');
    });

    it('builds dot-notation keys from nested associative arrays', () => {
      const content = `<?php
return [
    'auth' => [
        'failed' => 'These credentials do not match our records.',
        'password' => 'The password is incorrect.',
    ],
    'welcome' => 'Welcome',
];
`;
      const entries = parser.extract(content);
      const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
      expect(map['auth.failed']).toBe('These credentials do not match our records.');
      expect(map['auth.password']).toBe('The password is incorrect.');
      expect(map['welcome']).toBe('Welcome');
      expect(entries).toHaveLength(3);
    });

    it('supports both `[...]` and `array(...)` syntax in the same file', () => {
      const content = `<?php
return [
    'short' => 'Short',
    'long' => array(
        'inner' => 'Inner',
    ),
];
`;
      const entries = parser.extract(content);
      expect(entries.find((e) => e.key === 'short')?.value).toBe('Short');
      expect(entries.find((e) => e.key === 'long.inner')?.value).toBe('Inner');
    });

    it('round-trips `:placeholder` as an opaque substring', () => {
      const content = `<?php return ['hello' => 'Welcome :name, you have :count messages'];`;
      const entries = parser.extract(content);
      expect(entries[0]?.value).toBe('Welcome :name, you have :count messages');
    });

    it('decodes single-quoted escape sequences (\\\\\' and \\\\\\\\)', () => {
      const content = `<?php return ['msg' => 'It\\'s a back\\\\slash'];`;
      const entries = parser.extract(content);
      expect(entries[0]?.value).toBe("It's a back\\slash");
    });

    it('decodes double-quoted escape sequences (no interpolation tokens)', () => {
      const content = `<?php return ['msg' => "line1\\nline2 \\$100"];`;
      const entries = parser.extract(content);
      expect(entries[0]?.value).toBe('line1\nline2 $100');
    });

    it('strips a UTF-8 BOM before the `<?php` tag', () => {
      const content = `\uFEFF<?php return ['greeting' => 'Hello'];`;
      const entries = parser.extract(content);
      expect(entries).toEqual([{ key: 'greeting', value: 'Hello' }]);
    });

    it('skips numeric, boolean, and null values without rejecting them', () => {
      const content = `<?php
return [
    'name' => 'Test',
    'max' => 255,
    'enabled' => true,
    'default' => null,
];
`;
      const entries = parser.extract(content);
      expect(entries).toEqual([{ key: 'name', value: 'Test' }]);
    });

    it('contributes no entries from an empty nested array', () => {
      const content = `<?php return ['rules' => [], 'welcome' => 'Hi'];`;
      const entries = parser.extract(content);
      expect(entries).toEqual([{ key: 'welcome', value: 'Hi' }]);
    });

    it('rejects double-quoted interpolation ("Hello $name") with ValidationError', () => {
      const content = `<?php return ['msg' => "Hello $name"];`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });

    it('rejects heredoc values with ValidationError', () => {
      const content = `<?php
return [
    'block' => <<<EOT
multi-line
EOT
,
];
`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });

    it('rejects nowdoc values with ValidationError', () => {
      const content = `<?php
return [
    'block' => <<<'EOT'
multi-line nowdoc
EOT
,
];
`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });

    it("rejects string concatenation ('a' . 'b') with ValidationError", () => {
      const content = `<?php return ['msg' => 'Hello, ' . 'world'];`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });

    it('rejects function-call expressions as values', () => {
      const content = `<?php return ['msg' => trans('greeting')];`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });

    it('rejects when the top-level return is not an array', () => {
      const content = `<?php return 'not an array';`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });

    it('rejects numeric-indexed entries (non-string keys)', () => {
      const content = `<?php return ['first', 'second'];`;
      expect(() => parser.extract(content)).toThrow(ValidationError);
    });
  });

  describe('pipe-pluralization warning gate', () => {
    it('tags values containing `|{n}` count markers with metadata.skipped', () => {
      const content = `<?php return ['apples' => '{0} No apples|{1} One apple|[2,*] Many apples'];`;
      const entries = parser.extract(content);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.metadata).toEqual({
        skipped: { reason: SKIP_REASON_PIPE_PLURALIZATION },
      });
    });

    it('tags values containing `|[n,m]` range markers', () => {
      const content = `<?php return ['days' => '[0,0] No days|[1,6] A few|[7,*] Full week'];`;
      const entries = parser.extract(content);
      expect(entries[0]?.metadata?.['skipped']).toEqual({
        reason: SKIP_REASON_PIPE_PLURALIZATION,
      });
    });

    it('does NOT tag simple pipe-delimited values without explicit count markers', () => {
      const content = `<?php return ['fruit' => 'apples|apple'];`;
      const entries = parser.extract(content);
      expect(entries[0]?.metadata).toBeUndefined();
    });

    it('does NOT tag prose values that happen to contain literal pipes', () => {
      const content = `<?php return ['msg' => 'Choose A | B | C'];`;
      const entries = parser.extract(content);
      expect(entries[0]?.metadata).toBeUndefined();
    });

    it('preserves the original string value in the tagged entry (no preprocessing)', () => {
      const content = `<?php return ['x' => '{0}none|{1}one|[2,*]many'];`;
      const entries = parser.extract(content);
      expect(entries[0]?.value).toBe('{0}none|{1}one|[2,*]many');
    });

    it('emits a Logger.warn naming the dot-path key when tagging', () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      try {
        parser.extract(`<?php return ['nav' => ['items' => '{0}none|{1}one|[2,*]many']];`);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nav.items'));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pipe-pluralization'));
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('does not warn for plain translatable strings', () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
      try {
        parser.extract(`<?php return ['hello' => 'Hello, world'];`);
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('max depth cap', () => {
    it('accepts nesting up to the configured maxDepth', () => {
      const shallow = new PhpArraysFormatParser({ maxDepth: 4 });
      // 3 levels of nesting: [ 'a' => [ 'b' => [ 'c' => 'x' ] ] ]
      const content = `<?php return ['a' => ['b' => ['c' => 'x']]];`;
      expect(() => shallow.extract(content)).not.toThrow();
    });

    it('throws PhpArraysCapExceededError when nesting exceeds maxDepth', () => {
      const shallow = new PhpArraysFormatParser({ maxDepth: 2 });
      // 3 levels of nesting — exceeds cap of 2
      const content = `<?php return ['a' => ['b' => ['c' => 'x']]];`;
      expect(() => shallow.extract(content)).toThrow(PhpArraysCapExceededError);
    });

    it('defaults to depth 32 when no option is provided', () => {
      // 32 levels pass, 33 would exceed — construct a deep nest programmatically.
      const defaultParser = new PhpArraysFormatParser();
      // Build exactly 32 levels of nested arrays: 1 outer + 31 inner
      let inner = `'x'`;
      for (let i = 0; i < 31; i++) inner = `['k${i}' => ${inner}]`;
      const ok = `<?php return ['root' => ${inner}];`;
      expect(() => defaultParser.extract(ok)).not.toThrow();

      // 33 levels should exceed
      let deeper = `'x'`;
      for (let i = 0; i < 32; i++) deeper = `['k${i}' => ${deeper}]`;
      const tooDeep = `<?php return ['root' => ${deeper}];`;
      expect(() => defaultParser.extract(tooDeep)).toThrow(PhpArraysCapExceededError);
    });

    it('cap-exceeded error names the dot-path where the limit was hit', () => {
      const shallow = new PhpArraysFormatParser({ maxDepth: 2 });
      const content = `<?php return ['outer' => ['inner' => ['leaf' => 'x']]];`;
      expect(() => shallow.extract(content)).toThrow(/outer\.inner/);
    });
  });

  describe('reconstruct()', () => {
    it('returns content unchanged for empty entries', () => {
      const content = `<?php return ['hi' => 'Hello'];`;
      expect(parser.reconstruct(content, [])).toBe(content);
    });

    it('replaces a single flat string, preserving surrounding bytes verbatim', () => {
      const content = `<?php\n\nreturn [\n    'greeting' => 'Hello',\n];\n`;
      const out = parser.reconstruct(content, [
        { key: 'greeting', value: 'Hello', translation: 'Hallo' },
      ]);
      expect(out).toBe(`<?php\n\nreturn [\n    'greeting' => 'Hallo',\n];\n`);
    });

    it('rewrites a dot-path key inside a nested array', () => {
      const content = `<?php
return [
    'auth' => [
        'failed' => 'These credentials do not match our records.',
    ],
];
`;
      const out = parser.reconstruct(content, [
        {
          key: 'auth.failed',
          value: 'These credentials do not match our records.',
          translation: 'Ungültige Zugangsdaten.',
        },
      ]);
      expect(out).toContain(`'failed' => 'Ungültige Zugangsdaten.'`);
      expect(out).toContain(`'auth' => [`);
    });

    it('preserves single-quoted quote style for a single-quoted source', () => {
      const content = `<?php return ['x' => 'one'];`;
      const out = parser.reconstruct(content, [
        { key: 'x', value: 'one', translation: 'uno' },
      ]);
      expect(out).toBe(`<?php return ['x' => 'uno'];`);
    });

    it('preserves double-quoted quote style for a double-quoted source', () => {
      const content = `<?php return ['x' => "one"];`;
      const out = parser.reconstruct(content, [
        { key: 'x', value: 'one', translation: 'uno' },
      ]);
      expect(out).toBe(`<?php return ['x' => "uno"];`);
    });

    it("escapes apostrophes in single-quoted translations as \\'", () => {
      const content = `<?php return ['msg' => 'ok'];`;
      const out = parser.reconstruct(content, [
        { key: 'msg', value: 'ok', translation: "It's fine" },
      ]);
      expect(out).toBe(`<?php return ['msg' => 'It\\'s fine'];`);
    });

    it('escapes backslashes in single-quoted translations as \\\\', () => {
      const content = `<?php return ['path' => 'x'];`;
      const out = parser.reconstruct(content, [
        { key: 'path', value: 'x', translation: 'C:\\Users' },
      ]);
      expect(out).toBe(`<?php return ['path' => 'C:\\\\Users'];`);
    });

    it('escapes $ in double-quoted translations as \\$ (prevents interpolation on re-parse)', () => {
      const content = `<?php return ['price' => "n/a"];`;
      const out = parser.reconstruct(content, [
        { key: 'price', value: 'n/a', translation: '$100' },
      ]);
      expect(out).toBe(`<?php return ['price' => "\\$100"];`);
      const reExtracted = parser.extract(out);
      expect(reExtracted[0]?.value).toBe('$100');
    });

    it('escapes " in double-quoted translations as \\"', () => {
      const content = `<?php return ['msg' => "x"];`;
      const out = parser.reconstruct(content, [
        { key: 'msg', value: 'x', translation: 'She said "hi"' },
      ]);
      expect(out).toBe(`<?php return ['msg' => "She said \\"hi\\""];`);
    });

    it('leaves untranslated keys exactly as they appear in the source', () => {
      const content = `<?php return ['a' => 'one', 'b' => 'two', 'c' => 'three'];`;
      const out = parser.reconstruct(content, [
        { key: 'b', value: 'two', translation: 'zwei' },
      ]);
      expect(out).toBe(`<?php return ['a' => 'one', 'b' => 'zwei', 'c' => 'three'];`);
    });

    it('silently skips keys that are not present in the source (no insertion)', () => {
      const content = `<?php return ['a' => 'one'];`;
      const out = parser.reconstruct(content, [
        { key: 'a', value: 'one', translation: 'uno' },
        { key: 'not_in_source', value: 'new', translation: 'nuevo' },
      ]);
      expect(out).toBe(`<?php return ['a' => 'uno'];`);
    });

    it('preserves comments, PHPDoc, trailing commas, and irregular whitespace', () => {
      const content = `<?php
/**
 * Language Lines — do not delete.
 */

return [

    // Primary greeting.
    'hello'   =>   'Hello',    // trailing comment
    'bye' => 'Goodbye',
];
`;
      const out = parser.reconstruct(content, [
        { key: 'hello', value: 'Hello', translation: 'Hallo' },
      ]);
      expect(out).toBe(`<?php
/**
 * Language Lines — do not delete.
 */

return [

    // Primary greeting.
    'hello'   =>   'Hallo',    // trailing comment
    'bye' => 'Goodbye',
];
`);
    });

    it('rewrites values regardless of `[...]` vs `array(...)` syntax', () => {
      const content = `<?php return array('a' => 'one', 'b' => array('c' => 'two'));`;
      const out = parser.reconstruct(content, [
        { key: 'a', value: 'one', translation: 'uno' },
        { key: 'b.c', value: 'two', translation: 'dos' },
      ]);
      expect(out).toBe(`<?php return array('a' => 'uno', 'b' => array('c' => 'dos'));`);
    });

    it('handles multiple replacements on the same line via descending-offset rewrite', () => {
      const content = `<?php return ['a' => 'x', 'b' => 'y'];`;
      const out = parser.reconstruct(content, [
        { key: 'a', value: 'x', translation: 'apple' },
        { key: 'b', value: 'y', translation: 'banana' },
      ]);
      expect(out).toBe(`<?php return ['a' => 'apple', 'b' => 'banana'];`);
    });

    it('is byte-equal when reconstruct keeps values identical to extract', () => {
      const content = `<?php
return [
    'greeting' => 'Hello',
    'nav' => [
        'home' => 'Home',
    ],
];
`;
      const entries = parser.extract(content).map((e) => ({ ...e, translation: e.value }));
      expect(parser.reconstruct(content, entries)).toBe(content);
    });

    it('preserves a UTF-8 BOM before the `<?php` tag', () => {
      const content = `\uFEFF<?php return ['a' => 'one'];`;
      const out = parser.reconstruct(content, [
        { key: 'a', value: 'one', translation: 'uno' },
      ]);
      expect(out).toBe(`\uFEFF<?php return ['a' => 'uno'];`);
    });

    it('handles non-ASCII source positions correctly (UTF-16 offsets)', () => {
      const content = `<?php return ['hi' => '日本語', 'bye' => 'さようなら'];`;
      const out = parser.reconstruct(content, [
        { key: 'bye', value: 'さようなら', translation: 'Auf Wiedersehen' },
      ]);
      expect(out).toBe(`<?php return ['hi' => '日本語', 'bye' => 'Auf Wiedersehen'];`);
    });

    it('throws ValidationError when the file has no return array', () => {
      expect(() =>
        parser.reconstruct(`<?php echo 'hi';`, [
          { key: 'x', value: 'x', translation: 'y' },
        ]),
      ).toThrow(ValidationError);
    });
  });

  describe('15-fixture corpus', () => {
    const FIXTURES_DIR = path.resolve(
      __dirname,
      '../../fixtures/sync/formats/laravel-php',
    );
    const load = (name: string): string =>
      fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');

    // Fixtures the parser must accept and extract cleanly.
    const ACCEPT_FIXTURES = [
      '01-single-quote-escape.php',
      '02-double-quote-escapes.php',
      '06-mixed-syntax.php',
      '07-colon-placeholder.php',
      '08-trailing-commas.php',
      '09-ast-idempotence.php',
      '10-empty-nested-array.php',
      '11-dot-key-vs-nested.php',
      '12-escaped-dollar.php',
      '13-utf8-bom.php',
      '14-literal-pipe-in-prose.php',
      '15-irregular-whitespace-and-comments.php',
    ] as const;

    // Fixtures the allowlist must reject.
    const REJECT_FIXTURES = [
      '03-interpolation-rejected.php',
      '04-heredoc-rejected.php',
      '05-concat-rejected.php',
    ] as const;

    describe('accept fixtures — targeted assertions', () => {
      it("01: `\\'` and `\\\\` decode inside single-quoted values", () => {
        const entries = parser.extract(load('01-single-quote-escape.php'));
        const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
        expect(map['possessive']).toBe("It's a test");
        expect(map['backslash']).toBe('path\\to\\file');
      });

      it('02: `\\n`, `\\t`, `\\"` decode inside double-quoted (no interpolation)', () => {
        const entries = parser.extract(load('02-double-quote-escapes.php'));
        const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
        expect(map['newline']).toBe('line1\nline2');
        expect(map['quote']).toBe('She said "hi"');
        expect(map['tab']).toBe('col1\tcol2');
      });

      it('06: `[...]` and `array(...)` coexist and both walk', () => {
        const entries = parser.extract(load('06-mixed-syntax.php'));
        const keys = entries.map((e) => e.key).sort();
        expect(keys).toEqual(['long.inner', 'nested_short.a', 'short']);
      });

      it('07: `:placeholder` markers round-trip as opaque substrings', () => {
        const entries = parser.extract(load('07-colon-placeholder.php'));
        const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
        expect(map['greeting']).toBe('Welcome, :name!');
        expect(map['summary']).toBe('You have :count messages from :sender');
        expect(map['required']).toBe('The :attribute field is required.');
      });

      it('08: trailing commas parse without issue', () => {
        const entries = parser.extract(load('08-trailing-commas.php'));
        expect(entries).toHaveLength(4);
      });

      it('10: empty nested arrays contribute no entries and do not throw', () => {
        const entries = parser.extract(load('10-empty-nested-array.php'));
        const keys = entries.map((e) => e.key).sort();
        expect(keys).toEqual(['errors.required', 'welcome']);
      });

      it('11: literal-dot key coexists with a nested `user.name` path', () => {
        const entries = parser.extract(load('11-dot-key-vs-nested.php'));
        const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
        // Both keys exist and collide at the dot-path level — this is a
        // known Laravel ambiguity. The extract faithfully surfaces both;
        // downstream diff/translate logic is responsible for choosing a
        // resolution strategy (currently last-write-wins via Map semantics).
        expect(map['user.name']).toBeDefined();
        expect(entries.some((e) => e.key === 'user.name' && e.value === 'Literal dot key')).toBe(true);
        expect(entries.some((e) => e.key === 'user.name' && e.value === 'Nested under user.name')).toBe(true);
      });

      it('12: `"\\$100"` and `"\\${currency}"` decode to literal `$`', () => {
        const entries = parser.extract(load('12-escaped-dollar.php'));
        const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
        expect(map['price']).toBe('Only $100!');
        expect(map['note']).toBe('Use ${currency} in your local flavor');
      });

      it('13: UTF-8 BOM before `<?php` is handled transparently', () => {
        const content = load('13-utf8-bom.php');
        expect(content.charCodeAt(0)).toBe(0xfeff); // sanity: fixture actually has BOM
        const entries = parser.extract(content);
        expect(entries).toEqual([{ key: 'greeting', value: 'Hello with BOM' }]);
      });

      it('14: literal pipes in prose do NOT trigger the pluralization gate', () => {
        const entries = parser.extract(load('14-literal-pipe-in-prose.php'));
        expect(entries.every((e) => e.metadata === undefined)).toBe(true);
      });

      it('15: PHPDoc, block comments, and irregular whitespace produce normal extract', () => {
        const entries = parser.extract(load('15-irregular-whitespace-and-comments.php'));
        const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
        expect(map['hello']).toBe('Hello');
        expect(map['bye']).toBe('Goodbye');
        expect(map['nav.home']).toBe('Home');
        expect(map['nav.about']).toBe('About');
      });
    });

    describe('reject fixtures — allowlist throws ValidationError', () => {
      for (const name of REJECT_FIXTURES) {
        it(`rejects ${name}`, () => {
          expect(() => parser.extract(load(name))).toThrow(ValidationError);
        });
      }
    });

    describe('CI gate: AST/byte-equal round-trip when translations equal source', () => {
      // Fixture 11 is the explicit "collision ambiguity" case: extract emits
      // two entries with the same dot-path (`user.name`) from different
      // source locations. Identity round-trip is unreachable by design
      // because TranslatedEntry[] is keyed on the dot-path, so one location's
      // translation overwrites the other's. Covered separately below.
      const BYTE_EQUAL_FIXTURES = ACCEPT_FIXTURES.filter(
        (n) => n !== '11-dot-key-vs-nested.php',
      );
      for (const name of BYTE_EQUAL_FIXTURES) {
        it(`reconstructs ${name} byte-identically`, () => {
          const content = load(name);
          const extracted = parser.extract(content);
          // Skipped entries (pipe-pluralization) would never flow into
          // TranslatedEntry[], so exclude them here too — reconstruct then
          // leaves those bytes untouched by construction.
          const entries = extracted
            .filter((e) => !e.metadata?.['skipped'])
            .map((e) => ({ ...e, translation: e.value }));
          expect(parser.reconstruct(content, entries)).toBe(content);
        });
      }

      it('11: collision case — reconstruct with no translations is byte-equal (baseline)', () => {
        const content = load('11-dot-key-vs-nested.php');
        expect(parser.reconstruct(content, [])).toBe(content);
      });
    });

    describe('CI gate: byte-equal on untouched (span-surgical preservation)', () => {
      it('fixture 15: translating ONE key preserves comments, PHPDoc, and irregular whitespace verbatim', () => {
        const content = load('15-irregular-whitespace-and-comments.php');
        const out = parser.reconstruct(content, [
          { key: 'hello', value: 'Hello', translation: 'Hallo' },
        ]);

        // PHPDoc header preserved byte-for-byte
        expect(out).toContain('/**\n * Language Lines — do not delete.');
        // Inline comment preserved
        expect(out).toContain('// Primary greeting (do not rename).');
        // Block comment preserved
        expect(out).toContain('/* multiline\n       block comment */');
        // Irregular inner whitespace preserved around the rewritten key
        expect(out).toContain(`'hello'   =>   'Hallo',    // trailing`);
        // Everything besides the rewritten value stays identical
        expect(out.length).toBe(content.length + ('Hallo'.length - 'Hello'.length));
      });
    });
  });

  describe('supply-chain + runtime safety', () => {
    const phpParserDir = path.dirname(
      require.resolve('php-parser/package.json'),
    );
    const distBundle = fs.readFileSync(
      path.join(phpParserDir, 'dist', 'php-parser.js'),
      'utf-8',
    );
    const distMinBundle = fs.readFileSync(
      path.join(phpParserDir, 'dist', 'php-parser.min.js'),
      'utf-8',
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(phpParserDir, 'package.json'), 'utf-8'),
    ) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    // Token names assembled at runtime so the scanner does not mistake this
    // test's *asserting* strings for actual calls to the dangerous APIs.
    const CHILD_PROCESS_TOKEN = ['child', 'process'].join('_');
    const VM_TOKEN = 'vm';
    const WORKER_TOKEN = ['worker', 'threads'].join('_');
    const EVAL_TOKEN = ['e', 'val'].join('');
    const NEW_FUNCTION_TOKEN = ['Fun', 'ction'].join('');
    const SPAWN_SYNC_TOKEN = ['spawn', 'Sync'].join('');
    const EXEC_SYNC_TOKEN = ['e', 'xec', 'Sync'].join('');

    // Precise regexes — match dangerous APIs without colliding with the
    // innocent `class Function` AST-node declaration the audit flagged.
    const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
      [
        `require("${CHILD_PROCESS_TOKEN}")`,
        new RegExp(`require\\s*\\(\\s*["']${CHILD_PROCESS_TOKEN}["']\\s*\\)`),
      ],
      [
        `require("${VM_TOKEN}")`,
        new RegExp(`require\\s*\\(\\s*["']${VM_TOKEN}["']\\s*\\)`),
      ],
      [
        `require("${WORKER_TOKEN}")`,
        new RegExp(`require\\s*\\(\\s*["']${WORKER_TOKEN}["']\\s*\\)`),
      ],
      [
        `from "${CHILD_PROCESS_TOKEN}"`,
        new RegExp(`from\\s+["']${CHILD_PROCESS_TOKEN}["']`),
      ],
      [
        `from "${VM_TOKEN}"`,
        new RegExp(`from\\s+["']${VM_TOKEN}["']`),
      ],
      [EVAL_TOKEN, new RegExp(`\\b${EVAL_TOKEN}\\s*\\(`)],
      [
        `new ${NEW_FUNCTION_TOKEN}(`,
        new RegExp(`\\bnew\\s+${NEW_FUNCTION_TOKEN}\\s*\\(`),
      ],
      [SPAWN_SYNC_TOKEN, new RegExp(`\\b${SPAWN_SYNC_TOKEN}\\s*\\(`)],
      [EXEC_SYNC_TOKEN, new RegExp(`\\b${EXEC_SYNC_TOKEN}\\s*\\(`)],
    ];

    it('php-parser dist bundle contains no dangerous imports or code-exec primitives', () => {
      for (const [name, pattern] of FORBIDDEN) {
        expect({ name, match: pattern.test(distBundle) }).toEqual({
          name,
          match: false,
        });
      }
    });

    it('php-parser minified bundle contains no dangerous imports or code-exec primitives', () => {
      for (const [name, pattern] of FORBIDDEN) {
        expect({ name, match: pattern.test(distMinBundle) }).toEqual({
          name,
          match: false,
        });
      }
    });

    it('php-parser declares zero runtime dependencies', () => {
      expect(packageJson.dependencies ?? {}).toEqual({});
    });

    it('php-parser declares no preinstall or postinstall hooks', () => {
      expect(packageJson.scripts?.['preinstall']).toBeUndefined();
      expect(packageJson.scripts?.['postinstall']).toBeUndefined();
    });

    it(`exercising extract and reconstruct does not load ${CHILD_PROCESS_TOKEN} or ${VM_TOKEN} into require.cache`, () => {
      const fresh = new PhpArraysFormatParser();
      fresh.extract(
        `<?php return ['a' => 'Hello', 'nested' => ['b' => 'World']];`,
      );
      fresh.reconstruct(`<?php return ['a' => 'Hello'];`, [
        { key: 'a', value: 'Hello', translation: 'Hola' },
      ]);

      const cacheKeys = Object.keys(require.cache);
      const cpPattern = new RegExp(
        `(?:^|[\\/\\\\])${CHILD_PROCESS_TOKEN}(?:[\\/\\\\.]|$)`,
      );
      const vmPattern = new RegExp(`(?:^|[\\/\\\\])${VM_TOKEN}(?:[\\/\\\\.]|$)`);
      expect(cacheKeys.find((k) => cpPattern.test(k))).toBeUndefined();
      expect(cacheKeys.find((k) => vmPattern.test(k))).toBeUndefined();
    });
  });
});
