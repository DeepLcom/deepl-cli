/**
 * Tests for WriteService
 * Following TDD approach
 */

import { WriteService } from '../../src/services/write.js';
import { DeepLClient } from '../../src/api/deepl-client.js';
import { WriteImprovement } from '../../src/types/index.js';

describe('WriteService', () => {
  let writeService: WriteService;
  let mockClient: jest.Mocked<DeepLClient>;

  beforeEach(() => {
    mockClient = {
      improveText: jest.fn(),
    } as unknown as jest.Mocked<DeepLClient>;

    writeService = new WriteService(mockClient);
  });

  describe('initialization', () => {
    it('should create a WriteService instance', () => {
      expect(writeService).toBeInstanceOf(WriteService);
    });

    it('should throw error if client is not provided', () => {
      expect(() => {
        new WriteService(null as unknown as DeepLClient);
      }).toThrow();
    });
  });

  describe('improve()', () => {
    describe('basic functionality', () => {
      it('should improve text successfully', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'This is a well-written sentence.',
            targetLanguage: 'en-US',
            detectedSourceLanguage: 'en',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('This is a sentence.', {
          targetLang: 'en-US',
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.text).toBe('This is a well-written sentence.');
        expect(mockClient.improveText).toHaveBeenCalledWith('This is a sentence.', {
          targetLang: 'en-US',
        });
      });

      it('should throw error for empty text', async () => {
        await expect(
          writeService.improve('', { targetLang: 'en-US' })
        ).rejects.toThrow('Text cannot be empty');
      });

      it('should throw error for whitespace-only text', async () => {
        await expect(
          writeService.improve('   ', { targetLang: 'en-US' })
        ).rejects.toThrow('Text cannot be empty');
      });

      it('should throw error for missing target language', async () => {
        await expect(
          writeService.improve('Test', { targetLang: '' as any })
        ).rejects.toThrow('Target language is required');
      });
    });

    describe('writing style parameter', () => {
      it('should apply simple writing style', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'This is easy to read.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('This is a sentence.', {
          targetLang: 'en-US',
          writingStyle: 'simple',
        });

        expect(result[0]?.text).toBe('This is easy to read.');
        expect(mockClient.improveText).toHaveBeenCalledWith('This is a sentence.', {
          targetLang: 'en-US',
          writingStyle: 'simple',
        });
      });

      it('should apply business writing style', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'We are pleased to inform you.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('We want to tell you.', {
          targetLang: 'en-US',
          writingStyle: 'business',
        });

        expect(result[0]?.text).toBe('We are pleased to inform you.');
      });

      it('should apply academic writing style', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'This study demonstrates the effectiveness of the method.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('This shows it works.', {
          targetLang: 'en-US',
          writingStyle: 'academic',
        });

        expect(result[0]?.text).toContain('demonstrates');
      });

      it('should apply casual writing style', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: "Hey, that's pretty cool!",
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('That is interesting.', {
          targetLang: 'en-US',
          writingStyle: 'casual',
        });

        expect(result[0]?.text).toContain('cool');
      });
    });

    describe('tone parameter', () => {
      it('should apply enthusiastic tone', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'This is absolutely fantastic!',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('This is good.', {
          targetLang: 'en-US',
          tone: 'enthusiastic',
        });

        expect(result[0]?.text).toContain('fantastic');
      });

      it('should apply friendly tone', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: "Hi there! Hope you're doing well.",
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Hello.', {
          targetLang: 'en-US',
          tone: 'friendly',
        });

        expect(result[0]?.text).toContain('Hi');
      });

      it('should apply confident tone', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'I am certain this will succeed.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('I think this will work.', {
          targetLang: 'en-US',
          tone: 'confident',
        });

        expect(result[0]?.text).toContain('certain');
      });

      it('should apply diplomatic tone', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'Perhaps we could consider an alternative approach.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Try something else.', {
          targetLang: 'en-US',
          tone: 'diplomatic',
        });

        expect(result[0]?.text).toContain('Perhaps');
      });
    });

    describe('parameter constraints', () => {
      it('should throw error when both writing_style and tone are specified', async () => {
        await expect(
          writeService.improve('Test', {
            targetLang: 'en-US',
            writingStyle: 'business',
            tone: 'enthusiastic',
          })
        ).rejects.toThrow('Cannot specify both writing_style and tone');
      });

      it('should work with only target language', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'Improved text.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Test text.', {
          targetLang: 'en-US',
        });

        expect(result[0]?.text).toBe('Improved text.');
      });
    });

    describe('error handling', () => {
      it('should propagate client errors', async () => {
        mockClient.improveText.mockRejectedValue(new Error('API error'));

        await expect(
          writeService.improve('Test', { targetLang: 'en-US' })
        ).rejects.toThrow('API error');
      });

      it('should handle authentication errors', async () => {
        mockClient.improveText.mockRejectedValue(
          new Error('Authentication failed: Invalid API key')
        );

        await expect(
          writeService.improve('Test', { targetLang: 'en-US' })
        ).rejects.toThrow('Authentication failed');
      });

      it('should handle quota exceeded errors', async () => {
        mockClient.improveText.mockRejectedValue(
          new Error('Quota exceeded: Character limit reached')
        );

        await expect(
          writeService.improve('Test', { targetLang: 'en-US' })
        ).rejects.toThrow('Quota exceeded');
      });

      it('should handle rate limit errors', async () => {
        mockClient.improveText.mockRejectedValue(
          new Error('Rate limit exceeded: Too many requests')
        );

        await expect(
          writeService.improve('Test', { targetLang: 'en-US' })
        ).rejects.toThrow('Rate limit exceeded');
      });
    });

    describe('edge cases', () => {
      it('should handle long text', async () => {
        const longText = 'This is a test sentence. '.repeat(100);
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'Improved long text. '.repeat(100),
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve(longText, {
          targetLang: 'en-US',
        });

        expect(result[0]?.text.length).toBeGreaterThan(0);
      });

      it('should handle special characters', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'This is a test: "quotes" & special chars!',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Test: quotes & chars', {
          targetLang: 'en-US',
        });

        expect(result[0]?.text).toContain('&');
        expect(result[0]?.text).toContain('"');
      });

      it('should handle newlines', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'First paragraph.\n\nSecond paragraph.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Para 1.\n\nPara 2.', {
          targetLang: 'en-US',
        });

        expect(result[0]?.text).toContain('\n\n');
      });

      it('should handle multiple improvements', async () => {
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'First improvement.',
            targetLanguage: 'en-US',
          },
          {
            text: 'Second improvement.',
            targetLanguage: 'en-US',
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Test', {
          targetLang: 'en-US',
        });

        expect(result).toHaveLength(2);
        expect(result[0]?.text).toBe('First improvement.');
        expect(result[1]?.text).toBe('Second improvement.');
      });
    });
  });

  describe('getBestImprovement()', () => {
    it('should return the first improvement', async () => {
      const mockImprovements: WriteImprovement[] = [
        {
          text: 'Best improvement.',
          targetLanguage: 'en-US',
        },
        {
          text: 'Alternative improvement.',
          targetLanguage: 'en-US',
        },
      ];

      mockClient.improveText.mockResolvedValue(mockImprovements);

      const result = await writeService.getBestImprovement('Test', {
        targetLang: 'en-US',
      });

      expect(result.text).toBe('Best improvement.');
    });

    it('should throw error if no improvements available', async () => {
      mockClient.improveText.mockResolvedValue([]);

      await expect(
        writeService.getBestImprovement('Test', { targetLang: 'en-US' })
      ).rejects.toThrow('No improvements available');
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
        const mockImprovements: WriteImprovement[] = [
          {
            text: 'Improved text.',
            targetLanguage: lang,
          },
        ];

        mockClient.improveText.mockResolvedValue(mockImprovements);

        const result = await writeService.improve('Test', {
          targetLang: lang,
        });

        expect(result[0]?.targetLanguage).toBe(lang);
      }
    });
  });
});
