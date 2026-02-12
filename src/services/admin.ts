import { DeepLClient } from '../api/deepl-client.js';
import type { DeepLClientOptions } from '../api/http-client.js';
import { AdminApiKey, AdminUsageOptions, AdminUsageReport } from '../types/index.js';

export type GetApiKeyAndOptions = () => { apiKey: string; options: DeepLClientOptions };

export class AdminService {
  private client: DeepLClient;
  private getApiKeyAndOptions?: GetApiKeyAndOptions;

  constructor(client: DeepLClient, getApiKeyAndOptions?: GetApiKeyAndOptions) {
    this.client = client;
    this.getApiKeyAndOptions = getApiKeyAndOptions;
  }

  async listApiKeys(): Promise<AdminApiKey[]> {
    return this.client.listApiKeys();
  }

  async createApiKey(label?: string): Promise<AdminApiKey> {
    return this.client.createApiKey(label);
  }

  async deactivateApiKey(keyId: string): Promise<void> {
    return this.client.deactivateApiKey(keyId);
  }

  async renameApiKey(keyId: string, label: string): Promise<void> {
    return this.client.renameApiKey(keyId, label);
  }

  async setApiKeyLimit(
    keyId: string,
    characters: number | null,
    sttLimit?: number | null,
  ): Promise<void> {
    if (sttLimit !== undefined && this.getApiKeyAndOptions) {
      const { apiKey, options } = this.getApiKeyAndOptions();
      const { AdminClient } = await import('../api/admin-client.js');
      const adminClient = new AdminClient(apiKey, options);
      return adminClient.setApiKeyLimit(keyId, characters, sttLimit);
    }
    return this.client.setApiKeyLimit(keyId, characters);
  }

  async getAdminUsage(options: AdminUsageOptions): Promise<AdminUsageReport> {
    return this.client.getAdminUsage(options);
  }
}
