import { HttpClient, DeepLClientOptions } from './http-client.js';
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

interface CustomInstructionWireShape {
  label: string;
  prompt: string;
  source_language?: string;
}

function mapCustomInstruction(wire: CustomInstructionWireShape): CustomInstruction {
  return {
    label: wire.label,
    prompt: wire.prompt,
    ...(wire.source_language !== undefined && { sourceLanguage: wire.source_language }),
  };
}

interface StyleRuleWireShape {
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
}

function mapStyleRule(wire: StyleRuleWireShape): StyleRule {
  return {
    styleId: wire.style_id,
    name: wire.name,
    language: wire.language,
    version: wire.version,
    creationTime: wire.creation_time,
    updatedTime: wire.updated_time,
  };
}

function mapStyleRuleDetailed(wire: StyleRuleWireShape): StyleRuleDetailed {
  return {
    ...mapStyleRule(wire),
    configuredRules: wire.configured_rules ?? [],
    customInstructions: (wire.custom_instructions ?? []).map(ci => ({
      label: ci.label,
      prompt: ci.prompt,
      ...(ci.source_language && { sourceLanguage: ci.source_language }),
    })),
  };
}

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

  async createStyleRule(options: CreateStyleRuleOptions): Promise<StyleRule> {
    const body: Record<string, unknown> = {
      name: options.name,
      language: options.language,
    };
    if (options.configuredRules !== undefined) {
      body['configured_rules'] = options.configuredRules;
    }
    if (options.customInstructions !== undefined) {
      body['custom_instructions'] = options.customInstructions.map(ci => ({
        label: ci.label,
        prompt: ci.prompt,
        ...(ci.sourceLanguage && { source_language: ci.sourceLanguage }),
      }));
    }
    const wire = await this.makeJsonRequest<StyleRuleWireShape>(
      'POST',
      '/v3/style_rules',
      body,
    );
    return mapStyleRule(wire);
  }

  async getStyleRule(styleId: string, detailed = false): Promise<StyleRule | StyleRuleDetailed> {
    const params: Record<string, string | number | boolean> = {};
    if (detailed) {
      params['detailed'] = true;
    }
    const wire = await this.makeJsonRequest<StyleRuleWireShape>(
      'GET',
      `/v3/style_rules/${encodeURIComponent(styleId)}`,
      undefined,
      params,
    );
    return detailed ? mapStyleRuleDetailed(wire) : mapStyleRule(wire);
  }

  async updateStyleRule(styleId: string, options: UpdateStyleRuleOptions): Promise<StyleRule> {
    const body: Record<string, unknown> = {};
    if (options.name !== undefined) {
      body['name'] = options.name;
    }
    if (options.configuredRules !== undefined) {
      body['configured_rules'] = options.configuredRules;
    }
    if (options.customInstructions !== undefined) {
      body['custom_instructions'] = options.customInstructions.map(ci => ({
        label: ci.label,
        prompt: ci.prompt,
        ...(ci.sourceLanguage && { source_language: ci.sourceLanguage }),
      }));
    }
    const wire = await this.makeJsonRequest<StyleRuleWireShape>(
      'PATCH',
      `/v3/style_rules/${encodeURIComponent(styleId)}`,
      body,
    );
    return mapStyleRule(wire);
  }

  async deleteStyleRule(styleId: string): Promise<void> {
    await this.makeJsonRequest<void>(
      'DELETE',
      `/v3/style_rules/${encodeURIComponent(styleId)}`,
    );
  }

  async replaceConfiguredRules(styleId: string, rules: string[]): Promise<StyleRuleDetailed> {
    const wire = await this.makeJsonRequest<StyleRuleWireShape>(
      'PUT',
      `/v3/style_rules/${encodeURIComponent(styleId)}/configured_rules`,
      { configured_rules: rules },
    );
    return mapStyleRuleDetailed(wire);
  }

  async createCustomInstruction(
    styleId: string,
    options: CreateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    const body: Record<string, unknown> = {
      label: options.label,
      prompt: options.prompt,
    };
    if (options.sourceLanguage !== undefined) {
      body['source_language'] = options.sourceLanguage;
    }
    const wire = await this.makeJsonRequest<CustomInstructionWireShape>(
      'POST',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions`,
      body,
    );
    return mapCustomInstruction(wire);
  }

  async getCustomInstruction(styleId: string, label: string): Promise<CustomInstruction> {
    const wire = await this.makeJsonRequest<CustomInstructionWireShape>(
      'GET',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions/${encodeURIComponent(label)}`,
    );
    return mapCustomInstruction(wire);
  }

  async updateCustomInstruction(
    styleId: string,
    label: string,
    options: UpdateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    const body: Record<string, unknown> = {};
    if (options.prompt !== undefined) {
      body['prompt'] = options.prompt;
    }
    if (options.sourceLanguage !== undefined) {
      body['source_language'] = options.sourceLanguage;
    }
    const wire = await this.makeJsonRequest<CustomInstructionWireShape>(
      'PUT',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions/${encodeURIComponent(label)}`,
      body,
    );
    return mapCustomInstruction(wire);
  }

  async deleteCustomInstruction(styleId: string, label: string): Promise<void> {
    await this.makeJsonRequest<void>(
      'DELETE',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions/${encodeURIComponent(label)}`,
    );
  }
}
