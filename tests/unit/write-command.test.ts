/**
 * Tests for WriteCommand
 * Following TDD approach
 */

import { WriteCommand } from '../../src/cli/commands/write.js';
import { WriteService } from '../../src/services/write.js';
import { ConfigService } from '../../src/storage/config.js';
import { WriteImprovement } from '../../src/types/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock chalk to avoid ESM issues in tests
jest.mock('chalk', () => {
  const mockChalk = {
    green: (text: string) => text,
    red: (text: string) => text,
    cyan: (text: string) => text,
    bold: (text: string) => text,
    yellow: (text: string) => text,
  };
  return {
    __esModule: true,
    default: mockChalk,
  };
});

// Mock inquirer
jest.mock('inquirer', () => {
  const promptFn = jest.fn();
  return {
    __esModule: true,
    default: {
      prompt: promptFn,
    },
  };
});

import inquirer from 'inquirer';
const mockPrompt = inquirer.prompt as jest.MockedFunction<typeof inquirer.prompt>;

describe('WriteCommand', () => {
  let writeCommand: WriteCommand;
  let mockWriteService: jest.Mocked<WriteService>;
  let mockConfig: jest.Mocked<ConfigService>;
  let testDir: string;

  beforeEach(async () => {
    mockWriteService = {
      improve: jest.fn(),
      getBestImprovement: jest.fn(),
    } as unknown as jest.Mocked<WriteService>;

    mockConfig = {
      get: jest.fn().mockReturnValue({
        apiKey: 'test-key',
        defaults: {},
      }),
    } as unknown as jest.Mocked<ConfigService>;

    writeCommand = new WriteCommand(mockWriteService, mockConfig);

    // Create temporary directory for file tests
    testDir = join(tmpdir(), 'deepl-cli-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create a WriteCommand instance', () => {
      expect(writeCommand).toBeInstanceOf(WriteCommand);
    });
  });

  describe('improve()', () => {
    describe('basic functionality', () => {
      it('should improve text successfully', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'This is a well-written sentence.',
            targetLanguage: 'en-US',
          },
        ];

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovements[0]!);

        const result = await writeCommand.improve('This is a sentence.', {
          lang: 'en-US',
        });

        expect(result).toBe('This is a well-written sentence.');
        expect(mockWriteService.getBestImprovement).toHaveBeenCalledWith(
          'This is a sentence.',
          { targetLang: 'en-US' }
        );
      });

      it('should throw error for empty text', async () => {
        await expect(
          writeCommand.improve('', { lang: 'en-US' })
        ).rejects.toThrow('Text cannot be empty');
      });

      it('should throw error for missing language', async () => {
        await expect(
          writeCommand.improve('Test', { lang: '' as any })
        ).rejects.toThrow('Language is required');
      });
    });

    describe('writing style parameter', () => {
      it('should apply simple writing style', async () => {
        const mockImprovement: WriteImprovement = {
          text: 'This is easy to read.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('This is a sentence.', {
          lang: 'en-US',
          style: 'simple',
        });

        expect(result).toBe('This is easy to read.');
        expect(mockWriteService.getBestImprovement).toHaveBeenCalledWith(
          'This is a sentence.',
          { targetLang: 'en-US', writingStyle: 'simple' }
        );
      });

      it('should apply business writing style', async () => {
        const mockImprovement: WriteImprovement = {
          text: 'We are pleased to inform you.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('We want to tell you.', {
          lang: 'en-US',
          style: 'business',
        });

        expect(result).toBe('We are pleased to inform you.');
      });

      it('should apply academic writing style', async () => {
        const mockImprovement: WriteImprovement = {
          text: 'This study demonstrates effectiveness.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('This shows it works.', {
          lang: 'en-US',
          style: 'academic',
        });

        expect(result).toContain('demonstrates');
      });

      it('should apply casual writing style', async () => {
        const mockImprovement: WriteImprovement = {
          text: "Hey, that's pretty cool!",
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('That is interesting.', {
          lang: 'en-US',
          style: 'casual',
        });

        expect(result).toContain('cool');
      });
    });

    describe('tone parameter', () => {
      it('should apply enthusiastic tone', async () => {
        const mockImprovement: WriteImprovement = {
          text: 'This is absolutely fantastic!',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('This is good.', {
          lang: 'en-US',
          tone: 'enthusiastic',
        });

        expect(result).toContain('fantastic');
        expect(mockWriteService.getBestImprovement).toHaveBeenCalledWith(
          'This is good.',
          { targetLang: 'en-US', tone: 'enthusiastic' }
        );
      });

      it('should apply friendly tone', async () => {
        const mockImprovement: WriteImprovement = {
          text: "Hi there! Hope you're doing well.",
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('Hello.', {
          lang: 'en-US',
          tone: 'friendly',
        });

        expect(result).toContain('Hi');
      });

      it('should apply confident tone', async () => {
        const mockImprovement: WriteImprovement = {
          text: 'I am certain this will succeed.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('I think this will work.', {
          lang: 'en-US',
          tone: 'confident',
        });

        expect(result).toContain('certain');
      });

      it('should apply diplomatic tone', async () => {
        const mockImprovement: WriteImprovement = {
          text: 'Perhaps we could consider an alternative approach.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improve('Try something else.', {
          lang: 'en-US',
          tone: 'diplomatic',
        });

        expect(result).toContain('Perhaps');
      });
    });

    describe('alternatives option', () => {
      it('should return all alternatives when showAlternatives is true', async () => {
        const mockImprovements: WriteImprovement[] = [
          { text: 'First improvement.', targetLanguage: 'en-US' },
          { text: 'Second improvement.', targetLanguage: 'en-US' },
          { text: 'Third improvement.', targetLanguage: 'en-US' },
        ];

        mockWriteService.improve.mockResolvedValue(mockImprovements);

        const result = await writeCommand.improve('Test', {
          lang: 'en-US',
          showAlternatives: true,
        });

        expect(result).toContain('First improvement.');
        expect(result).toContain('Second improvement.');
        expect(result).toContain('Third improvement.');
        expect(mockWriteService.improve).toHaveBeenCalledWith(
          'Test',
          { targetLang: 'en-US' }
        );
      });

      it('should format alternatives with numbering', async () => {
        const mockImprovements: WriteImprovement[] = [
          { text: 'Option one.', targetLanguage: 'en-US' },
          { text: 'Option two.', targetLanguage: 'en-US' },
        ];

        mockWriteService.improve.mockResolvedValue(mockImprovements);

        const result = await writeCommand.improve('Test', {
          lang: 'en-US',
          showAlternatives: true,
        });

        expect(result).toMatch(/1\./);
        expect(result).toMatch(/2\./);
      });
    });

    describe('parameter constraints', () => {
      it('should throw error when both style and tone are specified', async () => {
        await expect(
          writeCommand.improve('Test', {
            lang: 'en-US',
            style: 'business',
            tone: 'enthusiastic',
          })
        ).rejects.toThrow('Cannot specify both style and tone');
      });
    });

    describe('error handling', () => {
      it('should propagate service errors', async () => {
        mockWriteService.getBestImprovement.mockRejectedValue(
          new Error('Service error')
        );

        await expect(
          writeCommand.improve('Test', { lang: 'en-US' })
        ).rejects.toThrow('Service error');
      });

      it('should handle authentication errors', async () => {
        mockWriteService.getBestImprovement.mockRejectedValue(
          new Error('Authentication failed: Invalid API key')
        );

        await expect(
          writeCommand.improve('Test', { lang: 'en-US' })
        ).rejects.toThrow('Authentication failed');
      });

      it('should handle quota exceeded errors', async () => {
        mockWriteService.getBestImprovement.mockRejectedValue(
          new Error('Quota exceeded: Character limit reached')
        );

        await expect(
          writeCommand.improve('Test', { lang: 'en-US' })
        ).rejects.toThrow('Quota exceeded');
      });
    });

    describe('supported languages', () => {
      it('should work with all supported Write languages', async () => {
        const languages: Array<'de' | 'en-GB' | 'en-US' | 'es' | 'fr' | 'it' | 'pt-BR' | 'pt-PT'> = [
          'de',
          'en-GB',
          'en-US',
          'es',
          'fr',
          'it',
          'pt-BR',
          'pt-PT',
        ];

        for (const lang of languages) {
          const mockImprovement: WriteImprovement = {
            text: 'Improved text.',
            targetLanguage: lang,
          };

          mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

          const result = await writeCommand.improve('Test', { lang });

          expect(result).toBe('Improved text.');
        }
      });
    });
  });

  describe('improveFile()', () => {
    describe('basic file operations', () => {
      it('should read and improve text from a file', async () => {
        const testFile = join(testDir, 'test.txt');
        await fs.writeFile(testFile, 'Original content', 'utf-8');

        const mockImprovement: WriteImprovement = {
          text: 'This is improved content.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improveFile(testFile, {
          lang: 'en-US',
        });

        expect(result).toBe('This is improved content.');
        expect(mockWriteService.getBestImprovement).toHaveBeenCalledWith(
          'Original content',
          { targetLang: 'en-US' }
        );
      });

      it('should throw error for non-existent file', async () => {
        await expect(
          writeCommand.improveFile(join(testDir, 'nonexistent.txt'), { lang: 'en-US' })
        ).rejects.toThrow('File not found');
      });

      it('should throw error for empty file path', async () => {
        await expect(
          writeCommand.improveFile('', { lang: 'en-US' })
        ).rejects.toThrow('File path cannot be empty');
      });
    });

    describe('output to file', () => {
      it('should write improved text to output file', async () => {
        const inputFile = join(testDir, 'input.txt');
        const outputFile = join(testDir, 'output.txt');
        await fs.writeFile(inputFile, 'Original text', 'utf-8');

        const mockImprovement: WriteImprovement = {
          text: 'This is improved content.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        await writeCommand.improveFile(inputFile, {
          lang: 'en-US',
          outputFile,
        });

        const outputContent = await fs.readFile(outputFile, 'utf-8');
        expect(outputContent).toBe('This is improved content.');
      });

      it('should support in-place editing when no output file specified', async () => {
        const testFile = join(testDir, 'test.txt');
        await fs.writeFile(testFile, 'Original content', 'utf-8');

        const mockImprovement: WriteImprovement = {
          text: 'Improved content.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        const result = await writeCommand.improveFile(testFile, {
          lang: 'en-US',
          inPlace: true,
        });

        expect(result).toBe('Improved content.');
        const fileContent = await fs.readFile(testFile, 'utf-8');
        expect(fileContent).toBe('Improved content.');
      });
    });

    describe('file format handling', () => {
      it('should handle .txt files', async () => {
        const testFile = join(testDir, 'test.txt');
        await fs.writeFile(testFile, 'Plain text content', 'utf-8');

        const mockImprovement: WriteImprovement = {
          text: 'Improved text.',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        await writeCommand.improveFile(testFile, { lang: 'en-US' });

        expect(mockWriteService.getBestImprovement).toHaveBeenCalled();
      });

      it('should handle .md files', async () => {
        const testFile = join(testDir, 'test.md');
        await fs.writeFile(testFile, '# Original Heading', 'utf-8');

        const mockImprovement: WriteImprovement = {
          text: '# Improved Heading',
          targetLanguage: 'en-US',
        };

        mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

        await writeCommand.improveFile(testFile, { lang: 'en-US' });

        expect(mockWriteService.getBestImprovement).toHaveBeenCalled();
      });
    });
  });

  describe('generateDiff()', () => {
    it('should generate a diff between original and improved text', () => {
      const original = 'This is the original text.';
      const improved = 'This is the improved text.';

      const diff = writeCommand.generateDiff(original, improved);

      expect(diff).toContain('original');
      expect(diff).toContain('improved');
      expect(diff).toContain('-');
      expect(diff).toContain('+');
    });

    it('should show no changes when texts are identical', () => {
      const text = 'Same text.';

      const diff = writeCommand.generateDiff(text, text);

      expect(diff).toBeTruthy();
    });

    it('should handle multi-line text', () => {
      const original = 'Line 1\nLine 2\nLine 3';
      const improved = 'Line 1\nModified Line 2\nLine 3';

      const diff = writeCommand.generateDiff(original, improved);

      expect(diff).toContain('Line 1');
      expect(diff).toContain('Line 3');
    });

    it('should handle empty strings', () => {
      const diff = writeCommand.generateDiff('', 'New content');

      expect(diff).toContain('+');
      expect(diff).toContain('New content');
    });
  });

  describe('improveWithDiff()', () => {
    it('should return improved text with diff view', async () => {
      const original = 'Original text.';
      const mockImprovement: WriteImprovement = {
        text: 'Improved text.',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.improveWithDiff(original, {
        lang: 'en-US',
      });

      expect(result.original).toBe(original);
      expect(result.improved).toBe('Improved text.');
      expect(result.diff).toContain('-');
      expect(result.diff).toContain('+');
    });

    it('should work with file input', async () => {
      const testFile = join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Original content', 'utf-8');

      const mockImprovement: WriteImprovement = {
        text: 'Improved content.',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.improveFileWithDiff(testFile, {
        lang: 'en-US',
      });

      expect(result.original).toBe('Original content');
      expect(result.improved).toBe('Improved content.');
      expect(result.diff).toBeTruthy();
    });
  });

  describe('checkText()', () => {
    it('should return true if text needs improvement', async () => {
      const mockImprovement: WriteImprovement = {
        text: 'Improved text.',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.checkText('Original text.', {
        lang: 'en-US',
      });

      expect(result.needsImprovement).toBe(true);
      expect(result.original).toBe('Original text.');
      expect(result.improved).toBe('Improved text.');
      expect(result.changes).toBeGreaterThan(0);
    });

    it('should return false if text does not need improvement', async () => {
      const text = 'Perfect text.';
      const mockImprovement: WriteImprovement = {
        text,
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.checkText(text, {
        lang: 'en-US',
      });

      expect(result.needsImprovement).toBe(false);
      expect(result.original).toBe(text);
      expect(result.improved).toBe(text);
      expect(result.changes).toBe(0);
    });

    it('should count number of changes', async () => {
      const mockImprovement: WriteImprovement = {
        text: 'Line 1 improved\nLine 2\nLine 3 improved',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.checkText(
        'Line 1 original\nLine 2\nLine 3 original',
        { lang: 'en-US' }
      );

      expect(result.needsImprovement).toBe(true);
      expect(result.changes).toBeGreaterThan(0);
    });
  });

  describe('checkFile()', () => {
    it('should check if file needs improvement', async () => {
      const testFile = join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Original content', 'utf-8');

      const mockImprovement: WriteImprovement = {
        text: 'Improved content.',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.checkFile(testFile, {
        lang: 'en-US',
      });

      expect(result.needsImprovement).toBe(true);
      expect(result.filePath).toBe(testFile);
      expect(result.changes).toBeGreaterThan(0);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        writeCommand.checkFile(join(testDir, 'nonexistent.txt'), {
          lang: 'en-US',
        })
      ).rejects.toThrow('File not found');
    });

    it('should return false if file does not need improvement', async () => {
      const testFile = join(testDir, 'perfect.txt');
      const content = 'Perfect content.';
      await fs.writeFile(testFile, content, 'utf-8');

      const mockImprovement: WriteImprovement = {
        text: content,
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.checkFile(testFile, {
        lang: 'en-US',
      });

      expect(result.needsImprovement).toBe(false);
      expect(result.changes).toBe(0);
    });
  });

  describe('autoFixFile()', () => {
    it('should automatically fix file in-place', async () => {
      const testFile = join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Original content', 'utf-8');

      const mockImprovement: WriteImprovement = {
        text: 'Improved content.',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.autoFixFile(testFile, {
        lang: 'en-US',
      });

      expect(result.fixed).toBe(true);
      expect(result.filePath).toBe(testFile);
      expect(result.changes).toBeGreaterThan(0);

      // Verify file was updated
      const fileContent = await fs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe('Improved content.');
    });

    it('should not modify file if no improvements needed', async () => {
      const testFile = join(testDir, 'perfect.txt');
      const content = 'Perfect content.';
      await fs.writeFile(testFile, content, 'utf-8');

      const mockImprovement: WriteImprovement = {
        text: content,
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.autoFixFile(testFile, {
        lang: 'en-US',
      });

      expect(result.fixed).toBe(false);
      expect(result.changes).toBe(0);

      // Verify file was not changed
      const fileContent = await fs.readFile(testFile, 'utf-8');
      expect(fileContent).toBe(content);
    });

    it('should create backup when requested', async () => {
      const testFile = join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Original content', 'utf-8');

      const mockImprovement: WriteImprovement = {
        text: 'Improved content.',
        targetLanguage: 'en-US',
      };

      mockWriteService.getBestImprovement.mockResolvedValue(mockImprovement);

      const result = await writeCommand.autoFixFile(testFile, {
        lang: 'en-US',
        createBackup: true,
      });

      expect(result.fixed).toBe(true);
      expect(result.backupPath).toBeTruthy();

      // Verify backup exists
      const backupContent = await fs.readFile(result.backupPath!, 'utf-8');
      expect(backupContent).toBe('Original content');
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        writeCommand.autoFixFile(join(testDir, 'nonexistent.txt'), {
          lang: 'en-US',
        })
      ).rejects.toThrow('File not found');
    });
  });

  describe('improveInteractive()', () => {
    beforeEach(() => {
      mockPrompt.mockClear();
    });

    it('should show alternatives and let user select one', async () => {
      const mockImprovements: WriteImprovement[] = [
        { text: 'First improvement.', targetLanguage: 'en-US' },
        { text: 'Second improvement.', targetLanguage: 'en-US' },
        { text: 'Third improvement.', targetLanguage: 'en-US' },
      ];

      mockWriteService.improve.mockResolvedValue(mockImprovements);
      mockPrompt.mockResolvedValue({ selection: 1 });

      const result = await writeCommand.improveInteractive('Original text.', {
        lang: 'en-US',
      });

      expect(result).toBe('Second improvement.');
      expect(mockPrompt).toHaveBeenCalled();
    });

    it('should allow user to keep original text', async () => {
      const mockImprovements: WriteImprovement[] = [
        { text: 'Improved text.', targetLanguage: 'en-US' },
      ];

      mockWriteService.improve.mockResolvedValue(mockImprovements);
      mockPrompt.mockResolvedValue({ selection: -1 }); // -1 = keep original

      const result = await writeCommand.improveInteractive('Original text.', {
        lang: 'en-US',
      });

      expect(result).toBe('Original text.');
    });

    it('should handle file input in interactive mode', async () => {
      const testFile = join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Original content', 'utf-8');

      const mockImprovements: WriteImprovement[] = [
        { text: 'Improved content.', targetLanguage: 'en-US' },
      ];

      mockWriteService.improve.mockResolvedValue(mockImprovements);
      mockPrompt.mockResolvedValue({ selection: 0 });

      const result = await writeCommand.improveFileInteractive(testFile, {
        lang: 'en-US',
      });

      expect(result.selected).toBe('Improved content.');
      expect(result.alternatives).toEqual(['Improved content.']);
    });

    it('should show diff for each alternative', async () => {
      const mockImprovements: WriteImprovement[] = [
        { text: 'First option.', targetLanguage: 'en-US' },
        { text: 'Second option.', targetLanguage: 'en-US' },
      ];

      mockWriteService.improve.mockResolvedValue(mockImprovements);
      mockPrompt.mockResolvedValue({ selection: 0 });

      await writeCommand.improveInteractive('Original.', {
        lang: 'en-US',
      });

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'list',
            name: 'selection',
          })
        ])
      );
    });
  });
});
