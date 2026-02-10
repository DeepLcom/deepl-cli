import { LanguagesCommand } from '../../src/cli/commands/languages';
import { DeepLClient, LanguageInfo } from '../../src/api/deepl-client';
import { createMockDeepLClient } from '../helpers/mock-factories';

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
  let mockDeepLClient: jest.Mocked<DeepLClient>;
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
    mockDeepLClient = createMockDeepLClient();
    languagesCommand = new LanguagesCommand(mockDeepLClient);
  });

  describe('getSourceLanguages()', () => {
    it('should retrieve source languages from DeepL API', async () => {
      mockDeepLClient.getSupportedLanguages.mockResolvedValue(mockSourceLanguages);

      const languages = await languagesCommand.getSourceLanguages();

      expect(mockDeepLClient.getSupportedLanguages).toHaveBeenCalledWith('source');
      expect(languages).toEqual(mockSourceLanguages);
    });

    it('should handle API errors gracefully', async () => {
      mockDeepLClient.getSupportedLanguages.mockRejectedValue(
        new Error('API connection failed')
      );

      await expect(languagesCommand.getSourceLanguages()).rejects.toThrow(
        'API connection failed'
      );
    });

    it('should return empty array when client is null', async () => {
      const noClientCommand = new LanguagesCommand(null);
      const languages = await noClientCommand.getSourceLanguages();
      expect(languages).toEqual([]);
    });
  });

  describe('getTargetLanguages()', () => {
    it('should retrieve target languages from DeepL API', async () => {
      mockDeepLClient.getSupportedLanguages.mockResolvedValue(mockTargetLanguages);

      const languages = await languagesCommand.getTargetLanguages();

      expect(mockDeepLClient.getSupportedLanguages).toHaveBeenCalledWith('target');
      expect(languages).toEqual(mockTargetLanguages);
    });

    it('should handle API errors gracefully', async () => {
      mockDeepLClient.getSupportedLanguages.mockRejectedValue(
        new Error('API connection failed')
      );

      await expect(languagesCommand.getTargetLanguages()).rejects.toThrow(
        'API connection failed'
      );
    });

    it('should return empty array when client is null', async () => {
      const noClientCommand = new LanguagesCommand(null);
      const languages = await noClientCommand.getTargetLanguages();
      expect(languages).toEqual([]);
    });
  });

  describe('formatLanguages()', () => {
    it('should format source languages with header', () => {
      const formatted = languagesCommand.formatLanguages(mockSourceLanguages, 'source');

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('en');
      expect(formatted).toContain('English');
      expect(formatted).toContain('de');
      expect(formatted).toContain('German');
    });

    it('should format target languages with header', () => {
      const formatted = languagesCommand.formatLanguages(mockTargetLanguages, 'target');

      expect(formatted).toContain('Target Languages:');
      expect(formatted).toContain('en-us');
      expect(formatted).toContain('English (American)');
      expect(formatted).toContain('ja');
      expect(formatted).toContain('Japanese');
    });

    it('should include extended languages section', () => {
      const formatted = languagesCommand.formatLanguages(mockSourceLanguages, 'source');

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
      const formatted = languagesCommand.formatLanguages(mockSourceLanguages, 'source');
      const lines = formatted.split('\n');

      const languageLines = lines.slice(1);
      languageLines.forEach(line => {
        if (line.trim() && !line.includes('Extended Languages')) {
          expect(line).toMatch(/^\s+\S+\s+.+$/);
        }
      });
    });

    it('should format both types correctly', () => {
      const sourceFormatted = languagesCommand.formatLanguages(mockSourceLanguages, 'source');
      const targetFormatted = languagesCommand.formatLanguages(mockTargetLanguages, 'target');

      expect(sourceFormatted).toContain('Source Languages:');
      expect(targetFormatted).toContain('Target Languages:');
      expect(sourceFormatted).not.toContain('Target Languages:');
      expect(targetFormatted).not.toContain('Source Languages:');
    });
  });

  describe('formatLanguages() with null client (registry-only mode)', () => {
    it('should show registry languages when client is null and API returns empty', () => {
      const noClientCommand = new LanguagesCommand(null);
      const formatted = noClientCommand.formatLanguages([], 'source');

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('en');
      expect(formatted).toContain('English');
      expect(formatted).toContain('Extended Languages');
    });

    it('should show target languages from registry when client is null', () => {
      const noClientCommand = new LanguagesCommand(null);
      const formatted = noClientCommand.formatLanguages([], 'target');

      expect(formatted).toContain('Target Languages:');
      expect(formatted).toContain('en-gb');
      expect(formatted).toContain('English (British)');
    });
  });

  describe('mergeWithRegistry()', () => {
    it('should use API names when available', () => {
      const apiLangs: LanguageInfo[] = [
        { language: 'de', name: 'Deutsch' },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'source');
      const de = merged.find(e => e.code === 'de');
      expect(de?.name).toBe('Deutsch');
    });

    it('should fall back to registry names for languages not in API response', () => {
      const merged = languagesCommand.mergeWithRegistry([], 'source');
      const hi = merged.find(e => e.code === 'hi');
      expect(hi?.name).toBe('Hindi');
    });

    it('should include all registry languages', () => {
      const merged = languagesCommand.mergeWithRegistry(mockSourceLanguages, 'source');
      expect(merged.length).toBeGreaterThan(mockSourceLanguages.length);
      expect(merged.some(e => e.code === 'hi')).toBe(true);
      expect(merged.some(e => e.code === 'sw')).toBe(true);
    });

    it('should correctly categorize languages', () => {
      const merged = languagesCommand.mergeWithRegistry([], 'target');
      const enGb = merged.find(e => e.code === 'en-gb');
      const en = merged.find(e => e.code === 'en');
      const hi = merged.find(e => e.code === 'hi');

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
        { code: 'en-gb', name: 'English (British)', category: 'regional' as const },
      ];
      const formatted = languagesCommand.formatDisplayEntries(entries, 'target');
      const lines = formatted.split('\n');

      const enLine = lines.findIndex(l => l.includes('en') && !l.includes('en-gb') && !l.includes('Extended'));
      const enGbLine = lines.findIndex(l => l.includes('en-gb'));
      const extHeader = lines.findIndex(l => l.includes('Extended Languages'));
      const hiLine = lines.findIndex(l => l.includes('Hindi'));

      expect(enLine).toBeLessThan(extHeader);
      expect(enGbLine).toBeLessThan(extHeader);
      expect(hiLine).toBeGreaterThan(extHeader);
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
        { language: 'en-us', name: 'English (American)', supportsFormality: false },
      ];
      const formatted = languagesCommand.formatLanguages(targetLangsWithFormality, 'target');

      expect(formatted).toContain('German');
      expect(formatted).toContain('[F]');
    });

    it('should not show [F] for languages that do not support formality', () => {
      const targetLangsWithFormality: LanguageInfo[] = [
        { language: 'en-us', name: 'English (American)', supportsFormality: false },
      ];
      const formatted = languagesCommand.formatLanguages(targetLangsWithFormality, 'target');
      const enUsLine = formatted.split('\n').find(l => l.includes('English (American)'));

      expect(enUsLine).not.toContain('[F]');
    });

    it('should show legend when formality info is available', () => {
      const targetLangsWithFormality: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
      ];
      const formatted = languagesCommand.formatLanguages(targetLangsWithFormality, 'target');

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
        { language: 'en-us', name: 'English (American)', supportsFormality: false },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'target');

      const de = merged.find(e => e.code === 'de');
      const enUs = merged.find(e => e.code === 'en-us');
      expect(de?.supportsFormality).toBe(true);
      expect(enUs?.supportsFormality).toBe(false);
    });

    it('should not have formality info for registry-only languages', () => {
      const apiLangs: LanguageInfo[] = [
        { language: 'de', name: 'German', supportsFormality: true },
      ];
      const merged = languagesCommand.mergeWithRegistry(apiLangs, 'target');

      const hi = merged.find(e => e.code === 'hi');
      expect(hi?.supportsFormality).toBeUndefined();
    });
  });
});
