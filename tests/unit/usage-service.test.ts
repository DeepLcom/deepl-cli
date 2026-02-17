import { UsageService } from '../../src/services/usage';
import { createMockDeepLClient } from '../helpers/mock-factories';

jest.mock('../../src/api/deepl-client');

describe('UsageService', () => {
  it('should delegate getUsage to client', async () => {
    const mockClient = createMockDeepLClient({
      getUsage: jest.fn().mockResolvedValue({
        characterCount: 123456,
        characterLimit: 500000,
      }),
    });
    const service = new UsageService(mockClient);

    const result = await service.getUsage();

    expect(mockClient.getUsage).toHaveBeenCalled();
    expect(result).toEqual({
      characterCount: 123456,
      characterLimit: 500000,
    });
  });

  it('should propagate errors from client', async () => {
    const mockClient = createMockDeepLClient({
      getUsage: jest.fn().mockRejectedValue(new Error('API error')),
    });
    const service = new UsageService(mockClient);

    await expect(service.getUsage()).rejects.toThrow('API error');
  });

  it('should handle zero usage', async () => {
    const mockClient = createMockDeepLClient({
      getUsage: jest.fn().mockResolvedValue({
        characterCount: 0,
        characterLimit: 0,
      }),
    });
    const service = new UsageService(mockClient);

    const result = await service.getUsage();
    expect(result.characterCount).toBe(0);
    expect(result.characterLimit).toBe(0);
  });
});
