import * as fs from 'fs';
import {
  VALID_LANGUAGES,
  EXTENDED_ONLY_LANGUAGES,
  TEXT_BASED_EXTENSIONS,
  STRUCTURED_EXTENSIONS,
  SAFE_TEXT_SIZE_LIMIT,
  MAX_CUSTOM_INSTRUCTIONS,
  MAX_CUSTOM_INSTRUCTION_CHARS,
  validateLanguageCodes,
  validateSourceLanguage,
  validateTranslationLanguages,
  resetDeferredLanguageWarnings,
  validateExtendedLanguageConstraints,
  validateXmlTags,
  warnIgnoredOptions,
  buildTranslationOptions,
  isFilePath,
  isTextBasedFile,
  isStructuredFile,
  getFileSize,
  resolveFileOutputPath,
  resolveGlossaryId,
} from '../../src/cli/commands/translate/translate-utils';
import { ValidationError } from '../../src/utils/errors';
import { Logger } from '../../src/utils/logger';
import type { FileTranslationService } from '../../src/services/file-translation';
import type { GlossaryService } from '../../src/services/glossary';
import type { TranslateOptions } from '../../src/cli/commands/translate/types';

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    output: jest.fn(),
    verbose: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockedStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;
const mockedLoggerWarn = Logger.warn as jest.MockedFunction<typeof Logger.warn>;

