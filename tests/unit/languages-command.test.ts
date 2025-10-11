import { LanguagesCommand } from '../../src/cli/commands/languages';
import { DeepLClient, LanguageInfo } from '../../src/api/deepl-client';

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
    { language: 'en' as any, name: 'English' },
    { language: 'de' as any, name: 'German' },
    { language: 'fr' as any, name: 'French' },
    { language: 'es' as any, name: 'Spanish' },
  ];

  const mockTargetLanguages: LanguageInfo[] = [
    { language: 'en-us' as any, name: 'English (American)' },
    { language: 'en-gb' as any, name: 'English (British)' },
    { language: 'de' as any, name: 'German' },
    { language: 'fr' as any, name: 'French' },
    { language: 'es' as any, name: 'Spanish' },
    { language: 'ja' as any, name: 'Japanese' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeepLClient = {
      getSupportedLanguages: jest.fn(),
    } as unknown as jest.Mocked<DeepLClient>;
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

    it('should align language codes and names properly', () => {
      const formatted = languagesCommand.formatLanguages(mockSourceLanguages, 'source');
      const lines = formatted.split('\n');

      // Skip header and check that language entries are properly formatted
      const languageLines = lines.slice(1);
      languageLines.forEach(line => {
        if (line.trim()) {
          expect(line).toMatch(/^\s+\S+\s+.+$/); // Code followed by name
        }
      });
    });

    it('should handle empty language list', () => {
      const formatted = languagesCommand.formatLanguages([], 'source');

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('No languages available');
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

    it('should handle empty lists gracefully', () => {
      const formatted = languagesCommand.formatAllLanguages([], []);

      expect(formatted).toContain('Source Languages:');
      expect(formatted).toContain('Target Languages:');
      expect(formatted).toContain('No languages available');
    });
  });
});
