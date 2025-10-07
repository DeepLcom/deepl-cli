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
        ready: true,
        source_lang: 'en',
        target_lang: 'es',
        creation_time: '2024-01-01T00:00:00Z',
        entry_count: 3,
      });

      const result = await glossaryService.createGlossary(
        'tech-terms',
        'en',
        'es',
        entries
      );

      expect(result.glossary_id).toBe('test-glossary-123');
      expect(result.name).toBe('tech-terms');
      expect(result.entry_count).toBe(3);
      expect(mockDeepLClient.createGlossary).toHaveBeenCalledWith(
        'tech-terms',
        'en',
        'es',
        expect.any(String)
      );
    });

    it('should handle empty entries', async () => {
      await expect(
        glossaryService.createGlossary('empty', 'en', 'es', {})
      ).rejects.toThrow('Glossary entries cannot be empty');
    });

    it('should validate glossary name', async () => {
      await expect(
        glossaryService.createGlossary('', 'en', 'es', { test: 'test' })
      ).rejects.toThrow('Glossary name is required');
    });
  });

  describe('createGlossaryFromTSV()', () => {
    it('should create glossary from TSV string', async () => {
      const tsv = 'API\tAPI\nREST\tREST\nHello\tHola';

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'test',
        ready: true,
        source_lang: 'en',
        target_lang: 'es',
        creation_time: '2024-01-01T00:00:00Z',
        entry_count: 3,
      });

      const result = await glossaryService.createGlossaryFromTSV(
        'test',
        'en',
        'es',
        tsv
      );

      expect(result.entry_count).toBe(3);
    });

    it('should handle CSV format', async () => {
      const csv = 'API,API\nREST,REST\nHello,Hola';

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'test',
        ready: true,
        source_lang: 'en',
        target_lang: 'es',
        creation_time: '2024-01-01T00:00:00Z',
        entry_count: 3,
      });

      const result = await glossaryService.createGlossaryFromTSV(
        'test',
        'en',
        'es',
        csv
      );

      expect(result.entry_count).toBe(3);
    });

    it('should skip empty lines', async () => {
      const tsv = 'API\tAPI\n\nREST\tREST\n\nHello\tHola';

      mockDeepLClient.createGlossary.mockResolvedValue({
        glossary_id: 'test-123',
        name: 'test',
        ready: true,
        source_lang: 'en',
        target_lang: 'es',
        creation_time: '2024-01-01T00:00:00Z',
        entry_count: 3,
      });

      const result = await glossaryService.createGlossaryFromTSV(
        'test',
        'en',
        'es',
        tsv
      );

      expect(result.entry_count).toBe(3);
    });
  });

  describe('listGlossaries()', () => {
    it('should return list of glossaries', async () => {
      mockDeepLClient.listGlossaries.mockResolvedValue([
        {
          glossary_id: 'gloss-1',
          name: 'tech-terms',
          ready: true,
          source_lang: 'en',
          target_lang: 'es',
          creation_time: '2024-01-01T00:00:00Z',
          entry_count: 10,
        },
        {
          glossary_id: 'gloss-2',
          name: 'legal-terms',
          ready: true,
          source_lang: 'en',
          target_lang: 'de',
          creation_time: '2024-01-02T00:00:00Z',
          entry_count: 25,
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
        ready: true,
        source_lang: 'en',
        target_lang: 'es',
        creation_time: '2024-01-01T00:00:00Z',
        entry_count: 10,
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
          ready: true,
          source_lang: 'en',
          target_lang: 'es',
          creation_time: '2024-01-01T00:00:00Z',
          entry_count: 10,
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

      const entries = await glossaryService.getGlossaryEntries('test-123');

      expect(entries).toEqual({
        API: 'API',
        REST: 'REST',
        Hello: 'Hola',
      });
    });

    it('should handle empty glossary', async () => {
      mockDeepLClient.getGlossaryEntries.mockResolvedValue('');

      const entries = await glossaryService.getGlossaryEntries('test-123');

      expect(entries).toEqual({});
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
});
