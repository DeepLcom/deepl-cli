import { DeepLClient } from '../api/deepl-client.js';
import {
  StyleRule,
  StyleRuleDetailed,
  StyleRulesListOptions,
  CreateStyleRuleOptions,
  UpdateStyleRuleOptions,
  CustomInstruction,
  CreateCustomInstructionOptions,
  UpdateCustomInstructionOptions,
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

  async createCustomInstruction(
    styleId: string,
    options: CreateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    return this.client.createCustomInstruction(styleId, options);
  }

  async getCustomInstruction(styleId: string, label: string): Promise<CustomInstruction> {
    return this.client.getCustomInstruction(styleId, label);
  }

  async updateCustomInstruction(
    styleId: string,
    label: string,
    options: UpdateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    return this.client.updateCustomInstruction(styleId, label, options);
  }

  async deleteCustomInstruction(styleId: string, label: string): Promise<void> {
    return this.client.deleteCustomInstruction(styleId, label);
  }
}
