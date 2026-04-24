import { StyleRulesService } from '../../src/services/style-rules';
import { createMockDeepLClient } from '../helpers/mock-factories';
import { StyleRule } from '../../src/types/api';

jest.mock('../../src/api/deepl-client');

describe('StyleRulesService', () => {
  it('should delegate getStyleRules with default options', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);

    await service.getStyleRules();
    expect(mockClient.getStyleRules).toHaveBeenCalledWith({});
  });

  it('should pass options through to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);

    await service.getStyleRules({ detailed: true, page: 2, pageSize: 10 });
    expect(mockClient.getStyleRules).toHaveBeenCalledWith({ detailed: true, page: 2, pageSize: 10 });
  });

  it('should return rules from client', async () => {
    const mockRules: StyleRule[] = [
      {
        styleId: 'uuid-1',
        name: 'Style 1',
        language: 'en',
        version: 1,
        creationTime: '2024-01-01T00:00:00Z',
        updatedTime: '2024-01-02T00:00:00Z',
      },
    ];
    const mockClient = createMockDeepLClient({
      getStyleRules: jest.fn().mockResolvedValue(mockRules),
    });
    const service = new StyleRulesService(mockClient);

    const result = await service.getStyleRules();
    expect(result).toEqual(mockRules);
  });

  it('should propagate errors from client', async () => {
    const mockClient = createMockDeepLClient({
      getStyleRules: jest.fn().mockRejectedValue(new Error('Forbidden')),
    });
    const service = new StyleRulesService(mockClient);

    await expect(service.getStyleRules()).rejects.toThrow('Forbidden');
  });

  it('should delegate createStyleRule to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);
    await service.createStyleRule({ name: 'X', language: 'en' });
    expect(mockClient.createStyleRule).toHaveBeenCalledWith({ name: 'X', language: 'en' });
  });

  it('should delegate getStyleRule with detailed flag', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);
    await service.getStyleRule('sr-1', true);
    expect(mockClient.getStyleRule).toHaveBeenCalledWith('sr-1', true);
  });

  it('should delegate getStyleRule with default detailed=false', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);
    await service.getStyleRule('sr-1');
    expect(mockClient.getStyleRule).toHaveBeenCalledWith('sr-1', false);
  });

  it('should delegate updateStyleRule to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);
    await service.updateStyleRule('sr-1', { name: 'Renamed' });
    expect(mockClient.updateStyleRule).toHaveBeenCalledWith('sr-1', { name: 'Renamed' });
  });

  it('should delegate deleteStyleRule to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);
    await service.deleteStyleRule('sr-1');
    expect(mockClient.deleteStyleRule).toHaveBeenCalledWith('sr-1');
  });

  it('should delegate replaceConfiguredRules to client', async () => {
    const mockClient = createMockDeepLClient();
    const service = new StyleRulesService(mockClient);
    await service.replaceConfiguredRules('sr-1', ['r1', 'r2']);
    expect(mockClient.replaceConfiguredRules).toHaveBeenCalledWith('sr-1', ['r1', 'r2']);
  });
});
