import { LanguagesService } from '../../src/services/languages';
import { createMockDeepLClient } from '../helpers/mock-factories';

jest.mock('../../src/api/deepl-client');

describe('LanguagesService', () => {
  it('should delegate getSupportedLanguages to client', async () => {
    const mockLangs = [
      { language: 'en', name: 'English' },
      { language: 'de', name: 'German' },
    ];
    const mockClient = createMockDeepLClient({
      getSupportedLanguages: jest.fn().mockResolvedValue(mockLangs),
    });
    const service = new LanguagesService(mockClient);

    const result = await service.getSupportedLanguages('source');

    expect(mockClient.getSupportedLanguages).toHaveBeenCalledWith('source');
    expect(result).toEqual(mockLangs);
  });

  it('should pass type parameter correctly', async () => {
    const mockClient = createMockDeepLClient();
    const service = new LanguagesService(mockClient);

    await service.getSupportedLanguages('target');

    expect(mockClient.getSupportedLanguages).toHaveBeenCalledWith('target');
  });

  it('should return empty array when client is null', async () => {
    const service = new LanguagesService(null);

    const result = await service.getSupportedLanguages('source');

    expect(result).toEqual([]);
  });

  it('should propagate errors from client', async () => {
    const mockClient = createMockDeepLClient({
      getSupportedLanguages: jest.fn().mockRejectedValue(new Error('API error')),
    });
    const service = new LanguagesService(mockClient);

    await expect(service.getSupportedLanguages('source')).rejects.toThrow('API error');
  });

  it('should report hasClient correctly', () => {
    const mockClient = createMockDeepLClient();

    expect(new LanguagesService(mockClient).hasClient()).toBe(true);
    expect(new LanguagesService(null).hasClient()).toBe(false);
  });
});
