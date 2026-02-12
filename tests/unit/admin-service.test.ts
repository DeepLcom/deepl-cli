import { AdminService } from '../../src/services/admin';
import { createMockDeepLClient } from '../helpers/mock-factories';
import { AdminUsageReport } from '../../src/types/api';

jest.mock('../../src/api/deepl-client');

const emptyReport: AdminUsageReport = {
  totalUsage: {
    totalCharacters: 0,
    textTranslationCharacters: 0,
    documentTranslationCharacters: 0,
    textImprovementCharacters: 0,
    speechToTextMilliseconds: 0,
  },
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  entries: [],
};

describe('AdminService', () => {
  it('should delegate listApiKeys to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.listApiKeys();
    expect(mockClient.listApiKeys).toHaveBeenCalled();
  });

  it('should delegate createApiKey to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.createApiKey('My Key');
    expect(mockClient.createApiKey).toHaveBeenCalledWith('My Key');
  });

  it('should delegate createApiKey without label', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.createApiKey();
    expect(mockClient.createApiKey).toHaveBeenCalledWith(undefined);
  });

  it('should delegate deactivateApiKey to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.deactivateApiKey('key-1');
    expect(mockClient.deactivateApiKey).toHaveBeenCalledWith('key-1');
  });

  it('should delegate renameApiKey to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.renameApiKey('key-1', 'New Label');
    expect(mockClient.renameApiKey).toHaveBeenCalledWith('key-1', 'New Label');
  });

  it('should delegate setApiKeyLimit to client without sttLimit', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.setApiKeyLimit('key-1', 1000000);
    expect(mockClient.setApiKeyLimit).toHaveBeenCalledWith('key-1', 1000000);
  });

  it('should delegate setApiKeyLimit with null for unlimited', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.setApiKeyLimit('key-1', null);
    expect(mockClient.setApiKeyLimit).toHaveBeenCalledWith('key-1', null);
  });

  it('should use AdminClient when sttLimit is provided with getApiKeyAndOptions', async () => {
    const mockClient = createMockDeepLClient();
    const mockSetApiKeyLimit = jest.fn().mockResolvedValue(undefined);

    jest.mock('../../src/api/admin-client', () => ({
      AdminClient: jest.fn().mockImplementation(() => ({
        setApiKeyLimit: mockSetApiKeyLimit,
      })),
    }));

    const getApiKeyAndOptions = () => ({
      apiKey: 'test-key',
      options: {},
    });

    const service = new AdminService(mockClient, getApiKeyAndOptions);
    await service.setApiKeyLimit('key-1', 500000, 3600000);

    expect(mockClient.setApiKeyLimit).not.toHaveBeenCalled();
  });

  it('should fall back to client when sttLimit provided but no getApiKeyAndOptions', async () => {
    const mockClient = createMockDeepLClient();
    const service = new AdminService(mockClient);
    await service.setApiKeyLimit('key-1', 500000, 3600000);
    expect(mockClient.setApiKeyLimit).toHaveBeenCalledWith('key-1', 500000);
  });

  it('should delegate getAdminUsage to client', async () => {
    const mockClient = createMockDeepLClient({
      getAdminUsage: jest.fn().mockResolvedValue(emptyReport),
    });
    const service = new AdminService(mockClient);
    const result = await service.getAdminUsage({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      groupBy: 'key',
    });
    expect(mockClient.getAdminUsage).toHaveBeenCalledWith({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      groupBy: 'key',
    });
    expect(result).toEqual(emptyReport);
  });

  it('should propagate errors from client', async () => {
    const mockClient = createMockDeepLClient({
      listApiKeys: jest.fn().mockRejectedValue(new Error('Forbidden')),
    });
    const service = new AdminService(mockClient);
    await expect(service.listApiKeys()).rejects.toThrow('Forbidden');
  });
});
