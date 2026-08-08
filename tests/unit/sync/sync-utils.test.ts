import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveTargetPath,
  assertPathWithinRoot,
  getParserForBucket,
  mergePulledTranslations,
} from '../../../src/sync/sync-utils';
import { createDefaultRegistry } from '../../../src/formats';
import { ValidationError } from '../../../src/utils/errors';

describe('resolveTargetPath()', () => {
  it('should replace locale in filename', () => {
    expect(resolveTargetPath('locales/en.json', 'en', 'de')).toBe(
      'locales/de.json'
    );
  });

  it('should replace locale in directory path', () => {
    expect(resolveTargetPath('locales/en/common.json', 'en', 'de')).toBe(
      'locales/de/common.json'
    );
  });

  it('should not partially match within longer words', () => {
    expect(resolveTargetPath('content/en.json', 'en', 'de')).toBe(
      'content/de.json'
    );
    // "content" contains "en" but only as a substring, not as a path segment
    // A path with no locale at a word boundary throws ValidationError
    expect(() =>
      resolveTargetPath('contents/messages.json', 'en', 'de')
    ).toThrow(ValidationError);
  });

  it('should handle regional locale codes', () => {
    expect(resolveTargetPath('locales/en-US.json', 'en-US', 'de')).toBe(
      'locales/de.json'
    );
  });

  it('should replace at start of path', () => {
    expect(resolveTargetPath('en/messages.json', 'en', 'de')).toBe(
      'de/messages.json'
    );
  });

  it('should handle multiple occurrences', () => {
    expect(resolveTargetPath('en/data/en.json', 'en', 'de')).toBe(
      'de/data/de.json'
    );
  });

  it('should handle underscore boundary (ARB format)', () => {
    expect(resolveTargetPath('app_en.arb', 'en', 'de')).toBe('app_de.arb');
  });

  it('should handle dot boundary (iOS .lproj)', () => {
    expect(resolveTargetPath('en.lproj/Localizable.strings', 'en', 'de')).toBe(
      'de.lproj/Localizable.strings'
    );
  });

  it('should throw ValidationError when locale not found in path', () => {
    expect(() =>
      resolveTargetPath('res/values/strings.xml', 'en', 'de')
    ).toThrow(ValidationError);
    expect(() =>
      resolveTargetPath('res/values/strings.xml', 'en', 'de')
    ).toThrow(
      'Cannot resolve target path: locale "en" not found in path "res/values/strings.xml"'
    );
  });

  it('should throw ValidationError when path is unchanged after substitution', () => {
    expect(() => resolveTargetPath('messages.json', 'fr', 'de')).toThrow(
      ValidationError
    );
  });

  it('should treat $1 in targetLocale literally, not as a backreference', () => {
    const result = resolveTargetPath('locales/en.json', 'en', 'de$1');
    expect(result).toBe('locales/de$1.json');
  });

  it('should treat $2 in targetLocale literally', () => {
    const result = resolveTargetPath('locales/en/messages.json', 'en', 'de$2');
    expect(result).toBe('locales/de$2/messages.json');
  });
});

describe('resolveTargetPath() with targetPathPattern', () => {
  it('should resolve Android XML target path via {locale} template', () => {
    const result = resolveTargetPath(
      'res/values/strings.xml',
      'en',
      'de',
      'res/values-{locale}/strings.xml'
    );
    expect(result).toBe('res/values-de/strings.xml');
  });

  it('should resolve XLIFF target path via {locale} template', () => {
    const result = resolveTargetPath(
      'src/locale/messages.xlf',
      'en',
      'de',
      'src/locale/messages.{locale}.xlf'
    );
    expect(result).toBe('src/locale/messages.de.xlf');
  });

  it('should replace {basename} with source file basename', () => {
    const result = resolveTargetPath(
      'res/values/arrays.xml',
      'en',
      'de',
      'res/values-{locale}/{basename}'
    );
    expect(result).toBe('res/values-de/arrays.xml');
  });

  it('should handle multiple {locale} occurrences', () => {
    const result = resolveTargetPath(
      'src/file.txt',
      'en',
      'fr',
      '{locale}/output/{locale}.json'
    );
    expect(result).toBe('fr/output/fr.json');
  });

  it('should ignore sourceLocale when pattern is provided', () => {
    const result = resolveTargetPath(
      'res/values/strings.xml',
      'en',
      'ja',
      'res/values-{locale}/strings.xml'
    );
    expect(result).toBe('res/values-ja/strings.xml');
  });
});