describe('translate-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Module state, which clearing the Logger spy does not touch.
    resetDeferredLanguageWarnings();
  });

  describe('constants', () => {
    it('VALID_LANGUAGES should contain all language codes', () => {
      expect(VALID_LANGUAGES.size).toBe(125);
      expect(VALID_LANGUAGES.has('en')).toBe(true);
      expect(VALID_LANGUAGES.has('de')).toBe(true);
      expect(VALID_LANGUAGES.has('en-gb')).toBe(true);
      expect(VALID_LANGUAGES.has('de-ch')).toBe(true);
      expect(VALID_LANGUAGES.has('hi')).toBe(true);
    });

    it('EXTENDED_ONLY_LANGUAGES should contain only extended codes', () => {
      expect(EXTENDED_ONLY_LANGUAGES.size).toBe(82);
      expect(EXTENDED_ONLY_LANGUAGES.has('hi')).toBe(true);
      expect(EXTENDED_ONLY_LANGUAGES.has('sw')).toBe(true);
      expect(EXTENDED_ONLY_LANGUAGES.has('en')).toBe(false);
      expect(EXTENDED_ONLY_LANGUAGES.has('en-gb')).toBe(false);
    });

    it('TEXT_BASED_EXTENSIONS should include expected extensions', () => {
      expect(TEXT_BASED_EXTENSIONS).toEqual([
        '.txt',
        '.md',
        '.html',
        '.htm',
        '.srt',
        '.xlf',
        '.xliff',
        '.json',
        '.yaml',
        '.yml',
      ]);
    });

    it('STRUCTURED_EXTENSIONS should include expected extensions', () => {
      expect(STRUCTURED_EXTENSIONS).toEqual(['.json', '.yaml', '.yml']);
    });

    it('SAFE_TEXT_SIZE_LIMIT should be 100 KiB', () => {
      expect(SAFE_TEXT_SIZE_LIMIT).toBe(100 * 1024);
    });

    it('MAX_CUSTOM_INSTRUCTIONS should be 10', () => {
      expect(MAX_CUSTOM_INSTRUCTIONS).toBe(10);
    });

    it('MAX_CUSTOM_INSTRUCTION_CHARS should be 300', () => {
      expect(MAX_CUSTOM_INSTRUCTION_CHARS).toBe(300);
    });
  });

  describe('validateLanguageCodes()', () => {
    it('should accept valid core language codes', () => {
      expect(() => validateLanguageCodes(['en', 'de', 'fr'])).not.toThrow();
    });

    it('should accept valid regional language codes', () => {
      expect(() => validateLanguageCodes(['en-gb', 'pt-br'])).not.toThrow();
    });

    it('should accept valid extended language codes', () => {
      expect(() => validateLanguageCodes(['hi', 'sw', 'yue'])).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateLanguageCodes([])).not.toThrow();
    });

    it('should throw ValidationError for a malformed language code', () => {
      expect(() => validateLanguageCodes(['not-a-language'])).toThrow(
        ValidationError
      );
    });

    it('should include the invalid code in the error message', () => {
      expect(() => validateLanguageCodes(['zzzz'])).toThrow(
        /Invalid target language code: "zzzz"/
      );
    });

    it('should pass through a well-formed code the snapshot does not know', () => {
      // The API is the authority on which languages exist and the bundled
      // snapshot can lag it, so a well-formed code is the API's to judge.
      expect(() => validateLanguageCodes(['xx'])).not.toThrow();
      expect(() => validateLanguageCodes(['de-ch', 'fr-ca'])).not.toThrow();
      expect(() => validateLanguageCodes(['abc-1234'])).not.toThrow();
    });

    it('should warn that an unknown code is being deferred to the API', () => {
      mockedLoggerWarn.mockClear();
      validateLanguageCodes(['ex']);

      // Said before anything is sent, since the API answers an unknown code with
      // a bare "target_lang not supported" that points nowhere.
      const warning = mockedLoggerWarn.mock.calls
        .map((call) => String(call[0]))
        .join('\n');
      expect(warning).toContain('"ex" is not in the bundled language list');
      expect(warning).toContain('deepl languages');
    });

    it('should not warn about a code the snapshot lists', () => {
      mockedLoggerWarn.mockClear();
      validateLanguageCodes(['de', 'en-gb']);

      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should still reject input that is not shaped like a language tag', () => {
      for (const code of [
        'g',
        'grman',
        'de_ch',
        'de-',
        '../etc/passwd',
        'de ch',
      ]) {
        expect(() => validateLanguageCodes([code])).toThrow(ValidationError);
      }
    });

    it('should emit a concise message and point at `deepl languages` for the full list', () => {
      try {
        validateLanguageCodes(['invalid']);
        fail('Expected ValidationError');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const err = e as ValidationError;
        // The message should NOT dump the 100+ valid-codes list inline.
        expect(err.message).not.toContain('Valid codes:');
        expect(err.message.split('\n').length).toBeLessThan(5);
        // The suggestion should still guide the user to `deepl languages`.
        expect(err.suggestion).toContain('deepl languages');
      }
    });

    it('should throw on first invalid code in array', () => {
      expect(() => validateLanguageCodes(['en', 'invalid', 'de'])).toThrow(
        /Invalid target language code: "invalid"/
      );
    });

    it('should warn once per unknown code however many times it is validated', () => {
      // Several input modes validate the same list on the way to one request.
      validateLanguageCodes(['ex']);
      validateLanguageCodes(['ex']);
      validateLanguageCodes(['de', 'ex']);

      expect(mockedLoggerWarn).toHaveBeenCalledTimes(1);
    });

    it('should warn once for each distinct unknown code', () => {
      validateLanguageCodes(['ex', 'zz']);
      validateLanguageCodes(['ex', 'zz']);

      const warnings = mockedLoggerWarn.mock.calls.map((call) =>
        String(call[0])
      );
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('"ex"');
      expect(warnings[1]).toContain('"zz"');
    });

    it('should warn again after the warned-code state is reset', () => {
      validateLanguageCodes(['ex']);
      resetDeferredLanguageWarnings();
      validateLanguageCodes(['ex']);

      expect(mockedLoggerWarn).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateSourceLanguage()', () => {
    it('should accept an absent source language, which means auto-detect', () => {
      expect(() => validateSourceLanguage(undefined)).not.toThrow();
      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should accept a code the snapshot lists', () => {
      expect(() => validateSourceLanguage('en')).not.toThrow();
      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should reject a malformed code as a source, not a target', () => {
      expect(() => validateSourceLanguage('not!!a!!lang')).toThrow(
        ValidationError
      );
      expect(() => validateSourceLanguage('not!!a!!lang')).toThrow(
        /Invalid source language code: "not!!a!!lang"/
      );
    });

    it('should defer a well-formed unknown code to the API with a warning', () => {
      expect(() => validateSourceLanguage('zz')).not.toThrow();

      const warning = mockedLoggerWarn.mock.calls
        .map((call) => String(call[0]))
        .join('\n');
      expect(warning).toContain('"zz" is not in the bundled language list');
    });

    it('should share the warned-code state with target validation', () => {
      validateLanguageCodes(['zz']);
      validateSourceLanguage('zz');

      expect(mockedLoggerWarn).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateTranslationLanguages()', () => {
    it('should reject a malformed target code', () => {
      expect(() => validateTranslationLanguages(['not!!a!!lang'], {})).toThrow(
        /Invalid target language code/
      );
    });

    it('should reject a malformed source code', () => {
      expect(() =>
        validateTranslationLanguages(['de'], { from: 'not!!a!!lang' })
      ).toThrow(/Invalid source language code/);
    });

    it('should enforce the extended-tier constraint over the whole target list', () => {
      expect(() =>
        validateTranslationLanguages(['de', 'hi'], { formality: 'more' })
      ).toThrow(/Language\(s\) hi do not support formality/);
    });

    it('should enforce the extended-tier constraint for a single target', () => {
      expect(() =>
        validateTranslationLanguages(['hi'], { modelType: 'latency_optimized' })
      ).toThrow(/only support quality_optimized/);
    });

    it('should accept a valid pair with no constrained options', () => {
      expect(() =>
        validateTranslationLanguages(['de', 'fr'], { from: 'en' })
      ).not.toThrow();
    });

    it('should not enforce an arm the caller left out', () => {
      // The input modes disagree about which flags they honour; a mode that
      // discards a flag passes it here as absent.
      expect(() =>
        validateTranslationLanguages(['hi'], { formality: 'more' })
      ).toThrow();
      expect(() => validateTranslationLanguages(['hi'], {})).not.toThrow();
    });
  });

  describe('validateExtendedLanguageConstraints()', () => {
    const baseOptions: TranslateOptions = { to: 'hi' };

    it('should throw for extended language with latency_optimized model', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          modelType: 'latency_optimized',
        })
      ).toThrow(ValidationError);
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          modelType: 'latency_optimized',
        })
      ).toThrow(/only support quality_optimized/);
    });

    it('should throw for extended language with formality setting', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          formality: 'more',
        })
      ).toThrow(ValidationError);
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          formality: 'more',
        })
      ).toThrow(/do not support formality/);
    });

    it('should not throw for extended language with formality=default', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          formality: 'default',
        })
      ).not.toThrow();
    });

    it('should throw for extended language with glossary', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          glossary: ['my-glossary'],
        })
      ).toThrow(ValidationError);
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          glossary: ['my-glossary'],
        })
      ).toThrow(/do not support glossaries/);
    });

    it('should not throw for an empty glossary list, which selects nothing', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', {
          ...baseOptions,
          glossary: [],
        })
      ).not.toThrow();
    });

    it('should not throw for non-extended languages', () => {
      expect(() =>
        validateExtendedLanguageConstraints('de', {
          modelType: 'latency_optimized',
          formality: 'more',
          glossary: ['some-glossary'],
        })
      ).not.toThrow();
    });

    it('should handle comma-separated target languages', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi, sw', {
          ...baseOptions,
          modelType: 'latency_optimized',
        })
      ).toThrow(/hi, sw/);
    });

    it('should not throw when only non-extended langs in comma-separated list', () => {
      expect(() =>
        validateExtendedLanguageConstraints('en, de', {
          modelType: 'latency_optimized',
        })
      ).not.toThrow();
    });

    it('should not throw for extended language with no conflicting options', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', baseOptions)
      ).not.toThrow();
    });
  });

  describe('validateXmlTags()', () => {
    it('should accept valid tag names', () => {
      expect(() =>
        validateXmlTags(['div', 'span', 'myTag'], '--splitting-tags')
      ).not.toThrow();
    });

    it('should accept tags starting with underscore', () => {
      expect(() =>
        validateXmlTags(['_tag', '_my-tag'], '--splitting-tags')
      ).not.toThrow();
    });

    it('should accept tags with hyphens, underscores, and periods', () => {
      expect(() =>
        validateXmlTags(['my-tag', 'my_tag', 'my.tag'], '--splitting-tags')
      ).not.toThrow();
    });

    it('should throw for empty tag', () => {
      expect(() => validateXmlTags([''], '--splitting-tags')).toThrow(
        ValidationError
      );
      expect(() => validateXmlTags([''], '--splitting-tags')).toThrow(
        /Tag name cannot be empty/
      );
    });

    it('should throw for whitespace-only tag', () => {
      expect(() => validateXmlTags(['  '], '--splitting-tags')).toThrow(
        /Tag name cannot be empty/
      );
    });

    it('should throw for tag starting with "xml" (lowercase)', () => {
      expect(() => validateXmlTags(['xmltag'], '--splitting-tags')).toThrow(
        /cannot start with "xml"/
      );
    });

    it('should throw for tag starting with "XML" (uppercase)', () => {
      expect(() => validateXmlTags(['XMLtag'], '--splitting-tags')).toThrow(
        /cannot start with "xml"/
      );
    });

    it('should throw for tag starting with "Xml" (mixed case)', () => {
      expect(() => validateXmlTags(['Xmltag'], '--splitting-tags')).toThrow(
        /cannot start with "xml"/
      );
    });

    it('should throw for tag with invalid characters', () => {
      expect(() => validateXmlTags(['tag!name'], '--splitting-tags')).toThrow(
        /Invalid XML tag name/
      );
    });

    it('should throw for tag starting with digit', () => {
      expect(() => validateXmlTags(['1tag'], '--splitting-tags')).toThrow(
        /Invalid XML tag name/
      );
    });

    it('should include param name in error message', () => {
      expect(() => validateXmlTags([''], '--ignore-tags')).toThrow(
        /--ignore-tags/
      );
    });

    it('should accept multiple valid tags', () => {
      expect(() =>
        validateXmlTags(
          ['header', 'footer', 'nav', 'aside'],
          '--splitting-tags'
        )
      ).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateXmlTags([], '--splitting-tags')).not.toThrow();
    });
  });

  describe('warnIgnoredOptions()', () => {
    it('should log warning for unsupported options that have values', () => {
      const options: TranslateOptions = {
        to: 'de',
        splitSentences: 'on',
        tagHandling: 'xml',
      };
      const supported = new Set<string>();

      warnIgnoredOptions('file', options, supported);

      expect(mockedLoggerWarn).toHaveBeenCalledTimes(1);
      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('--split-sentences')
      );
      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('--tag-handling')
      );
    });

    it('should not log warning for supported options', () => {
      const options: TranslateOptions = {
        to: 'de',
        splitSentences: 'on',
        modelType: 'quality_optimized',
      };
      const supported = new Set(['splitSentences', 'modelType']);

      warnIgnoredOptions('text', options, supported);

      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should not log warning for undefined options', () => {
      const options: TranslateOptions = {
        to: 'de',
      };
      const supported = new Set<string>();

      warnIgnoredOptions('text', options, supported);

      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should not log warning for false boolean options', () => {
      const options: TranslateOptions = {
        to: 'de',
        preserveFormatting: false,
        showBilledCharacters: false,
      };
      const supported = new Set<string>();

      warnIgnoredOptions('text', options, supported);

      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should not log warning for empty array options', () => {
      const options: TranslateOptions = {
        to: 'de',
        customInstruction: [],
      };
      const supported = new Set<string>();

      warnIgnoredOptions('text', options, supported);

      expect(mockedLoggerWarn).not.toHaveBeenCalled();
    });

    it('should include mode name in warning message', () => {
      const options: TranslateOptions = {
        to: 'de',
        context: 'some context',
      };
      const supported = new Set<string>();

      warnIgnoredOptions('document', options, supported);

      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('document mode does not support')
      );
    });

    it('should log warning for non-empty array options', () => {
      const options: TranslateOptions = {
        to: 'de',
        customInstruction: ['be formal'],
      };
      const supported = new Set<string>();

      warnIgnoredOptions('text', options, supported);

      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('--custom-instruction')
      );
    });

    it('should warn on --translation-memory when mode does not support it', () => {
      const options: TranslateOptions = {
        to: 'de',
        translationMemory: 'my-tm',
      };
      const supported = new Set<string>();

      warnIgnoredOptions('document', options, supported);

      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('--translation-memory')
      );
    });

    it('should warn on --tm-threshold when mode does not support it', () => {
      const options: TranslateOptions = {
        to: 'de',
        tmThreshold: 80,
      };
      const supported = new Set<string>();

      warnIgnoredOptions('directory', options, supported);

      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('--tm-threshold')
      );
    });
  });

  describe('buildTranslationOptions()', () => {
    it('should always include targetLang', () => {
      const result = buildTranslationOptions({ to: 'de' });
      expect(result.targetLang).toBe('de');
    });

    it('should map from to sourceLang', () => {
      const result = buildTranslationOptions({ to: 'de', from: 'en' });
      expect(result.sourceLang).toBe('en');
    });

    it('should map formality', () => {
      const result = buildTranslationOptions({ to: 'de', formality: 'more' });
      expect(result.formality).toBe('more');
    });

    it('should map context', () => {
      const result = buildTranslationOptions({
        to: 'de',
        context: 'technical document',
      });
      expect(result.context).toBe('technical document');
    });

    it('should map splitSentences', () => {
      const result = buildTranslationOptions({
        to: 'de',
        splitSentences: 'nonewlines',
      });
      expect(result.splitSentences).toBe('nonewlines');
    });

    it('should map tagHandling', () => {
      const result = buildTranslationOptions({ to: 'de', tagHandling: 'xml' });
      expect(result.tagHandling).toBe('xml');
    });

    it('should map modelType', () => {
      const result = buildTranslationOptions({
        to: 'de',
        modelType: 'quality_optimized',
      });
      expect(result.modelType).toBe('quality_optimized');
    });

    it('should map tagHandlingVersion so file and directory mode honour it too', () => {
      const result = buildTranslationOptions({
        to: 'de',
        tagHandling: 'html',
        tagHandlingVersion: 'v1',
      });
      expect(result.tagHandlingVersion).toBe('v1');
    });

    it('should reject tagHandlingVersion without tagHandling', () => {
      expect(() =>
        buildTranslationOptions({ to: 'de', tagHandlingVersion: 'v2' })
      ).toThrow('--tag-handling-version requires --tag-handling');
    });

    it('should reject a tagHandlingVersion that is neither v1 nor v2', () => {
      expect(() =>
        buildTranslationOptions({
          to: 'de',
          tagHandling: 'xml',
          tagHandlingVersion: 'v3',
        })
      ).toThrow('--tag-handling-version must be "v1" or "v2"');
    });

    it('should map preserveFormatting when explicitly set', () => {
      const result = buildTranslationOptions({
        to: 'de',
        preserveFormatting: true,
      });
      expect(result.preserveFormatting).toBe(true);
    });

    it('should map preserveFormatting=false when explicitly set', () => {
      const result = buildTranslationOptions({
        to: 'de',
        preserveFormatting: false,
      });
      expect(result.preserveFormatting).toBe(false);
    });

    it('should map showBilledCharacters', () => {
      const result = buildTranslationOptions({
        to: 'de',
        showBilledCharacters: true,
      });
      expect(result.showBilledCharacters).toBe(true);
    });

    it('should omit undefined fields', () => {
      const result = buildTranslationOptions({ to: 'de' });
      expect(result).toEqual({ targetLang: 'de' });
      expect(Object.keys(result)).toEqual(['targetLang']);
    });

    it('should omit falsy fields except preserveFormatting', () => {
      const result = buildTranslationOptions({
        to: 'de',
        from: '',
        formality: '',
        context: '',
      });
      expect(result).toEqual({ targetLang: 'de' });
    });
  });

  describe('isFilePath()', () => {
    let mockFileTranslationService: FileTranslationService;

    beforeEach(() => {
      mockFileTranslationService = {
        isSupportedFile: jest.fn().mockReturnValue(true),
      } as unknown as FileTranslationService;
    });

    it('should return true when cachedStats.isFile() returns true', () => {
      const stats = { isFile: () => true } as fs.Stats;
      expect(isFilePath('anything', stats, mockFileTranslationService)).toBe(
        true
      );
    });

    it('should return true when cachedStats is null and file exists', () => {
      mockedExistsSync.mockReturnValue(true);
      expect(
        isFilePath('/some/file.txt', null, mockFileTranslationService)
      ).toBe(true);
    });

    it('should return true when cachedStats is undefined and file exists', () => {
      mockedExistsSync.mockReturnValue(true);
      expect(
        isFilePath('/some/file.txt', undefined, mockFileTranslationService)
      ).toBe(true);
    });

    it('should return false for URL inputs', () => {
      expect(
        isFilePath('http://example.com', null, mockFileTranslationService)
      ).toBe(false);
      expect(
        isFilePath(
          'https://example.com/file.txt',
          null,
          mockFileTranslationService
        )
      ).toBe(false);
      expect(
        isFilePath('ftp://files.example.com', null, mockFileTranslationService)
      ).toBe(false);
    });

    it('should return true for paths with separators when isSupportedFile returns true', () => {
      mockedExistsSync.mockReturnValue(false);
      (mockFileTranslationService.isSupportedFile as jest.Mock).mockReturnValue(
        true
      );
      expect(isFilePath('dir/file.txt', null, mockFileTranslationService)).toBe(
        true
      );
    });

    it('should return false for paths with separators when isSupportedFile returns false', () => {
      mockedExistsSync.mockReturnValue(false);
      (mockFileTranslationService.isSupportedFile as jest.Mock).mockReturnValue(
        false
      );
      expect(isFilePath('dir/file.xyz', null, mockFileTranslationService)).toBe(
        false
      );
    });

    it('should return false for plain text without path separators', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(isFilePath('Hello world', null, mockFileTranslationService)).toBe(
        false
      );
    });

    it('should not call existsSync when cachedStats is provided', () => {
      const stats = { isFile: () => true } as fs.Stats;
      isFilePath('test.txt', stats, mockFileTranslationService);
      expect(mockedExistsSync).not.toHaveBeenCalled();
    });
  });

  describe('isTextBasedFile()', () => {
    it.each(TEXT_BASED_EXTENSIONS)(
      'should return true for %s extension',
      (ext) => {
        expect(isTextBasedFile(`file${ext}`)).toBe(true);
      }
    );

    it('should be case-insensitive', () => {
      expect(isTextBasedFile('file.TXT')).toBe(true);
      expect(isTextBasedFile('file.Json')).toBe(true);
      expect(isTextBasedFile('file.HTML')).toBe(true);
      expect(isTextBasedFile('file.MD')).toBe(true);
    });

    it('should return false for unknown extensions', () => {
      expect(isTextBasedFile('file.pdf')).toBe(false);
      expect(isTextBasedFile('file.docx')).toBe(false);
      expect(isTextBasedFile('file.exe')).toBe(false);
    });

    it('should return false for files without extensions', () => {
      expect(isTextBasedFile('Makefile')).toBe(false);
    });
  });

  describe('isStructuredFile()', () => {
    it.each(STRUCTURED_EXTENSIONS)(
      'should return true for %s extension',
      (ext) => {
        expect(isStructuredFile(`file${ext}`)).toBe(true);
      }
    );

    it('should be case-insensitive', () => {
      expect(isStructuredFile('file.JSON')).toBe(true);
      expect(isStructuredFile('file.YAML')).toBe(true);
      expect(isStructuredFile('file.Yml')).toBe(true);
    });

    it('should return false for unknown extensions', () => {
      expect(isStructuredFile('file.txt')).toBe(false);
      expect(isStructuredFile('file.html')).toBe(false);
      expect(isStructuredFile('file.md')).toBe(false);
    });

    it('should return false for files without extensions', () => {
      expect(isStructuredFile('Makefile')).toBe(false);
    });
  });

  describe('getFileSize()', () => {
    it('should return file size for existing file', () => {
      mockedStatSync.mockReturnValue({ size: 4096 } as fs.Stats);
      expect(getFileSize('/some/file.txt')).toBe(4096);
    });

    it('should return null when file does not exist', () => {
      mockedStatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(getFileSize('/nonexistent/file.txt')).toBeNull();
    });

    it('should return 0 for empty file', () => {
      mockedStatSync.mockReturnValue({ size: 0 } as fs.Stats);
      expect(getFileSize('/some/empty.txt')).toBe(0);
    });
  });

  describe('resolveFileOutputPath()', () => {
    const asDirectory = () =>
      mockedStatSync.mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
    const asFile = () =>
      mockedStatSync.mockReturnValue({
        isDirectory: () => false,
      } as fs.Stats);
    const asMissing = () =>
      mockedStatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

    it('derives <stem>.<lang>.<ext> inside an existing directory', () => {
      asDirectory();
      expect(resolveFileOutputPath('/src/t.md', '/out', 'ko')).toBe(
        '/out/t.ko.md'
      );
    });

    it('treats a trailing slash the same as no trailing slash', () => {
      asDirectory();
      expect(resolveFileOutputPath('/src/t.md', '/out/', 'ko')).toBe(
        '/out/t.ko.md'
      );
    });

    it('names by the source stem, not the directory, so two locales cannot collide', () => {
      asDirectory();
      expect(resolveFileOutputPath('/src/messages.json', '/out', 'ko')).toBe(
        '/out/messages.ko.json'
      );
      expect(resolveFileOutputPath('/src/messages.json', '/out', 'ja')).toBe(
        '/out/messages.ja.json'
      );
    });

    it('leaves an existing file path untouched', () => {
      asFile();
      expect(resolveFileOutputPath('/src/t.md', '/out/explicit.md', 'ko')).toBe(
        '/out/explicit.md'
      );
    });

    it('leaves a non-existent path untouched, so it still means "file to create"', () => {
      asMissing();
      expect(resolveFileOutputPath('/src/t.md', '/out/new.md', 'ko')).toBe(
        '/out/new.md'
      );
    });

    it('honours a trailing slash on a directory that does not exist yet', () => {
      asMissing();
      expect(resolveFileOutputPath('/src/t.md', '/out/new-dir/', 'ko')).toBe(
        '/out/new-dir/t.ko.md'
      );
    });

    it('leaves stdout alone without touching the filesystem', () => {
      expect(resolveFileOutputPath('/src/t.md', '-', 'ko')).toBe('-');
      expect(mockedStatSync).not.toHaveBeenCalled();
    });

    it('uses the converted extension when an output format is given', () => {
      asDirectory();
      expect(
        resolveFileOutputPath('/src/report.pdf', '/out', 'de', 'docx')
      ).toBe('/out/report.de.docx');
    });

    it('ignores the output format for an explicit file path', () => {
      asFile();
      expect(
        resolveFileOutputPath('/src/report.pdf', '/out/r.de.pdf', 'de', 'docx')
      ).toBe('/out/r.de.pdf');
    });
  });

  describe('resolveGlossaryId()', () => {
    it('should delegate to glossaryService.resolveGlossaryId', async () => {
      const mockGlossaryService = {
        resolveGlossaryId: jest.fn().mockResolvedValue('glossary-123'),
      } as unknown as GlossaryService;

      const result = await resolveGlossaryId(
        mockGlossaryService,
        'my-glossary'
      );

      expect(result).toBe('glossary-123');
      expect(mockGlossaryService.resolveGlossaryId).toHaveBeenCalledWith(
        'my-glossary',
        undefined
      );
    });

    it('should forward the expected language pair for the preflight check', async () => {
      const mockGlossaryService = {
        resolveGlossaryId: jest.fn().mockResolvedValue('glossary-123'),
      } as unknown as GlossaryService;

      await resolveGlossaryId(mockGlossaryService, 'my-glossary', {
        from: 'en',
        targets: ['de'],
      });

      expect(mockGlossaryService.resolveGlossaryId).toHaveBeenCalledWith(
        'my-glossary',
        {
          from: 'en',
          targets: ['de'],
        }
      );
    });

    it('should pass through errors from glossaryService', async () => {
      const mockGlossaryService = {
        resolveGlossaryId: jest.fn().mockRejectedValue(new Error('Not found')),
      } as unknown as GlossaryService;

      await expect(
        resolveGlossaryId(mockGlossaryService, 'missing')
      ).rejects.toThrow('Not found');
    });
  });
});
