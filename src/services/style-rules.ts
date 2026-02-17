import { DeepLClient } from '../api/deepl-client.js';
import { StyleRule, StyleRuleDetailed, StyleRulesListOptions } from '../types/index.js';

export class StyleRulesService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async getStyleRules(options: StyleRulesListOptions = {}): Promise<(StyleRule | StyleRuleDetailed)[]> {
    return this.client.getStyleRules(options);
  }
}
