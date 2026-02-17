import { HttpClient, DeepLClientOptions } from './http-client.js';
import { StyleRule, StyleRuleDetailed, StyleRulesListOptions } from '../types';

export class StyleRulesClient extends HttpClient {
  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    super(apiKey, options);
  }

  async getStyleRules(
    options: StyleRulesListOptions = {}
  ): Promise<(StyleRule | StyleRuleDetailed)[]> {
    const params: Record<string, string | number | boolean> = {};

    if (options.detailed) {
      params['detailed'] = true;
    }

    if (options.page !== undefined) {
      params['page'] = options.page;
    }

    if (options.pageSize !== undefined) {
      params['page_size'] = options.pageSize;
    }

    const response = await this.makeJsonRequest<{
      style_rules: Array<{
        style_id: string;
        name: string;
        language: string;
        version: number;
        creation_time: string;
        updated_time: string;
        configured_rules?: string[];
        custom_instructions?: Array<{
          label: string;
          prompt: string;
          source_language?: string;
        }>;
      }>;
    }>('GET', '/v3/style_rules', params);

    return response.style_rules.map((rule) => {
      const base: StyleRule = {
        styleId: rule.style_id,
        name: rule.name,
        language: rule.language,
        version: rule.version,
        creationTime: rule.creation_time,
        updatedTime: rule.updated_time,
      };

      if (options.detailed && rule.configured_rules && rule.custom_instructions) {
        return {
          ...base,
          configuredRules: rule.configured_rules,
          customInstructions: rule.custom_instructions.map(ci => ({
            label: ci.label,
            prompt: ci.prompt,
            ...(ci.source_language && { sourceLanguage: ci.source_language }),
          })),
        } as StyleRuleDetailed;
      }

      return base;
    });
  }
}