describe('resolveTargetPath() dash-leading rendered paths', () => {
  it('should reject a rendered path whose first segment comes from a dash-leading {basename}', () => {
    expect(() =>
      resolveTargetPath(
        '--pathspec-from-file=x.json',
        'en',
        'de',
        '{basename}.{locale}.json'
      )
    ).toThrow(ValidationError);
  });

  it('should reject a rendered path whose first segment comes from a dash-leading source directory', () => {
    expect(() => resolveTargetPath('-o/en.json', 'en', 'de')).toThrow(
      ValidationError
    );
  });

  it('should reject a literal dash-leading pattern reaching resolveTargetPath', () => {
    expect(() =>
      resolveTargetPath(
        'locales/en.json',
        'en',
        'de',
        '--pathspec-from-file={locale}'
      )
    ).toThrow(ValidationError);
  });

  it('should allow a dash inside a rendered segment', () => {
    expect(resolveTargetPath('locales/en.json', 'en', 'zh-Hans')).toBe(
      'locales/zh-Hans.json'
    );
    expect(
      resolveTargetPath(
        'res/values/strings.xml',
        'en',
        'de',
        'res/values-{locale}/strings.xml'
      )
    ).toBe('res/values-de/strings.xml');
  });

  it('should allow a dash-leading segment that is not the first', () => {
    expect(
      resolveTargetPath(
        'src/f.txt',
        'en',
        'de',
        'locales/-legacy/{locale}.json'
      )
    ).toBe('locales/-legacy/de.json');
  });
});

