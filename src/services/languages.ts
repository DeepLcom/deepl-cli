import { DeepLClient, LanguageInfo } from '../api/deepl-client.js';

export class LanguagesService {
  private client: DeepLClient | null;

  constructor(client: DeepLClient | null) {
    this.client = client;
  }

  async getSupportedLanguages(type: 'source' | 'target'): Promise<LanguageInfo[]> {
    if (!this.client) {
      return [];
    }
    return this.client.getSupportedLanguages(type);
  }

  hasClient(): boolean {
    return this.client !== null;
  }
}
