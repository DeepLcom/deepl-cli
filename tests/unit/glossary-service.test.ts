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
});
