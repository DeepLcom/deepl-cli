import { DetectService } from '../../src/services/detect';
import { createMockDeepLClient } from '../helpers/mock-factories';

jest.mock('../../src/api/deepl-client');

describe('DetectService', () => {
  it('should detect language of French text', async () => {
    const mockClient = createMockDeepLClient({
      translate: jest.fn().mockResolvedValue({
        text: 'Hello world',
        detectedSourceLang: 'fr',
      }),
    });
    const service = new DetectService(mockClient);

    const result = await service.detect('Bonjour le monde');

    expect(result.detectedLanguage).toBe('fr');
    expect(result.languageName).toBe('French');
  });

  it('should detect language of German text', async () => {
    const mockClient = createMockDeepLClient({
      translate: jest.fn().mockResolvedValue({
        text: 'Hello world',
        detectedSourceLang: 'de',
      }),
    });
    const service = new DetectService(mockClient);

    const result = await service.detect('Hallo Welt');

    expect(result.detectedLanguage).toBe('de');
    expect(result.languageName).toBe('German');
  });

  it('should call translate API with target_lang EN', async () => {
    const mockClient = createMockDeepLClient({
      translate: jest.fn().mockResolvedValue({
        text: 'Hello',
        detectedSourceLang: 'fr',
      }),
    });
    const service = new DetectService(mockClient);

    await service.detect('Bonjour');

    expect(mockClient.translate).toHaveBeenCalledWith('Bonjour', {
      targetLang: 'en',
    });
  });

  it('should throw error for empty text', async () => {
    const mockClient = createMockDeepLClient();
    const service = new DetectService(mockClient);

    await expect(service.detect('')).rejects.toThrow('Text cannot be empty');
  });

  it('should throw error for whitespace-only text', async () => {
    const mockClient = createMockDeepLClient();
    const service = new DetectService(mockClient);

    await expect(service.detect('   ')).rejects.toThrow('Text cannot be empty');
  });

  it('should throw error when API returns no detected language', async () => {
    const mockClient = createMockDeepLClient({
      translate: jest.fn().mockResolvedValue({
        text: 'test',
        detectedSourceLang: undefined,
      }),
    });
    const service = new DetectService(mockClient);

    await expect(service.detect('x')).rejects.toThrow('Could not detect source language');
  });

  it('should propagate API errors', async () => {
    const mockClient = createMockDeepLClient({
      translate: jest.fn().mockRejectedValue(new Error('API error')),
    });
    const service = new DetectService(mockClient);

    await expect(service.detect('Bonjour')).rejects.toThrow('API error');
  });

  it('should return language code as name when not in registry', async () => {
    const mockClient = createMockDeepLClient({
      translate: jest.fn().mockResolvedValue({
        text: 'test',
        detectedSourceLang: 'xx' as any,
      }),
    });
    const service = new DetectService(mockClient);

    const result = await service.detect('Some text');

    expect(result.detectedLanguage).toBe('xx');
    expect(result.languageName).toBe('XX');
  });
});
