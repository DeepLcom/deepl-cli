import { HttpClient, DeepLClientOptions } from './http-client.js';
import {
  StyleRule,
  StyleRuleDetailed,
  StyleRulesListOptions,
  CreateStyleRuleOptions,
  UpdateStyleRuleOptions,
  CustomInstruction,
  ConfiguredRules,
  CreateCustomInstructionOptions,
  UpdateCustomInstructionOptions,
} from '../types/index.js';
import { ValidationError } from '../utils/errors.js';

interface CustomInstructionWireShape {
  id?: string;
  label: string;
  prompt: string;
  source_language?: string;
}

function mapCustomInstruction(wire: CustomInstructionWireShape): CustomInstruction {
  return {
    ...(wire.id !== undefined && { id: wire.id }),
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
  configured_rules?: ConfiguredRules;
  custom_instructions?: CustomInstructionWireShape[];
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
    configuredRules: wire.configured_rules ?? {},
    customInstructions: (wire.custom_instructions ?? []).map(mapCustomInstruction),
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
      style_rules: StyleRuleWireShape[];
    }>('GET', '/v3/style_rules', params);

    return response.style_rules.map((rule) =>
      options.detailed ? mapStyleRuleDetailed(rule) : mapStyleRule(rule),
    );
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

  async replaceConfiguredRules(styleId: string, rules: ConfiguredRules): Promise<StyleRuleDetailed> {
    // The PUT endpoint at /configured_rules takes the rules dict as the entire body
    // (no `configured_rules` outer wrapper). The wrapper is only used on POST /v3/style_rules
    // and PATCH /v3/style_rules/{id} where the body has multiple top-level fields.
    const wire = await this.makeJsonRequest<StyleRuleWireShape>(
      'PUT',
      `/v3/style_rules/${encodeURIComponent(styleId)}/configured_rules`,
      rules,
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

  /**
   * Resolve a custom-instruction's server-assigned id from its user-facing label.
   * The DeepL API's per-instruction endpoints (`GET`/`PUT`/`DELETE`
   * `/custom_instructions/{instruction_id}`) take the UUID, but users address
   * instructions by label. This helper does the lookup via a detailed
   * `getStyleRule`. Throws ValidationError if no instruction with that label exists.
   */
  private async resolveInstructionId(styleId: string, label: string): Promise<string> {
    const detailed = await this.getStyleRule(styleId, true) as StyleRuleDetailed;
    const found = detailed.customInstructions.find(ci => ci.label === label);
    if (!found?.id) {
      throw new ValidationError(
        `No custom instruction with label "${label}" found on style rule ${styleId}.`,
      );
    }
    return found.id;
  }

  async getCustomInstruction(styleId: string, label: string): Promise<CustomInstruction> {
    const instructionId = await this.resolveInstructionId(styleId, label);
    const wire = await this.makeJsonRequest<CustomInstructionWireShape>(
      'GET',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions/${encodeURIComponent(instructionId)}`,
    );
    return mapCustomInstruction(wire);
  }

  async updateCustomInstruction(
    styleId: string,
    label: string,
    options: UpdateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    const instructionId = await this.resolveInstructionId(styleId, label);
    // The PUT body requires `label` even though `instruction_id` appears in the URL path.
    const body: Record<string, unknown> = { label };
    if (options.prompt !== undefined) {
      body['prompt'] = options.prompt;
    }
    if (options.sourceLanguage !== undefined) {
      body['source_language'] = options.sourceLanguage;
    }
    const wire = await this.makeJsonRequest<CustomInstructionWireShape>(
      'PUT',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions/${encodeURIComponent(instructionId)}`,
      body,
    );
    return mapCustomInstruction(wire);
  }

  async deleteCustomInstruction(styleId: string, label: string): Promise<void> {
    const instructionId = await this.resolveInstructionId(styleId, label);
    await this.makeJsonRequest<void>(
      'DELETE',
      `/v3/style_rules/${encodeURIComponent(styleId)}/custom_instructions/${encodeURIComponent(instructionId)}`,
    );
  }
}
