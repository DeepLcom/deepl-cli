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
  validateExtendedLanguageConstraints,
  validateXmlTags,
  warnIgnoredOptions,
  buildTranslationOptions,
  isFilePath,
  isTextBasedFile,
  isStructuredFile,
  getFileSize,
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

const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockedStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;
const mockedLoggerWarn = Logger.warn as jest.MockedFunction<typeof Logger.warn>;

describe('translate-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constants', () => {
    it('VALID_LANGUAGES should contain all language codes', () => {
      expect(VALID_LANGUAGES.size).toBe(121);
      expect(VALID_LANGUAGES.has('en')).toBe(true);
      expect(VALID_LANGUAGES.has('de')).toBe(true);
      expect(VALID_LANGUAGES.has('en-gb')).toBe(true);
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
      expect(TEXT_BASED_EXTENSIONS).toEqual(['.txt', '.md', '.html', '.htm', '.srt', '.xlf', '.xliff', '.json', '.yaml', '.yml']);
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

    it('should throw ValidationError for invalid language code', () => {
      expect(() => validateLanguageCodes(['xx'])).toThrow(ValidationError);
    });

    it('should include the invalid code in the error message', () => {
      expect(() => validateLanguageCodes(['zzzz'])).toThrow(/Invalid target language code: "zzzz"/);
    });

    it('should include valid codes list in the error message', () => {
      try {
        validateLanguageCodes(['invalid']);
        fail('Expected ValidationError');
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain('Valid codes:');
        expect((e as ValidationError).message).toContain('en');
        expect((e as ValidationError).message).toContain('de');
      }
    });

    it('should throw on first invalid code in array', () => {
      expect(() => validateLanguageCodes(['en', 'invalid', 'de'])).toThrow(/Invalid target language code: "invalid"/);
    });
  });

  describe('validateExtendedLanguageConstraints()', () => {
    const baseOptions: TranslateOptions = { to: 'hi' };

    it('should throw for extended language with latency_optimized model', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, modelType: 'latency_optimized' })
      ).toThrow(ValidationError);
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, modelType: 'latency_optimized' })
      ).toThrow(/only support quality_optimized/);
    });

    it('should throw for extended language with formality setting', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, formality: 'more' })
      ).toThrow(ValidationError);
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, formality: 'more' })
      ).toThrow(/do not support formality/);
    });

    it('should not throw for extended language with formality=default', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, formality: 'default' })
      ).not.toThrow();
    });

    it('should throw for extended language with glossary', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, glossary: 'my-glossary' })
      ).toThrow(ValidationError);
      expect(() =>
        validateExtendedLanguageConstraints('hi', { ...baseOptions, glossary: 'my-glossary' })
      ).toThrow(/do not support glossaries/);
    });

    it('should not throw for non-extended languages', () => {
      expect(() =>
        validateExtendedLanguageConstraints('de', {
          to: 'de',
          modelType: 'latency_optimized',
          formality: 'more',
          glossary: 'some-glossary',
        })
      ).not.toThrow();
    });

    it('should handle comma-separated target languages', () => {
      expect(() =>
        validateExtendedLanguageConstraints('hi, sw', { ...baseOptions, modelType: 'latency_optimized' })
      ).toThrow(/hi, sw/);
    });

    it('should not throw when only non-extended langs in comma-separated list', () => {
      expect(() =>
        validateExtendedLanguageConstraints('en, de', { to: 'en', modelType: 'latency_optimized' })
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
      expect(() => validateXmlTags(['div', 'span', 'myTag'], '--splitting-tags')).not.toThrow();
    });

    it('should accept tags starting with underscore', () => {
      expect(() => validateXmlTags(['_tag', '_my-tag'], '--splitting-tags')).not.toThrow();
    });

    it('should accept tags with hyphens, underscores, and periods', () => {
      expect(() => validateXmlTags(['my-tag', 'my_tag', 'my.tag'], '--splitting-tags')).not.toThrow();
    });

    it('should throw for empty tag', () => {
      expect(() => validateXmlTags([''], '--splitting-tags')).toThrow(ValidationError);
      expect(() => validateXmlTags([''], '--splitting-tags')).toThrow(/Tag name cannot be empty/);
    });

    it('should throw for whitespace-only tag', () => {
      expect(() => validateXmlTags(['  '], '--splitting-tags')).toThrow(/Tag name cannot be empty/);
    });

    it('should throw for tag starting with "xml" (lowercase)', () => {
      expect(() => validateXmlTags(['xmltag'], '--splitting-tags')).toThrow(/cannot start with "xml"/);
    });

    it('should throw for tag starting with "XML" (uppercase)', () => {
      expect(() => validateXmlTags(['XMLtag'], '--splitting-tags')).toThrow(/cannot start with "xml"/);
    });

    it('should throw for tag starting with "Xml" (mixed case)', () => {
      expect(() => validateXmlTags(['Xmltag'], '--splitting-tags')).toThrow(/cannot start with "xml"/);
    });

    it('should throw for tag with invalid characters', () => {
      expect(() => validateXmlTags(['tag!name'], '--splitting-tags')).toThrow(/Invalid XML tag name/);
    });

    it('should throw for tag starting with digit', () => {
      expect(() => validateXmlTags(['1tag'], '--splitting-tags')).toThrow(/Invalid XML tag name/);
    });

    it('should include param name in error message', () => {
      expect(() => validateXmlTags([''], '--ignore-tags')).toThrow(/--ignore-tags/);
    });

    it('should accept multiple valid tags', () => {
      expect(() => validateXmlTags(['header', 'footer', 'nav', 'aside'], '--splitting-tags')).not.toThrow();
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
      const result = buildTranslationOptions({ to: 'de', context: 'technical document' });
      expect(result.context).toBe('technical document');
    });

    it('should map splitSentences', () => {
      const result = buildTranslationOptions({ to: 'de', splitSentences: 'nonewlines' });
      expect(result.splitSentences).toBe('nonewlines');
    });

    it('should map tagHandling', () => {
      const result = buildTranslationOptions({ to: 'de', tagHandling: 'xml' });
      expect(result.tagHandling).toBe('xml');
    });

    it('should map modelType', () => {
      const result = buildTranslationOptions({ to: 'de', modelType: 'quality_optimized' });
      expect(result.modelType).toBe('quality_optimized');
    });

    it('should map preserveFormatting when explicitly set', () => {
      const result = buildTranslationOptions({ to: 'de', preserveFormatting: true });
      expect(result.preserveFormatting).toBe(true);
    });

    it('should map preserveFormatting=false when explicitly set', () => {
      const result = buildTranslationOptions({ to: 'de', preserveFormatting: false });
      expect(result.preserveFormatting).toBe(false);
    });

    it('should map showBilledCharacters', () => {
      const result = buildTranslationOptions({ to: 'de', showBilledCharacters: true });
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
      expect(isFilePath('anything', stats, mockFileTranslationService)).toBe(true);
    });

    it('should return true when cachedStats is null and file exists', () => {
      mockedExistsSync.mockReturnValue(true);
      expect(isFilePath('/some/file.txt', null, mockFileTranslationService)).toBe(true);
    });

    it('should return true when cachedStats is undefined and file exists', () => {
      mockedExistsSync.mockReturnValue(true);
      expect(isFilePath('/some/file.txt', undefined, mockFileTranslationService)).toBe(true);
    });

    it('should return false for URL inputs', () => {
      expect(isFilePath('http://example.com', null, mockFileTranslationService)).toBe(false);
      expect(isFilePath('https://example.com/file.txt', null, mockFileTranslationService)).toBe(false);
      expect(isFilePath('ftp://files.example.com', null, mockFileTranslationService)).toBe(false);
    });

    it('should return true for paths with separators when isSupportedFile returns true', () => {
      mockedExistsSync.mockReturnValue(false);
      (mockFileTranslationService.isSupportedFile as jest.Mock).mockReturnValue(true);
      expect(isFilePath('dir/file.txt', null, mockFileTranslationService)).toBe(true);
    });

    it('should return false for paths with separators when isSupportedFile returns false', () => {
      mockedExistsSync.mockReturnValue(false);
      (mockFileTranslationService.isSupportedFile as jest.Mock).mockReturnValue(false);
      expect(isFilePath('dir/file.xyz', null, mockFileTranslationService)).toBe(false);
    });

    it('should return false for plain text without path separators', () => {
      mockedExistsSync.mockReturnValue(false);
      expect(isFilePath('Hello world', null, mockFileTranslationService)).toBe(false);
    });

    it('should not call existsSync when cachedStats is provided', () => {
      const stats = { isFile: () => true } as fs.Stats;
      isFilePath('test.txt', stats, mockFileTranslationService);
      expect(mockedExistsSync).not.toHaveBeenCalled();
    });
  });

  describe('isTextBasedFile()', () => {
    it.each(TEXT_BASED_EXTENSIONS)('should return true for %s extension', (ext) => {
      expect(isTextBasedFile(`file${ext}`)).toBe(true);
    });

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
    it.each(STRUCTURED_EXTENSIONS)('should return true for %s extension', (ext) => {
      expect(isStructuredFile(`file${ext}`)).toBe(true);
    });

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

  describe('resolveGlossaryId()', () => {
    it('should delegate to glossaryService.resolveGlossaryId', async () => {
      const mockGlossaryService = {
        resolveGlossaryId: jest.fn().mockResolvedValue('glossary-123'),
      } as unknown as GlossaryService;

      const result = await resolveGlossaryId(mockGlossaryService, 'my-glossary');

      expect(result).toBe('glossary-123');
      expect(mockGlossaryService.resolveGlossaryId).toHaveBeenCalledWith('my-glossary');
    });

    it('should pass through errors from glossaryService', async () => {
      const mockGlossaryService = {
        resolveGlossaryId: jest.fn().mockRejectedValue(new Error('Not found')),
      } as unknown as GlossaryService;

      await expect(resolveGlossaryId(mockGlossaryService, 'missing')).rejects.toThrow('Not found');
    });
  });
});
