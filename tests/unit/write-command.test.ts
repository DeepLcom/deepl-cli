/**
 * Tests for WriteCommand
 * Following TDD approach
 */

import { WriteCommand } from '../../src/cli/commands/write.js';
import { WriteService } from '../../src/services/write.js';
import { ConfigService } from '../../src/storage/config.js';
import { WriteImprovement } from '../../src/types/index.js';

describe('WriteCommand', () => {
  let writeCommand: WriteCommand;
  let mockWriteService: jest.Mocked<WriteService>;
  let mockConfig: jest.Mocked<ConfigService>;

  beforeEach(() => {
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
});
