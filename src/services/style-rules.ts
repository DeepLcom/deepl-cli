import { DeepLClient } from '../api/deepl-client.js';
import {
  StyleRule,
  StyleRuleDetailed,
  StyleRulesListOptions,
  CreateStyleRuleOptions,
  UpdateStyleRuleOptions,
} from '../types/index.js';

export class StyleRulesService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    this.client = client;
  }

  async getStyleRules(options: StyleRulesListOptions = {}): Promise<(StyleRule | StyleRuleDetailed)[]> {
    return this.client.getStyleRules(options);
  }

  async createStyleRule(options: CreateStyleRuleOptions): Promise<StyleRule> {
    return this.client.createStyleRule(options);
  }

  async getStyleRule(styleId: string, detailed = false): Promise<StyleRule | StyleRuleDetailed> {
    return this.client.getStyleRule(styleId, detailed);
  }

  async updateStyleRule(styleId: string, options: UpdateStyleRuleOptions): Promise<StyleRule> {
    return this.client.updateStyleRule(styleId, options);
  }

  async deleteStyleRule(styleId: string): Promise<void> {
    return this.client.deleteStyleRule(styleId);
  }

  async replaceConfiguredRules(styleId: string, rules: string[]): Promise<StyleRuleDetailed> {
    return this.client.replaceConfiguredRules(styleId, rules);
  }
}
