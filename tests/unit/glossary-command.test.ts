/**
 * Tests for Glossary Command
 * Following TDD approach
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { GlossaryCommand } from '../../src/cli/commands/glossary';
import { GlossaryService } from '../../src/services/glossary';
import { GlossaryInfo } from '../../src/types/glossary.js';
import * as fs from 'fs';

// Mock dependencies
jest.mock('../../src/services/glossary');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    lstatSync: jest.fn(),
  };
});

describe('GlossaryCommand', () => {
  let mockGlossaryService: jest.Mocked<GlossaryService>;
  let glossaryCommand: GlossaryCommand;

  const mockGlossary: GlossaryInfo = {
    glossary_id: '123-456-789',
    name: 'Tech Terms',
    source_lang: 'en',
    target_langs: ['es'],
    dictionaries: [{
      source_lang: 'en',
      target_lang: 'es',
      entry_count: 10,
    }],
    creation_time: '2024-01-15T10:30:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGlossaryService = {
      createGlossary: jest.fn().mockResolvedValue(mockGlossary),
      createGlossaryFromTSV: jest.fn().mockResolvedValue(mockGlossary),
      listGlossaries: jest.fn().mockResolvedValue([mockGlossary]),
      getGlossary: jest.fn().mockResolvedValue(mockGlossary),
      getGlossaryByName: jest.fn().mockResolvedValue(mockGlossary),
      deleteGlossary: jest.fn().mockResolvedValue(undefined),
      getGlossaryEntries: jest.fn().mockResolvedValue({ hello: 'hola', world: 'mundo' }),
      getGlossaryLanguages: jest.fn().mockResolvedValue([]),
      addEntry: jest.fn().mockResolvedValue(mockGlossary),
      updateEntry: jest.fn().mockResolvedValue(mockGlossary),
      removeEntry: jest.fn().mockResolvedValue(mockGlossary),
      renameGlossary: jest.fn().mockResolvedValue(mockGlossary),
      entriesToTSV: jest.fn().mockReturnValue('hello\thola\nworld\tmundo'),
      tsvToEntries: jest.fn().mockReturnValue({ hello: 'hola', world: 'mundo' }),
    } as unknown as jest.Mocked<GlossaryService>;

    glossaryCommand = new GlossaryCommand(mockGlossaryService);
  });

  describe('create()', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('hello\thola\nworld\tmundo');
      (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => false });
    });

    it('should create glossary from TSV file', async () => {
      const result = await glossaryCommand.create('Tech Terms', 'en', ['es'], '/path/to/glossary.tsv');

      expect(result).toEqual(mockGlossary);
      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/glossary.tsv');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/glossary.tsv', 'utf-8');
      expect(mockGlossaryService.createGlossaryFromTSV).toHaveBeenCalledWith(
        'Tech Terms',
        'en',
        ['es'],
        'hello\thola\nworld\tmundo'
      );
    });

    it('should throw error if file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(
        glossaryCommand.create('Tech Terms', 'en', ['es'], '/path/to/missing.tsv')
      ).rejects.toThrow('File not found');
    });

    it('should handle glossary service errors', async () => {
      (mockGlossaryService.createGlossaryFromTSV as jest.Mock).mockRejectedValueOnce(
        new Error('Invalid glossary format')
      );

      await expect(
        glossaryCommand.create('Tech Terms', 'en', ['es'], '/path/to/glossary.tsv')
      ).rejects.toThrow('Invalid glossary format');
    });

    it('should reject symlinks for security', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => true });

      await expect(
        glossaryCommand.create('Tech Terms', 'en', ['es'], '/path/to/symlink.tsv')
      ).rejects.toThrow('Symlinks are not supported for security reasons');
    });
  });

  describe('list()', () => {
    it('should list all glossaries', async () => {
      const result = await glossaryCommand.list();

      expect(result).toEqual([mockGlossary]);
      expect(mockGlossaryService.listGlossaries).toHaveBeenCalled();
    });

    it('should return empty array when no glossaries exist', async () => {
      (mockGlossaryService.listGlossaries as jest.Mock).mockResolvedValueOnce([]);

      const result = await glossaryCommand.list();

      expect(result).toEqual([]);
    });
  });

  describe('show()', () => {
    it('should get glossary by ID', async () => {
      const result = await glossaryCommand.show('123-456-789');

      expect(result).toEqual(mockGlossary);
      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
    });

    it('should fallback to get by name if ID fails', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(
        new Error('Not found')
      );

      const result = await glossaryCommand.show('Tech Terms');

      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('Tech Terms');
      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('Tech Terms');
      expect(result).toEqual(mockGlossary);
    });

    it('should throw error if glossary not found by ID or name', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(
        new Error('Not found')
      );
      (mockGlossaryService.getGlossaryByName as jest.Mock).mockResolvedValueOnce(null);

      await expect(glossaryCommand.show('NonExistent')).rejects.toThrow('Glossary not found');
    });
  });

  describe('delete()', () => {
    it('should delete glossary by ID', async () => {
      await glossaryCommand.delete('123-456-789');

      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
      expect(mockGlossaryService.deleteGlossary).toHaveBeenCalledWith('123-456-789');
    });

    it('should delete glossary by name', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(
        new Error('Not found')
      );

      await glossaryCommand.delete('Tech Terms');

      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('Tech Terms');
      expect(mockGlossaryService.deleteGlossary).toHaveBeenCalledWith('123-456-789');
    });
  });

  describe('entries()', () => {
    it('should get glossary entries', async () => {
      const result = await glossaryCommand.entries('123-456-789');

      expect(result).toEqual({ hello: 'hola', world: 'mundo' });
      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
      expect(mockGlossaryService.getGlossaryEntries).toHaveBeenCalledWith('123-456-789', 'en', 'es');
    });
  });

  describe('listLanguages()', () => {
    it('should list supported glossary language pairs', async () => {
      const mockPairs = [
        { sourceLang: 'en', targetLang: 'es' },
        { sourceLang: 'de', targetLang: 'en' },
      ];
      (mockGlossaryService.getGlossaryLanguages as jest.Mock).mockResolvedValue(mockPairs);

      const result = await glossaryCommand.listLanguages();

      expect(result).toEqual(mockPairs);
      expect(mockGlossaryService.getGlossaryLanguages).toHaveBeenCalled();
    });
  });

  describe('addEntry()', () => {
    it('should add entry to glossary by ID', async () => {
      (mockGlossaryService.addEntry as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.addEntry('123-456-789', 'hello', 'hola');

      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
      expect(mockGlossaryService.addEntry).toHaveBeenCalledWith('123-456-789', 'en', 'es', 'hello', 'hola');
    });

    it('should add entry to glossary by name', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (mockGlossaryService.addEntry as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.addEntry('Tech Terms', 'hello', 'hola');

      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('Tech Terms');
      expect(mockGlossaryService.addEntry).toHaveBeenCalledWith('123-456-789', 'en', 'es', 'hello', 'hola');
    });
  });

  describe('updateEntry()', () => {
    it('should update entry in glossary by ID', async () => {
      (mockGlossaryService.updateEntry as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.updateEntry('123-456-789', 'hello', 'hola updated');

      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
      expect(mockGlossaryService.updateEntry).toHaveBeenCalledWith('123-456-789', 'en', 'es', 'hello', 'hola updated');
    });

    it('should update entry in glossary by name', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (mockGlossaryService.updateEntry as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.updateEntry('Tech Terms', 'hello', 'hola updated');

      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('Tech Terms');
      expect(mockGlossaryService.updateEntry).toHaveBeenCalledWith('123-456-789', 'en', 'es', 'hello', 'hola updated');
    });
  });

  describe('removeEntry()', () => {
    it('should remove entry from glossary by ID', async () => {
      (mockGlossaryService.removeEntry as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.removeEntry('123-456-789', 'hello');

      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
      expect(mockGlossaryService.removeEntry).toHaveBeenCalledWith('123-456-789', 'en', 'es', 'hello');
    });

    it('should remove entry from glossary by name', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (mockGlossaryService.removeEntry as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.removeEntry('Tech Terms', 'hello');

      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('Tech Terms');
      expect(mockGlossaryService.removeEntry).toHaveBeenCalledWith('123-456-789', 'en', 'es', 'hello');
    });
  });

  describe('rename()', () => {
    it('should rename glossary by ID', async () => {
      (mockGlossaryService.renameGlossary as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.rename('123-456-789', 'New Name');

      expect(mockGlossaryService.getGlossary).toHaveBeenCalledWith('123-456-789');
      expect(mockGlossaryService.renameGlossary).toHaveBeenCalledWith('123-456-789', 'New Name');
    });

    it('should rename glossary by name', async () => {
      (mockGlossaryService.getGlossary as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
      (mockGlossaryService.renameGlossary as jest.Mock).mockResolvedValue(undefined);

      await glossaryCommand.rename('Tech Terms', 'New Name');

      expect(mockGlossaryService.getGlossaryByName).toHaveBeenCalledWith('Tech Terms');
      expect(mockGlossaryService.renameGlossary).toHaveBeenCalledWith('123-456-789', 'New Name');
    });

    it('should handle rename errors', async () => {
      (mockGlossaryService.renameGlossary as jest.Mock).mockRejectedValueOnce(
        new Error('New name must be different from current name')
      );

      await expect(
        glossaryCommand.rename('123-456-789', 'Tech Terms')
      ).rejects.toThrow('New name must be different from current name');
    });
  });

  describe('formatGlossaryInfo()', () => {
    it('should format glossary info for display', () => {
      const result = glossaryCommand.formatGlossaryInfo(mockGlossary);

      expect(result).toContain('Name: Tech Terms');
      expect(result).toContain('ID: 123-456-789');
      expect(result).toContain('Source language: en');
      expect(result).toContain('Target languages: es');
      expect(result).toContain('Total entries: 10');
    });
  });

  describe('formatGlossaryList()', () => {
    it('should format glossary list for display', () => {
      const result = glossaryCommand.formatGlossaryList([mockGlossary]);

      expect(result).toContain('Tech Terms');
      expect(result).toContain('(en→es)');
      expect(result).toContain('10 entries');
    });

    it('should show empty message when no glossaries', () => {
      const result = glossaryCommand.formatGlossaryList([]);

      expect(result).toBe('No glossaries found');
    });
  });

  describe('replaceDictionary()', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('hello\thola\nworld\tmundo');
      (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => false });
      mockGlossaryService.replaceGlossaryDictionary = jest.fn().mockResolvedValue(undefined);
    });

    it('should reject symlinks for security', async () => {
      (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => true });

      await expect(
        glossaryCommand.replaceDictionary('123-456-789', 'es', '/path/to/symlink.tsv')
      ).rejects.toThrow('Symlinks are not supported for security reasons');
    });
  });

  describe('formatEntries()', () => {
    it('should format entries for display', () => {
      const entries = { hello: 'hola', world: 'mundo' };

      const result = glossaryCommand.formatEntries(entries);

      expect(result).toContain('hello → hola');
      expect(result).toContain('world → mundo');
    });

    it('should show empty message when no entries', () => {
      const result = glossaryCommand.formatEntries({});

      expect(result).toBe('No entries found');
    });
  });
});
