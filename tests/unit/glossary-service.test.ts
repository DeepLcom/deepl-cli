/**
 * Tests for Glossary Service
 * Following TDD approach - RED phase
 */

import { GlossaryService } from '../../src/services/glossary';
import { DeepLClient } from '../../src/api/deepl-client';

// Mock DeepLClient
jest.mock('../../src/api/deepl-client');

describe('GlossaryService', () => {
  let glossaryService: GlossaryService;
  let mockDeepLClient: jest.Mocked<DeepLClient>;

  beforeEach(() => {
    mockDeepLClient = {
      translate: jest.fn(),
      getUsage: jest.fn(),
      getSupportedLanguages: jest.fn(),
      createGlossary: jest.fn(),
      listGlossaries: jest.fn(),
      getGlossary: jest.fn(),
      deleteGlossary: jest.fn(),
      getGlossaryEntries: jest.fn(),
      updateGlossaryEntries: jest.fn(),
      renameGlossary: jest.fn(),
      deleteGlossaryDictionary: jest.fn(),
      replaceGlossaryDictionary: jest.fn(),
    } as unknown as jest.Mocked<DeepLClient>;

    glossaryService = new GlossaryService(mockDeepLClient);
  });

  describe('initialization', () => {
    it('should create a GlossaryService instance', () => {
      expect(glossaryService).toBeInstanceOf(GlossaryService);
    });
  });

  describe('createGlossary()', () => {
    it('should create a glossary from entries', async () => {
      const entries = {
        'API': 'API',
        'REST': 'REST',
        'Hello': 'Hola',
      };

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-glossary-123',
        name: 'tech-terms',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 3,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      const result = await glossaryService.createGlossary(
        'tech-terms',
        'en',
        ['es'],
        entries
      );

      expect(result.glossary_id).toBe('test-glossary-123');
      expect(result.name).toBe('tech-terms');
      expect(result.dictionaries[0]?.entry_count).toBe(3);
      expect(mockDeepLClient.createGlossary).toHaveBeenCalledWith(
        'tech-terms',
        'en',
        ['es'],
        expect.any(String)
      );
    });

    it('should handle empty entries', async () => {
      await expect(
        glossaryService.createGlossary('empty', 'en', ['es'], {})
      ).rejects.toThrow('Glossary entries cannot be empty');
    });

    it('should validate glossary name', async () => {
      await expect(
        glossaryService.createGlossary('', 'en', ['es'], { test: 'test' })
      ).rejects.toThrow('Glossary name is required');
    });
  });

  describe('createGlossaryFromTSV()', () => {
    it('should create glossary from TSV string', async () => {
      const tsv = 'API\tAPI\nREST\tREST\nHello\tHola';

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'test',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 3,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      const result = await glossaryService.createGlossaryFromTSV(
        'test',
        'en',
        ['es'],
        tsv
      );

      expect(result.dictionaries[0]?.entry_count).toBe(3);
    });

    it('should handle CSV format', async () => {
      const csv = 'API,API\nREST,REST\nHello,Hola';

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'test',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 3,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      const result = await glossaryService.createGlossaryFromTSV(
        'test',
        'en',
        ['es'],
        csv
      );

      expect(result.dictionaries[0]?.entry_count).toBe(3);
    });

    it('should skip empty lines', async () => {
      const tsv = 'API\tAPI\n\nREST\tREST\n\nHello\tHola';

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'test',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 3,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      const result = await glossaryService.createGlossaryFromTSV(
        'test',
        'en',
        ['es'],
        tsv
      );

      expect(result.dictionaries[0]?.entry_count).toBe(3);
    });
  });

  describe('listGlossaries()', () => {
    it('should return list of glossaries', async () => {
      mockDeepLClient.listGlossaries.mockResolvedValue([
        {
          glossary_id: 'gloss-1',
          name: 'tech-terms',
          source_lang: 'en',
          target_langs: ['es'],
          dictionaries: [{
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          }],
          creation_time: '2024-01-01T00:00:00Z',
        },
        {
          glossary_id: 'gloss-2',
          name: 'legal-terms',
          source_lang: 'en',
          target_langs: ['de'],
          dictionaries: [{
            source_lang: 'en',
            target_lang: 'de',
            entry_count: 25,
          }],
          creation_time: '2024-01-02T00:00:00Z',
        },
      ]);

      const glossaries = await glossaryService.listGlossaries();

      expect(glossaries).toHaveLength(2);
      expect(glossaries[0]?.name).toBe('tech-terms');
      expect(glossaries[1]?.name).toBe('legal-terms');
    });

    it('should return empty array when no glossaries exist', async () => {
      mockDeepLClient.listGlossaries.mockResolvedValue([]);

      const glossaries = await glossaryService.listGlossaries();

      expect(glossaries).toHaveLength(0);
    });
  });

  describe('getGlossary()', () => {
    it('should get glossary by ID', async () => {
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'tech-terms',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 10,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      const glossary = await glossaryService.getGlossary('test-123');

      expect(glossary.glossary_id).toBe('test-123');
      expect(glossary.name).toBe('tech-terms');
      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('test-123');
    });

    it('should throw error for non-existent glossary', async () => {
      mockDeepLClient.getGlossary.mockRejectedValue(
        new Error('Glossary not found')
      );

      await expect(
        glossaryService.getGlossary('non-existent')
      ).rejects.toThrow('Glossary not found');
    });
  });

  describe('getGlossaryByName()', () => {
    it('should find glossary by name', async () => {
      mockDeepLClient.listGlossaries.mockResolvedValue([
        {
          glossary_id: 'test-123',
          name: 'tech-terms',
          source_lang: 'en',
          target_langs: ['es'],
          dictionaries: [{
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          }],
          creation_time: '2024-01-01T00:00:00Z',
        },
      ]);

      const glossary = await glossaryService.getGlossaryByName('tech-terms');

      expect(glossary?.glossary_id).toBe('test-123');
      expect(glossary?.name).toBe('tech-terms');
    });

    it('should return null for non-existent name', async () => {
      mockDeepLClient.listGlossaries.mockResolvedValue([]);

      const glossary = await glossaryService.getGlossaryByName('non-existent');

      expect(glossary).toBeNull();
    });
  });

  describe('deleteGlossary()', () => {
    it('should delete glossary by ID', async () => {
      mockDeepLClient.deleteGlossary.mockResolvedValue(undefined);

      await glossaryService.deleteGlossary('test-123');

      expect(mockDeepLClient.deleteGlossary).toHaveBeenCalledWith('test-123');
    });

    it('should throw error when deleting non-existent glossary', async () => {
      mockDeepLClient.deleteGlossary.mockRejectedValue(
        new Error('Glossary not found')
      );

      await expect(
        glossaryService.deleteGlossary('non-existent')
      ).rejects.toThrow('Glossary not found');
    });
  });

  describe('getGlossaryEntries()', () => {
    it('should get glossary entries', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue(
        'API\tAPI\nREST\tREST\nHello\tHola'
      );

      const entries = await glossaryService.getGlossaryEntries('test-123', 'en', 'es');

      expect(entries).toEqual({
        API: 'API',
        REST: 'REST',
        Hello: 'Hola',
      });
      expect(mockDeepLClient.getGlossaryEntries).toHaveBeenCalledWith('test-123', 'en', 'es');
    });

    it('should handle empty glossary', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('');

      const entries = await glossaryService.getGlossaryEntries('test-123', 'en', 'es');

      expect(entries).toEqual({});
      expect(mockDeepLClient.getGlossaryEntries).toHaveBeenCalledWith('test-123', 'en', 'es');
    });
  });

  describe('entriesToTSV()', () => {
    it('should convert entries object to TSV format', () => {
      const entries = {
        API: 'API',
        REST: 'REST',
        Hello: 'Hola',
      };

      const tsv = glossaryService.entriesToTSV(entries);

      expect(tsv).toBe('API\tAPI\nREST\tREST\nHello\tHola');
    });

    it('should handle empty entries', () => {
      const tsv = glossaryService.entriesToTSV({});
      expect(tsv).toBe('');
    });
  });

  describe('tsvToEntries()', () => {
    it('should convert TSV to entries object', () => {
      const tsv = 'API\tAPI\nREST\tREST\nHello\tHola';

      const entries = glossaryService.tsvToEntries(tsv);

      expect(entries).toEqual({
        API: 'API',
        REST: 'REST',
        Hello: 'Hola',
      });
    });

    it('should handle CSV format', () => {
      const csv = 'API,API\nREST,REST\nHello,Hola';

      const entries = glossaryService.tsvToEntries(csv);

      expect(entries).toEqual({
        API: 'API',
        REST: 'REST',
        Hello: 'Hola',
      });
    });

    it('should skip invalid lines', () => {
      const tsv = 'API\tAPI\nINVALID\nREST\tREST';

      const entries = glossaryService.tsvToEntries(tsv);

      expect(entries).toEqual({
        API: 'API',
        REST: 'REST',
      });
    });

    // Issue #5: CSV parsing with quoted commas
    it('should handle CSV with quoted commas (Issue #5)', () => {
      // CSV standard: commas inside quotes should not split fields
      const csv = '"hello, world",hola mundo\n"goodbye, friend",adiós amigo';

      const entries = glossaryService.tsvToEntries(csv);

      expect(entries).toEqual({
        'hello, world': 'hola mundo',
        'goodbye, friend': 'adiós amigo',
      });
    });

    it('should handle CSV with escaped quotes inside quoted fields (Issue #5)', () => {
      // CSV standard: quotes inside quotes are escaped by doubling them
      const csv = '"say ""hello""","di ""hola"""';

      const entries = glossaryService.tsvToEntries(csv);

      expect(entries).toEqual({
        'say "hello"': 'di "hola"',
      });
    });

    it('should handle CSV with mixed quoted and unquoted fields (Issue #5)', () => {
      const csv = 'API,API\n"hello, world",hola\nREST,REST';

      const entries = glossaryService.tsvToEntries(csv);

      expect(entries).toEqual({
        API: 'API',
        'hello, world': 'hola',
        REST: 'REST',
      });
    });

    it('should handle CSV with whitespace around quoted fields (Issue #5)', () => {
      // Whitespace outside quotes is typically preserved in CSV
      const csv = ' "hello, world" , hola mundo ';

      const entries = glossaryService.tsvToEntries(csv);

      // After trimming quotes and whitespace
      expect(entries).toEqual({
        'hello, world': 'hola mundo',
      });
    });
  });

  describe('addEntry()', () => {
    it('should add a new entry to glossary', async () => {
      // Mock getting existing entries
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI\nREST\tREST');

      // Mock updating glossary entries
      mockDeepLClient.updateGlossaryEntries.mockResolvedValue(undefined);

      await glossaryService.addEntry('test-123', 'en', 'es', 'Hello', 'Hola');

      expect(mockDeepLClient.getGlossaryEntries).toHaveBeenCalledWith('test-123', 'en', 'es');
      expect(mockDeepLClient.updateGlossaryEntries).toHaveBeenCalledWith(
        'test-123',
        'en',
        'es',
        'API\tAPI\nREST\tREST\nHello\tHola'
      );
    });

    it('should throw error if entry already exists', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI\nREST\tREST');

      await expect(
        glossaryService.addEntry('test-123', 'en', 'es', 'API', 'Interface')
      ).rejects.toThrow('Entry "API" already exists in glossary');
    });

    it('should validate source text is not empty', async () => {
      await expect(
        glossaryService.addEntry('test-123', 'en', 'es', '', 'target')
      ).rejects.toThrow('Source text cannot be empty');
    });

    it('should validate target text is not empty', async () => {
      await expect(
        glossaryService.addEntry('test-123', 'en', 'es', 'source', '')
      ).rejects.toThrow('Target text cannot be empty');
    });
  });

  describe('updateEntry()', () => {
    it('should update an existing entry', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI\nREST\tREST');
      mockDeepLClient.updateGlossaryEntries.mockResolvedValue(undefined);

      await glossaryService.updateEntry('test-123', 'en', 'es', 'API', 'Interface');

      expect(mockDeepLClient.getGlossaryEntries).toHaveBeenCalledWith('test-123', 'en', 'es');
      expect(mockDeepLClient.updateGlossaryEntries).toHaveBeenCalledWith(
        'test-123',
        'en',
        'es',
        'API\tInterface\nREST\tREST'
      );
    });

    it('should throw error if entry does not exist', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI\nREST\tREST');

      await expect(
        glossaryService.updateEntry('test-123', 'en', 'es', 'NonExistent', 'target')
      ).rejects.toThrow('Entry "NonExistent" not found in glossary');
    });

    it('should validate source text is not empty', async () => {
      await expect(
        glossaryService.updateEntry('test-123', 'en', 'es', '', 'target')
      ).rejects.toThrow('Source text cannot be empty');
    });

    it('should validate target text is not empty', async () => {
      await expect(
        glossaryService.updateEntry('test-123', 'en', 'es', 'source', '')
      ).rejects.toThrow('Target text cannot be empty');
    });
  });

  describe('removeEntry()', () => {
    it('should remove an entry from glossary', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI\nREST\tREST\nHello\tHola');
      mockDeepLClient.updateGlossaryEntries.mockResolvedValue(undefined);

      await glossaryService.removeEntry('test-123', 'en', 'es', 'Hello');

      expect(mockDeepLClient.getGlossaryEntries).toHaveBeenCalledWith('test-123', 'en', 'es');
      expect(mockDeepLClient.updateGlossaryEntries).toHaveBeenCalledWith(
        'test-123',
        'en',
        'es',
        'API\tAPI\nREST\tREST'
      );
    });

    it('should throw error if entry does not exist', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI\nREST\tREST');

      await expect(
        glossaryService.removeEntry('test-123', 'en', 'es', 'NonExistent')
      ).rejects.toThrow('Entry "NonExistent" not found in glossary');
    });

    it('should validate source text is not empty', async () => {
      await expect(
        glossaryService.removeEntry('test-123', 'en', 'es', '')
      ).rejects.toThrow('Source text cannot be empty');
    });

    it('should throw error if removing would leave glossary empty', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('API\tAPI');

      await expect(
        glossaryService.removeEntry('test-123', 'en', 'es', 'API')
      ).rejects.toThrow('Cannot remove last entry from glossary. Delete the glossary instead.');
    });
  });

  describe('renameGlossary()', () => {
    it('should rename a glossary', async () => {
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'old-name',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 3,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      mockDeepLClient.renameGlossary.mockResolvedValue(undefined);

      await glossaryService.renameGlossary('test-123', 'new-name');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('test-123');
      expect(mockDeepLClient.renameGlossary).toHaveBeenCalledWith('test-123', 'new-name');
    });

    it('should validate new name is not empty', async () => {
      await expect(
        glossaryService.renameGlossary('test-123', '')
      ).rejects.toThrow('New glossary name cannot be empty');
    });

    it('should validate new name is different from current name', async () => {
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'same-name',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [{
          source_lang: 'en',
          target_lang: 'es',
          entry_count: 3,
        }],
        creation_time: '2024-01-01T00:00:00Z',
      });

      await expect(
        glossaryService.renameGlossary('test-123', 'same-name')
      ).rejects.toThrow('New name must be different from current name');
    });

    it('should handle API errors', async () => {
      mockDeepLClient.getGlossary.mockRejectedValue(
        new Error('Glossary not found')
      );

      await expect(
        glossaryService.renameGlossary('test-123', 'new-name')
      ).rejects.toThrow('Glossary not found');
    });
  });

  describe('deleteGlossaryDictionary()', () => {
    it('should delete a dictionary from a multilingual glossary', async () => {
      // Mock a multilingual glossary with 3 dictionaries
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'multi-gloss-123',
        name: 'multi-glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr', 'de'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 12,
          },
          {
            source_lang: 'en',
            target_lang: 'de',
            entry_count: 8,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      });

      mockDeepLClient.deleteGlossaryDictionary.mockResolvedValue(undefined);

      await glossaryService.deleteGlossaryDictionary('multi-gloss-123', 'en', 'fr');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('multi-gloss-123');
      expect(mockDeepLClient.deleteGlossaryDictionary).toHaveBeenCalledWith(
        'multi-gloss-123',
        'en',
        'fr'
      );
    });

    it('should throw error when deleting dictionary from single-language glossary', async () => {
      // Mock a single-language glossary
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'single-gloss-123',
        name: 'single-glossary',
        source_lang: 'en',
        target_langs: ['es'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      });

      await expect(
        glossaryService.deleteGlossaryDictionary('single-gloss-123', 'en', 'es')
      ).rejects.toThrow('Cannot delete dictionary from single-language glossary. Delete the entire glossary instead.');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('single-gloss-123');
      expect(mockDeepLClient.deleteGlossaryDictionary).not.toHaveBeenCalled();
    });

    it('should throw error when deleting last dictionary from multilingual glossary', async () => {
      // Mock a glossary that has 2 target_langs but only 1 remaining dictionary
      // (e.g., after deleting other dictionaries)
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'last-dict-123',
        name: 'last-dict-glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr'], // Still marked as multilingual
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      });

      await expect(
        glossaryService.deleteGlossaryDictionary('last-dict-123', 'en', 'es')
      ).rejects.toThrow('Cannot delete last dictionary from glossary. Delete the entire glossary instead.');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('last-dict-123');
      expect(mockDeepLClient.deleteGlossaryDictionary).not.toHaveBeenCalled();
    });

    it('should throw error when specified dictionary does not exist in glossary', async () => {
      // Mock a multilingual glossary without the requested dictionary
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'multi-gloss-123',
        name: 'multi-glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 12,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      });

      await expect(
        glossaryService.deleteGlossaryDictionary('multi-gloss-123', 'en', 'de')
      ).rejects.toThrow('Dictionary en-de not found in glossary');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('multi-gloss-123');
      expect(mockDeepLClient.deleteGlossaryDictionary).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive language code matching', async () => {
      // Mock a multilingual glossary - API might return uppercase codes
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'multi-gloss-123',
        name: 'multi-glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 12,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      } as any); // Cast to any to allow runtime uppercase comparison test

      // Override dictionaries with uppercase for case-insensitivity test
      const glossaryResponse = {
        glossary_id: 'multi-gloss-123',
        name: 'multi-glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr'],
        dictionaries: [
          {
            source_lang: 'EN',
            target_lang: 'ES',
            entry_count: 10,
          },
          {
            source_lang: 'EN',
            target_lang: 'FR',
            entry_count: 12,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      };

      mockDeepLClient.getGlossary.mockResolvedValue(glossaryResponse as any);
      mockDeepLClient.deleteGlossaryDictionary.mockResolvedValue(undefined);

      // Request with lowercase codes should still match uppercase dictionary entries
      await glossaryService.deleteGlossaryDictionary('multi-gloss-123', 'en', 'fr');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('multi-gloss-123');
      expect(mockDeepLClient.deleteGlossaryDictionary).toHaveBeenCalledWith(
        'multi-gloss-123',
        'en',
        'fr'
      );
    });

    it('should handle API errors from getGlossary', async () => {
      mockDeepLClient.getGlossary.mockRejectedValue(
        new Error('Glossary not found')
      );

      await expect(
        glossaryService.deleteGlossaryDictionary('non-existent', 'en', 'es')
      ).rejects.toThrow('Glossary not found');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('non-existent');
      expect(mockDeepLClient.deleteGlossaryDictionary).not.toHaveBeenCalled();
    });

    it('should handle API errors from deleteGlossaryDictionary', async () => {
      // Mock a valid multilingual glossary
      mockDeepLClient.getGlossary.mockResolvedValue({
        glossary_id: 'multi-gloss-123',
        name: 'multi-glossary',
        source_lang: 'en',
        target_langs: ['es', 'fr'],
        dictionaries: [
          {
            source_lang: 'en',
            target_lang: 'es',
            entry_count: 10,
          },
          {
            source_lang: 'en',
            target_lang: 'fr',
            entry_count: 12,
          },
        ],
        creation_time: '2024-01-01T00:00:00Z',
      });

      mockDeepLClient.deleteGlossaryDictionary.mockRejectedValue(
        new Error('Dictionary deletion failed')
      );

      await expect(
        glossaryService.deleteGlossaryDictionary('multi-gloss-123', 'en', 'fr')
      ).rejects.toThrow('Dictionary deletion failed');

      expect(mockDeepLClient.getGlossary).toHaveBeenCalledWith('multi-gloss-123');
      expect(mockDeepLClient.deleteGlossaryDictionary).toHaveBeenCalledWith(
        'multi-gloss-123',
        'en',
        'fr'
      );
    });
  });

  describe('replaceGlossaryDictionary()', () => {
    it('should replace dictionary entries via PUT', async () => {
      mockDeepLClient.replaceGlossaryDictionary.mockResolvedValue(undefined);

      await glossaryService.replaceGlossaryDictionary(
        'glossary-123', 'en', 'es', 'hello\thola\nworld\tmundo'
      );

      expect(mockDeepLClient.replaceGlossaryDictionary).toHaveBeenCalledWith(
        'glossary-123', 'en', 'es', 'hello\thola\nworld\tmundo'
      );
    });

    it('should reject empty TSV content', async () => {
      await expect(
        glossaryService.replaceGlossaryDictionary('glossary-123', 'en', 'es', '')
      ).rejects.toThrow('No valid entries found');
    });

    it('should reject TSV with only invalid lines', async () => {
      await expect(
        glossaryService.replaceGlossaryDictionary('glossary-123', 'en', 'es', 'invalid-no-tab')
      ).rejects.toThrow('No valid entries found');
    });

    it('should handle API errors', async () => {
      mockDeepLClient.replaceGlossaryDictionary.mockRejectedValue(
        new Error('API error')
      );

      await expect(
        glossaryService.replaceGlossaryDictionary(
          'glossary-123', 'en', 'es', 'hello\thola'
        )
      ).rejects.toThrow('API error');
    });
  });
});
