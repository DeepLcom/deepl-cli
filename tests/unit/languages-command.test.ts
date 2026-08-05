import {
  LanguagesCommand,
  partitionFeatureKeys,
  type LanguageDisplayEntry,
} from '../../src/cli/commands/languages';
import { LanguageInfo } from '../../src/api/deepl-client';
import { createMockLanguagesService } from '../helpers/mock-factories';

// Mock chalk to avoid ESM issues in tests
jest.mock('chalk', () => {
  const mockChalk = {
    bold: (text: string) => text,
    green: (text: string) => text,
    blue: (text: string) => text,
    gray: (text: string) => text,
    cyan: (text: string) => text,
  };
  return {
    __esModule: true,
    default: mockChalk,
  };
});

describe('LanguagesCommand', () => {
  let mockService: ReturnType<typeof createMockLanguagesService>;
  let languagesCommand: LanguagesCommand;

  const mockSourceLanguages: LanguageInfo[] = [
    { language: 'en', name: 'English' },
    { language: 'de', name: 'German' },
    { language: 'fr', name: 'French' },
    { language: 'es', name: 'Spanish' },
  ];

  const mockTargetLanguages: LanguageInfo[] = [
    { language: 'en-us', name: 'English (American)' },
    { language: 'en-gb', name: 'English (British)' },
    { language: 'de', name: 'German' },
    { language: 'fr', name: 'French' },
    { language: 'es', name: 'Spanish' },
    { language: 'ja', name: 'Japanese' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockService = createMockLanguagesService();
    languagesCommand = new LanguagesCommand(mockService);
  });

  describe('getSourceLanguages()', () => {
    it('should retrieve source languages from service', async () => {
      mockService.getSupportedLanguages.mockResolvedValue(mockSourceLanguages);

      const languages = await languagesCommand.getSourceLanguages();

      expect(mockService.getSupportedLanguages).toHaveBeenCalledWith('source');
      expect(languages).toEqual(mockSourceLanguages);
    });

    it('should handle API errors gracefully', async () => {
      mockService.getSupportedLanguages.mockRejectedValue(
        new Error('API connection failed')
      );

      await expect(languagesCommand.getSourceLanguages()).rejects.toThrow(
        'API connection failed'
      );
    });

    it('should return empty array when service has no client', async () => {
      const noClientService = createMockLanguagesService({
        getSupportedLanguages: jest.fn().mockResolvedValue([]),
        hasClient: jest.fn().mockReturnValue(false),
      });
      const noClientCommand = new LanguagesCommand(noClientService);
      const languages = await noClientCommand.getSourceLanguages();
      expect(languages).toEqual([]);
    });
  });

  describe('getTargetLanguages()', () => {
    it('should retrieve target languages from service', async () => {
      mockService.getSupportedLanguages.mockResolvedValue(mockTargetLanguages);

      const languages = await languagesCommand.getTargetLanguages();

      expect(mockService.getSupportedLanguages).toHaveBeenCalledWith('target');
      expect(languages).toEqual(mockTargetLanguages);
    });

    it('should handle API errors gracefully', async () => {
      mockService.getSupportedLanguages.mockRejectedValue(
        new Error('API connection failed')
      );

      await expect(languagesCommand.getTargetLanguages()).rejects.toThrow(
        'API connection failed'
      );
    });

    it('should return empty array when service has no client', async () => {
      const noClientService = createMockLanguagesService({
        getSupportedLanguages: jest.fn().mockResolvedValue([]),
        hasClient: jest.fn().mockReturnValue(false),
      });
      const noClientCommand = new LanguagesCommand(noClientService);
      const languages = await noClientCommand.getTargetLanguages();
      expect(languages).toEqual([]);
    });
  });

  describe('formatLanguages()', () => {
    it('should format source languages with header', () => {
      const formatted = languagesCommand.formatLanguages(
        mockSourceLanguages,
        'source'
      );

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('en');
      expect(formatted).toContain('English');
      expect(formatted).toContain('de');
      expect(formatted).toContain('German');
    });

    it('should format target languages with header', () => {
      const formatted = languagesCommand.formatLanguages(
        mockTargetLanguages,
        'target'
      );

      expect(formatted).toContain('Target Languages:');
      expect(formatted).toContain('en-us');
      expect(formatted).toContain('English (American)');
      expect(formatted).toContain('ja');
      expect(formatted).toContain('Japanese');
    });

    it('should include extended languages section', () => {
      const formatted = languagesCommand.formatLanguages(
        mockSourceLanguages,
        'source'
      );

      expect(formatted).toContain('Extended Languages');
      expect(formatted).toContain('quality_optimized only');
      expect(formatted).toContain('Hindi');
      expect(formatted).toContain('hi');
    });

    it('should show API names when available (API takes precedence)', () => {
      const apiLangs: LanguageInfo[] = [
        { language: 'en', name: 'English (API Name)' },
      ];
      const formatted = languagesCommand.formatLanguages(apiLangs, 'source');

      expect(formatted).toContain('English (API Name)');
    });

    it('should align language codes and names properly', () => {
      const formatted = languagesCommand.formatLanguages(
        mockSourceLanguages,
        'source'
      );
      const lines = formatted.split('\n');

      const languageLines = lines.slice(1);
      languageLines.forEach((line) => {
        if (line.trim() && !line.includes('Extended Languages')) {
          expect(line).toMatch(/^\s+\S+\s+.+$/);
        }
      });
    });

    it('should format both types correctly', () => {
      const sourceFormatted = languagesCommand.formatLanguages(
        mockSourceLanguages,
        'source'
      );
      const targetFormatted = languagesCommand.formatLanguages(
        mockTargetLanguages,
        'target'
      );

      expect(sourceFormatted).toContain('Source Languages:');
      expect(targetFormatted).toContain('Target Languages:');
      expect(sourceFormatted).not.toContain('Target Languages:');
      expect(targetFormatted).not.toContain('Source Languages:');
    });
  });

  describe('formatLanguages() with null client (registry-only mode)', () => {
    it('should show registry languages when service has no client and API returns empty', () => {
      const noClientService = createMockLanguagesService({
        hasClient: jest.fn().mockReturnValue(false),
      });
      const noClientCommand = new LanguagesCommand(noClientService);
      const formatted = noClientCommand.formatLanguages([], 'source');

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('en');
      expect(formatted).toContain('English');
      expect(formatted).toContain('Extended Languages');
    });

    it('should show target languages from registry when service has no client', () => {
      const noClientService = createMockLanguagesService({
        hasClient: jest.fn().mockReturnValue(false),
      });
      const noClientCommand = new LanguagesCommand(noClientService);
      const formatted = noClientCommand.formatLanguages([], 'target');

      expect(formatted).toContain('Target Languages:');
      expect(formatted).toContain('en-gb');
      expect(formatted).toContain('English (British)');
    });
  });

  describe('mergeWithRegistry()', () => {
    it('should use API names when available', () => {
      const apiLangs: LanguageInfo[] = [{ language: 'de', name: 'Deutsch' }];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'source');
      const de = merged.find((e) => e.code === 'de');
      expect(de?.name).toBe('Deutsch');
    });

    it('should fall back to registry names for languages not in API response', () => {
      const merged = languagesCommand.mergeWithRegistry([], 'source');
      const hi = merged.find((e) => e.code === 'hi');
      expect(hi?.name).toBe('Hindi');
    });

    it('should include all registry languages', () => {
      const merged = languagesCommand.mergeWithRegistry(
        mockSourceLanguages,
        'source'
      );
      expect(merged.length).toBeGreaterThan(mockSourceLanguages.length);
      expect(merged.some((e) => e.code === 'hi')).toBe(true);
      expect(merged.some((e) => e.code === 'sw')).toBe(true);
    });

    it('should correctly categorize languages', () => {
      const merged = languagesCommand.mergeWithRegistry([], 'target');
      const enGb = merged.find((e) => e.code === 'en-gb');
      const en = merged.find((e) => e.code === 'en');
      const hi = merged.find((e) => e.code === 'hi');

      expect(enGb?.category).toBe('regional');
      expect(en?.category).toBe('core');
      expect(hi?.category).toBe('extended');
    });
  });

  describe('formatDisplayEntries()', () => {
    it('should show "No languages available" for empty entries', () => {
      const formatted = languagesCommand.formatDisplayEntries([], 'source');
      expect(formatted).toContain('No languages available');
    });

    it('should group core/regional before extended', () => {
      const entries = [
        { code: 'en', name: 'English', category: 'core' as const },
        { code: 'hi', name: 'Hindi', category: 'extended' as const },
        {
          code: 'en-gb',
          name: 'English (British)',
          category: 'regional' as const,
        },
      ];
      const formatted = languagesCommand.formatDisplayEntries(
        entries,
        'target'
      );
      const lines = formatted.split('\n');

      const enLine = lines.findIndex(
        (l) =>
          l.includes('en') && !l.includes('en-gb') && !l.includes('Extended')
      );
      const enGbLine = lines.findIndex((l) => l.includes('en-gb'));
      const extHeader = lines.findIndex((l) =>
        l.includes('Extended Languages')
      );
      const hiLine = lines.findIndex((l) => l.includes('Hindi'));

      expect(enLine).toBeLessThan(extHeader);
      expect(enGbLine).toBeLessThan(extHeader);
      expect(hiLine).toBeGreaterThan(extHeader);
    });
  });

  describe('untrusted API strings', () => {
    // Names, feature keys and feature statuses all come straight from
    // /v3/languages. A hostile or intercepted endpoint could otherwise move the
    // cursor, clear the screen, or hide text with a bidi override.
    const HOSTILE_NAME = 'Ger\u001b[2Kman\u200b';

    it('should strip control characters from a language name in text output', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        [{ code: 'de', name: HOSTILE_NAME, category: 'core' as const }],
        'target'
      );

      expect(formatted).not.toContain('\u001b');
      expect(formatted).not.toContain('\u200b');
      expect(formatted).toContain('Ger?[2Kman?');
    });

    it('should strip control characters from an extended-tier language name', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        [{ code: 'hi', name: HOSTILE_NAME, category: 'extended' as const }],
        'target'
      );

      expect(formatted).not.toContain('\u001b');
    });

    it('should strip control characters from a language name in table output', () => {
      const formatted = languagesCommand.formatLanguagesTable(
        [{ language: 'de' as const, name: HOSTILE_NAME }],
        'target'
      );

      // cli-table3 colours its own borders, so the assertion is about the cell:
      // the hostile name must not survive, and its sanitized form must appear.
      expect(formatted).not.toContain(HOSTILE_NAME);
      expect(formatted).toContain('Ger?[2Kman?');
    });

    it('should strip control characters from a feature key and status', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        [
          {
            code: 'de',
            name: 'German',
            category: 'core' as const,
            features: { 'glo\u001b[2Kssary': { status: 'be\u001b[2Kta' } },
          },
          {
            code: 'fr',
            name: 'French',
            category: 'core' as const,
            features: {},
          },
        ],
        'target',
        true
      );

      expect(formatted).not.toContain('\u001b');
    });
  });

  describe('formatAllLanguages()', () => {
    it('should format both source and target languages', () => {
      const formatted = languagesCommand.formatAllLanguages(
        mockSourceLanguages,
        mockTargetLanguages
      );

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('Target Languages:');
      expect(formatted).toContain('en');
      expect(formatted).toContain('English');
      expect(formatted).toContain('ja');
      expect(formatted).toContain('Japanese');
    });

    it('should separate source and target sections with blank line', () => {
      const formatted = languagesCommand.formatAllLanguages(
        mockSourceLanguages,
        mockTargetLanguages
      );

      const sections = formatted.split('\n\n');
      expect(sections.length).toBeGreaterThanOrEqual(2);
    });

    it('should include extended languages in both sections', () => {
      const formatted = languagesCommand.formatAllLanguages(
        mockSourceLanguages,
        mockTargetLanguages
      );

      const parts = formatted.split('Target Languages:');
      expect(parts[0]).toContain('Extended Languages');
      expect(parts[1]).toContain('Extended Languages');
    });
  });

  describe('supports_formality display', () => {
    it('should show [F] marker for target languages that support formality', () => {
      const targetLangsWithFormality: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
        {
          language: 'en-us',
          name: 'English (American)',
          supportsFormality: false,
        },
      ];
      const formatted = languagesCommand.formatLanguages(
        targetLangsWithFormality,
        'target'
      );

      expect(formatted).toContain('German');
      expect(formatted).toContain('[F]');
    });

    it('should not show [F] for languages that do not support formality', () => {
      const targetLangsWithFormality: LanguageInfo[] = [
        {
          language: 'en-us',
          name: 'English (American)',
          supportsFormality: false,
        },
      ];
      const formatted = languagesCommand.formatLanguages(
        targetLangsWithFormality,
        'target'
      );
      const enUsLine = formatted
        .split('\n')
        .find((l) => l.includes('English (American)'));

      expect(enUsLine).not.toContain('[F]');
    });

    it('should show legend when formality info is available', () => {
      const targetLangsWithFormality: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
      ];
      const formatted = languagesCommand.formatLanguages(
        targetLangsWithFormality,
        'target'
      );

      expect(formatted).toContain('[F] = supports formality parameter');
    });

    it('should not show formality markers for source languages', () => {
      const sourceLangs: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
      ];
      const formatted = languagesCommand.formatLanguages(sourceLangs, 'source');

      expect(formatted).not.toContain('[F]');
    });

    it('should propagate supportsFormality through mergeWithRegistry', () => {
      const apiLangs: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
        { language: 'fr', name: 'French', supportsFormality: true },
        {
          language: 'en-us',
          name: 'English (American)',
          supportsFormality: false,
        },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'target');

      const de = merged.find((e) => e.code === 'de');
      const enUs = merged.find((e) => e.code === 'en-us');
      expect(de?.supportsFormality).toBe(true);
      expect(enUs?.supportsFormality).toBe(false);
    });

    it('should not have formality info for registry-only languages', () => {
      const apiLangs: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'target');

      const hi = merged.find((e) => e.code === 'hi');
      expect(hi?.supportsFormality).toBeUndefined();
    });
  });

  describe('formatLanguagesTable', () => {
    it('should render Code/Name/Category headers and rows for source languages', () => {
      const result = languagesCommand.formatLanguagesTable(
        mockSourceLanguages,
        'source'
      );
      expect(result).toContain('Source Languages:');
      expect(result).toContain('Code');
      expect(result).toContain('Name');
      expect(result).toContain('Category');
      expect(result).toContain('German');
    });

    it('should add a Formality column when any target language reports it', () => {
      const targets: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
        {
          language: 'en-us',
          name: 'English (American)',
          supportsFormality: false,
        },
      ];
      const result = languagesCommand.formatLanguagesTable(targets, 'target');
      expect(result).toContain('Target Languages:');
      expect(result).toContain('Formality');
      expect(result).toContain('yes');
      expect(result).toContain('—');
    });

    it('should fall back to the registry when no client and no API languages', () => {
      const noClientService = createMockLanguagesService({
        hasClient: jest.fn().mockReturnValue(false),
      });
      const cmd = new LanguagesCommand(noClientService);
      const result = cmd.formatLanguagesTable([], 'source');
      // Registry has at least the core source languages — output must be a table, not the empty-state line.
      expect(result).toContain('Source Languages:');
      expect(result).not.toContain('(no languages available)');
    });
  });

  describe('formatAllLanguagesTable', () => {
    it('should join the source and target tables with a blank line', () => {
      const result = languagesCommand.formatAllLanguagesTable(
        mockSourceLanguages,
        [
          { language: 'de', name: 'German' },
          { language: 'fr', name: 'French' },
        ]
      );
      expect(result).toContain('Source Languages:');
      expect(result).toContain('Target Languages:');
      // The two sections are separated by at least one blank line.
      expect(result.split('\n\n').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('mergeWithRegistry() row set', () => {
    it('should include a language the API reports but the snapshot does not', () => {
      const apiLangs: LanguageInfo[] = [
        {
          language: 'xx-yy' as LanguageInfo['language'],
          name: 'Testish (Regional)',
          supportsFormality: true,
          features: { glossary: { status: 'stable' } },
        },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'target');
      const entry = merged.find((e) => e.code === 'xx-yy');

      expect(entry).toBeDefined();
      expect(entry!.name).toBe('Testish (Regional)');
    });

    it('should derive the tier for a language the snapshot does not know', () => {
      const apiLangs: LanguageInfo[] = [
        {
          language: 'xx' as LanguageInfo['language'],
          name: 'Glossaryless',
          features: { tag_handling: { status: 'stable' } },
        },
        {
          language: 'yy' as LanguageInfo['language'],
          name: 'Glossaried',
          features: { glossary: { status: 'stable' } },
        },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'target');

      expect(merged.find((e) => e.code === 'xx')!.category).toBe('extended');
      expect(merged.find((e) => e.code === 'yy')!.category).toBe('core');
    });

    it('should keep snapshot languages the API omits', () => {
      const merged = languagesCommand.mergeWithRegistry(
        [{ language: 'de', name: 'German' }],
        'target'
      );

      expect(merged.find((e) => e.code === 'ja')).toBeDefined();
      expect(merged.length).toBeGreaterThan(100);
    });

    it('should take the API list as given for the role being listed', () => {
      // The client already filters by usable_as_source/usable_as_target, so the
      // union trusts whichever list it is handed for that role.
      const sourceMerged = languagesCommand.mergeWithRegistry(
        [{ language: 'xx' as LanguageInfo['language'], name: 'Testish' }],
        'source'
      );

      expect(sourceMerged.find((e) => e.code === 'xx')).toBeDefined();
      expect(sourceMerged.find((e) => e.code === 'en-gb')).toBeUndefined();
    });
  });

  describe('tiering a language the snapshot does not list', () => {
    it('should treat a hyphenated code as a target-only regional variant', () => {
      // LanguageInfo carries no usable_as_source, so the subtag is the only
      // signal available; asserted because nothing else pins this guess.
      const merged = languagesCommand.mergeWithRegistry(
        [
          {
            language: 'de-ch',
            name: 'German (Swiss)',
            features: { glossary: { status: 'stable' } },
          },
        ],
        'target'
      );
      const entry = merged.find((e) => e.code === 'de-ch');

      expect(entry).toBeDefined();
      expect(entry!.category).toBe('regional');
    });

    it('should treat a bare code with glossary support as core', () => {
      const merged = languagesCommand.mergeWithRegistry(
        [
          {
            language: 'xx' as never,
            name: 'Novel',
            features: { glossary: { status: 'stable' } },
          },
        ],
        'target'
      );

      expect(merged.find((e) => e.code === 'xx')!.category).toBe('core');
    });

    it('should treat a code without glossary support as extended', () => {
      const merged = languagesCommand.mergeWithRegistry(
        [
          {
            language: 'yy' as never,
            name: 'Other',
            features: { tag_handling: { status: 'stable' } },
          },
        ],
        'target'
      );

      expect(merged.find((e) => e.code === 'yy')!.category).toBe('extended');
    });
  });

  describe('partitionFeatureKeys()', () => {
    const entry = (
      code: string,
      features?: Record<string, { status: string }>
    ): LanguageDisplayEntry => ({
      code,
      name: code.toUpperCase(),
      category: 'core',
      ...(features && { features }),
    });

    it('should keep a feature that discriminates between entries', () => {
      const { columns } = partitionFeatureKeys([
        entry('de', { glossary: { status: 'stable' } }),
        entry('hi', {}),
      ]);

      expect(columns).toEqual(['glossary']);
    });

    it('should suppress a feature supported identically by every entry', () => {
      const { columns, uniform } = partitionFeatureKeys([
        entry('de', { tag_handling: { status: 'stable' } }),
        entry('hi', { tag_handling: { status: 'stable' } }),
      ]);

      expect(columns).toEqual([]);
      expect(uniform).toEqual([{ key: 'tag_handling', cell: 'yes' }]);
    });

    it('should order known features first and unknown features alphabetically after', () => {
      const all = {
        zebra_feature: { status: 'stable' },
        translation_memory: { status: 'stable' },
        alpha_feature: { status: 'stable' },
        formality: { status: 'stable' },
        glossary: { status: 'stable' },
      };
      const { columns } = partitionFeatureKeys([
        entry('de', all),
        entry('hi', {}),
      ]);

      expect(columns).toEqual([
        'formality',
        'glossary',
        'translation_memory',
        'alpha_feature',
        'zebra_feature',
      ]);
    });

    it('should treat a differing status as discriminating', () => {
      const { columns } = partitionFeatureKeys([
        entry('de', { glossary: { status: 'stable' } }),
        entry('th', { glossary: { status: 'beta' } }),
      ]);

      expect(columns).toEqual(['glossary']);
    });

    it('should return nothing for an empty entry list', () => {
      expect(partitionFeatureKeys([])).toEqual({ columns: [], uniform: [] });
    });
  });

  describe('feature display', () => {
    // Asserted through the display-entry layer: formatLanguages() merges against
    // the whole registry, so languages absent from the argument would report no
    // features and make every column discriminating.
    const displayEntries: LanguageDisplayEntry[] = [
      {
        code: 'de',
        name: 'German',
        category: 'core',
        supportsFormality: true,
        features: {
          formality: { status: 'stable' },
          glossary: { status: 'stable' },
          style_rules: { status: 'stable' },
          tag_handling: { status: 'stable' },
        },
      },
      {
        code: 'pt',
        name: 'Portuguese',
        category: 'core',
        supportsFormality: true,
        features: {
          formality: { status: 'stable' },
          glossary: { status: 'stable' },
          tag_handling: { status: 'stable' },
        },
      },
      {
        code: 'hi',
        name: 'Hindi',
        category: 'extended',
        supportsFormality: false,
        features: { tag_handling: { status: 'stable' } },
      },
    ];

    it('should list supported features per language in text output', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        displayEntries,
        'target',
        true
      );
      const de = formatted.split('\n').find((l) => l.includes('German'));
      const pt = formatted.split('\n').find((l) => l.includes('Portuguese'));

      expect(de).toContain('formality');
      expect(de).toContain('style rules');
      expect(pt).toContain('glossary');
      expect(pt).not.toContain('style rules');
    });

    it('should note the features every listed language shares', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        displayEntries,
        'target',
        true
      );

      expect(formatted).toContain(
        'All listed languages also support: tag handling.'
      );
    });

    it('should not claim a language supports nothing when the footer credits it', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        displayEntries,
        'target',
        true
      );
      const hi = formatted.split('\n').find((l) => l.includes('Hindi'));

      // Hindi supports none of the discriminating columns but does support the
      // uniform one, which the footer reports -- "none" would contradict it.
      expect(hi).not.toContain('none');
      expect(formatted).toContain(
        'All listed languages also support: tag handling.'
      );
    });

    it('should mark a language the response credits with no features at all', () => {
      const entries: LanguageDisplayEntry[] = [
        {
          code: 'de',
          name: 'German',
          category: 'core',
          features: { glossary: { status: 'stable' } },
        },
        { code: 'hi', name: 'Hindi', category: 'extended', features: {} },
      ];

      const formatted = languagesCommand.formatDisplayEntries(
        entries,
        'target',
        true
      );
      const hi = formatted.split('\n').find((l) => l.includes('Hindi'));

      expect(hi).toContain('none');
    });

    it('should render features for extended languages too', () => {
      const entries: LanguageDisplayEntry[] = [
        { code: 'de', name: 'German', category: 'core', features: {} },
        {
          code: 'th',
          name: 'Thai',
          category: 'extended',
          features: { style_rules: { status: 'stable' } },
        },
      ];
      const formatted = languagesCommand.formatDisplayEntries(
        entries,
        'target',
        true
      );
      const th = formatted.split('\n').find((l) => l.includes('Thai'));

      expect(th).toContain('style rules');
    });

    it('should drop the [F] marker and legend when features are shown', () => {
      const formatted = languagesCommand.formatDisplayEntries(
        displayEntries,
        'target',
        true
      );

      expect(formatted).not.toContain('[F]');
    });

    it('should label a non-stable status instead of yes', () => {
      const entries: LanguageDisplayEntry[] = [
        {
          code: 'de',
          name: 'German',
          category: 'core',
          features: { glossary: { status: 'beta' } },
        },
        { code: 'hi', name: 'Hindi', category: 'extended', features: {} },
      ];
      const formatted = languagesCommand.formatDisplayEntries(
        entries,
        'target',
        true
      );
      const de = formatted.split('\n').find((l) => l.includes('German'));

      expect(de).toContain('glossary (beta)');
    });

    it('should fall back to the default rendering when no entry reports features', () => {
      const noFeatures: LanguageDisplayEntry[] = [
        {
          code: 'de',
          name: 'German',
          category: 'core',
          supportsFormality: true,
        },
      ];
      const withFlag = languagesCommand.formatDisplayEntries(
        noFeatures,
        'target',
        true
      );
      const without = languagesCommand.formatDisplayEntries(
        noFeatures,
        'target'
      );

      expect(withFlag).toBe(without);
    });

    it('should leave default text output untouched when features are not requested', () => {
      const withFlagOff = languagesCommand.formatDisplayEntries(
        displayEntries,
        'target'
      );

      expect(withFlagOff).toContain('[F]');
      expect(withFlagOff).not.toContain('tag handling');
    });

    it('should thread the flag through formatLanguages to the display layer', () => {
      const apiLangs: LanguageInfo[] = [
        {
          language: 'de',
          name: 'German',
          supportsFormality: true,
          features: { glossary: { status: 'stable' } },
        },
      ];
      const formatted = languagesCommand.formatLanguages(
        apiLangs,
        'target',
        true
      );

      // Asserted on the footer line specifically: the section header for extended
      // languages also contains the word "glossary", so a bare toContain would
      // pass even with the flag ignored entirely.
      expect(formatted).toMatch(/also support:.*glossary/);
    });

    it('should report a language the response omitted as unknown, not as supporting nothing', () => {
      const apiLangs: LanguageInfo[] = [
        {
          language: 'de',
          name: 'German',
          supportsFormality: true,
          features: {
            glossary: { status: 'stable' },
            formality: { status: 'stable' },
          },
        },
        {
          language: 'pt',
          name: 'Portuguese',
          supportsFormality: true,
          features: { glossary: { status: 'stable' } },
        },
      ];
      const formatted = languagesCommand.formatLanguages(
        apiLangs,
        'target',
        true
      );
      const zulu = formatted.split('\n').find((l) => l.includes('Zulu'));

      expect(zulu).toContain('no feature data');
      expect(zulu).not.toContain('none');
    });

    it('should add a column per discriminating feature in table output', () => {
      const table = languagesCommand.formatDisplayEntriesTable(
        displayEntries,
        'target',
        true
      );

      expect(table).toContain('Formality');
      expect(table).toContain('Glossary');
      expect(table).toContain('Style Rules');
      expect(table).not.toContain('Tag Handling');
      expect(table).toContain(
        'All listed languages also support: tag handling.'
      );
    });

    it('should not add feature columns to table output by default', () => {
      const table = languagesCommand.formatDisplayEntriesTable(
        displayEntries,
        'target'
      );

      expect(table).not.toContain('Glossary');
      expect(table).toContain('Formality');
    });
  });
});