describe('assertPathWithinRoot()', () => {
  it('should pass for a valid path within root', () => {
    expect(() =>
      assertPathWithinRoot('/project/locales/de.json', '/project')
    ).not.toThrow();
  });

  it('should throw ValidationError for path escaping with ../', () => {
    expect(() =>
      assertPathWithinRoot('/project/../etc/passwd', '/project')
    ).toThrow(ValidationError);
    expect(() =>
      assertPathWithinRoot('/project/../etc/passwd', '/project')
    ).toThrow('Target path escapes project root');
  });

  it('should pass for path exactly at root', () => {
    expect(() => assertPathWithinRoot('/project', '/project')).not.toThrow();
  });

  it('should throw for sibling directory', () => {
    expect(() =>
      assertPathWithinRoot('/other-project/file.json', '/project')
    ).toThrow(ValidationError);
  });

  it('sanitizes control chars in absPath echo', () => {
    expect.assertions(3);
    try {
      assertPathWithinRoot('/project/../etc/passwd\x1b[31m', '/project');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const msg = (err as ValidationError).message;
      expect(msg).not.toContain('\x1b');
      expect(msg).toContain('?');
    }
  });

  describe('symlink resolution', () => {
    let realRoot: string;
    let symlinkedRoot: string;

    beforeAll(() => {
      // Create a real directory and a symlink pointing at it. The macOS /tmp
      // → /private/tmp case is the canonical example; this test reproduces
      // that shape portably under os.tmpdir().
      realRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kxri-real-'));
      symlinkedRoot = path.join(
        os.tmpdir(),
        `kxri-link-${process.pid}-${Date.now()}`
      );
      fs.symlinkSync(realRoot, symlinkedRoot);
    });

    afterAll(() => {
      try {
        fs.unlinkSync(symlinkedRoot);
      } catch {
        /* may not exist */
      }
      try {
        fs.rmSync(realRoot, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    });

    it('accepts a path under the realpath when projectRoot is the symlink', () => {
      // projectRoot typed as the symlink, output path under the real form
      // → must pass: both resolve through realpath to the same inode.
      const outputViaReal = path.join(realRoot, 'out.xlf');
      expect(() =>
        assertPathWithinRoot(outputViaReal, symlinkedRoot)
      ).not.toThrow();
    });

    it('accepts a path under the symlink when projectRoot is the realpath', () => {
      // The reverse macOS case: loadSyncConfig captures the resolved root
      // (/private/tmp/foo) but the user types --output via the symlink form
      // (/tmp/foo/out.xlf). Both forms must resolve identically.
      const outputViaSymlink = path.join(symlinkedRoot, 'out.xlf');
      expect(() =>
        assertPathWithinRoot(outputViaSymlink, realRoot)
      ).not.toThrow();
    });

    it('rejects a symlink inside the project that points outside', () => {
      // Defense-in-depth: realpath resolution catches symlink-based escapes.
      // A symlink inside the project pointing at a sibling path must be
      // rejected.
      const escapeTarget = fs.mkdtempSync(
        path.join(os.tmpdir(), 'kxri-escape-')
      );
      const escapeLink = path.join(realRoot, 'escape');
      fs.symlinkSync(escapeTarget, escapeLink);
      try {
        expect(() =>
          assertPathWithinRoot(path.join(escapeLink, 'leak.xlf'), realRoot)
        ).toThrow(ValidationError);
      } finally {
        fs.unlinkSync(escapeLink);
        fs.rmSync(escapeTarget, { recursive: true, force: true });
      }
    });

    it('accepts a non-existent path under an existing root (output-path case)', () => {
      // Output paths typically do not exist when assertPathWithinRoot runs.
      // The helper walks up to the closest existing ancestor and resolves
      // through that, then re-appends the unresolved tail.
      const futureOutput = path.join(realRoot, 'subdir', 'will-not-exist.xlf');
      expect(() => assertPathWithinRoot(futureOutput, realRoot)).not.toThrow();
    });
  });
});

describe('resolveTargetPath() error message sanitization', () => {
  it('sanitizes control chars in sourceLocale and sourcePath echoes', () => {
    expect.assertions(3);
    try {
      resolveTargetPath('res/bad\x00path/strings.xml', 'en\x1b', 'de');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const msg = (err as ValidationError).message;
      expect(msg).not.toContain('\x00');
      expect(msg).not.toContain('\x1b');
    }
  });
});

describe('getParserForBucket()', () => {
  it('resolves config-key bucket names via the registry', async () => {
    const registry = await createDefaultRegistry();
    expect(getParserForBucket(registry, 'android_xml')?.name).toBe(
      'Android XML'
    );
    expect(getParserForBucket(registry, 'ios_strings')?.name).toBe(
      'iOS Strings'
    );
    expect(getParserForBucket(registry, 'json')?.name).toBe('JSON i18n');
  });

  it('returns undefined for unknown bucket names', async () => {
    const registry = await createDefaultRegistry();
    expect(getParserForBucket(registry, 'tomll')).toBeUndefined();
  });
});

describe('mergePulledTranslations()', () => {
  it('should preserve existing target translations for keys not included in pull results', () => {
    const merged = mergePulledTranslations(
      [
        { key: 'greeting', value: 'Hello' },
        { key: 'farewell', value: 'Goodbye' },
      ],
      { greeting: 'Hallo' },
      new Map([['farewell', 'Tschuess']])
    );

    expect(merged).toEqual([
      {
        key: 'greeting',
        value: 'Hello',
        translation: 'Hallo',
        context: undefined,
        metadata: undefined,
      },
      {
        key: 'farewell',
        value: 'Goodbye',
        translation: 'Tschuess',
        context: undefined,
        metadata: undefined,
      },
    ]);
  });

  it('should omit a key the pull response and the target file both lack', () => {
    const merged = mergePulledTranslations(
      [
        { key: 'greeting', value: 'Hello' },
        { key: 'farewell', value: 'Goodbye' },
      ],
      { greeting: 'Hallo' }
    );

    expect(merged).toEqual([
      {
        key: 'greeting',
        value: 'Hello',
        translation: 'Hallo',
        context: undefined,
        metadata: undefined,
      },
    ]);
  });

  it('should keep an empty target translation rather than treating it as absent', () => {
    const merged = mergePulledTranslations(
      [{ key: 'optional_suffix', value: 'Ltd.' }],
      {},
      new Map([['optional_suffix', '']])
    );

    expect(merged).toEqual([
      {
        key: 'optional_suffix',
        value: 'Ltd.',
        translation: '',
        context: undefined,
        metadata: undefined,
      },
    ]);
  });

  it('should omit every key when the pull response is empty and no target exists', () => {
    expect(
      mergePulledTranslations(
        [
          { key: 'greeting', value: 'Hello' },
          { key: 'farewell', value: 'Goodbye' },
        ],
        {}
      )
    ).toEqual([]);
  });
});
