import { DeepLClient, UsageInfo } from '../api/deepl-client.js';

export class UsageService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async getUsage(): Promise<UsageInfo> {
    return this.client.getUsage();
  }
}
