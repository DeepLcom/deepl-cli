import { TmCommand } from '../../src/cli/commands/tm';
import type { DeepLClient } from '../../src/api/deepl-client';
import { createMockDeepLClient } from '../helpers/mock-factories';
import type { TranslationMemory } from '../../src/types';

describe('TmCommand', () => {
  let tmCommand: TmCommand;
  let mockClient: jest.Mocked<DeepLClient>;

  beforeEach(() => {
    mockClient = createMockDeepLClient();
    tmCommand = new TmCommand(mockClient);
  });

  describe('list()', () => {
    it('delegates to DeepLClient.listTranslationMemories', async () => {
      const tm: TranslationMemory = {
        translation_memory_id: '11111111-2222-3333-4444-555555555555',
        name: 'my-tm',
        source_language: 'en',
        target_languages: ['de'],
      };
      mockClient.listTranslationMemories.mockResolvedValue([tm]);

      const result = await tmCommand.list();

      expect(result).toEqual([tm]);
      expect(mockClient.listTranslationMemories).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no translation memories exist', async () => {
      mockClient.listTranslationMemories.mockResolvedValue([]);

      const result = await tmCommand.list();

      expect(result).toEqual([]);
    });
  });

  describe('formatList()', () => {
    it('renders an informative empty-list message on []', () => {
      const out = tmCommand.formatList([]);
      expect(out).toBe('No translation memories found');
    });

    it('renders name and language pair per TM', () => {
      const tms: TranslationMemory[] = [
        { translation_memory_id: 'a', name: 'brand-terms', source_language: 'en', target_languages: ['de', 'fr'] },
        { translation_memory_id: 'b', name: 'legal-phrases', source_language: 'en', target_languages: ['fr'] },
      ];
      const out = tmCommand.formatList(tms);
      expect(out).toContain('brand-terms');
      expect(out).toContain('EN \u2192 DE, FR');
      expect(out).toContain('legal-phrases');
      expect(out).toContain('EN \u2192 FR');
    });

    it('strips ASCII control chars from the name column so a malicious TM cannot corrupt the terminal', () => {
      const tms: TranslationMemory[] = [
        { translation_memory_id: 'a', name: 'evil\x1b[2Jname\x07', source_language: 'en', target_languages: ['de'] },
      ];
      const out = tmCommand.formatList(tms);
      expect(out).not.toContain('\x1b[');
      expect(out).not.toContain('\x07');
      expect(out).toContain('evil');
      expect(out).toContain('name');
    });

    it('strips zero-width codepoints from the name column', () => {
      const tms: TranslationMemory[] = [
        { translation_memory_id: 'a', name: 'prod\u200Btm', source_language: 'en', target_languages: ['de'] },
      ];
      const out = tmCommand.formatList(tms);
      expect(out).not.toContain('\u200B');
      expect(out).toContain('prodtm');
    });
  });
});
