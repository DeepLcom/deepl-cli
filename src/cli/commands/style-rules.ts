/**
 * Style Rules Command
 * Handles listing and displaying DeepL style rules
 */

import type { StyleRulesService } from '../../services/style-rules.js';
import {
  StyleRule,
  StyleRuleDetailed,
  StyleRulesListOptions,
  CreateStyleRuleOptions,
  UpdateStyleRuleOptions,
  CustomInstruction,
  CreateCustomInstructionOptions,
  UpdateCustomInstructionOptions,
} from '../../types/index.js';
import { sanitizeForTerminal } from '../../utils/control-chars.js';

/**
 * Manages DeepL style rules for controlling translation tone and style.
 * Style rules can be applied to translations via their style ID.
 */
export class StyleRulesCommand {
  private service: StyleRulesService;

  constructor(service: StyleRulesService) {
    this.service = service;
  }

  /**
   * List available style rules, optionally filtered by language.
   * Returns detailed rules (with configuredRules/customInstructions) when requested.
   */
  async list(options: StyleRulesListOptions = {}): Promise<(StyleRule | StyleRuleDetailed)[]> {
    return this.service.getStyleRules(options);
  }

  /** Format style rules for human-readable terminal output. */
  formatStyleRulesList(rules: (StyleRule | StyleRuleDetailed)[]): string {
    if (rules.length === 0) {
      return 'No style rules found.';
    }

    const lines: string[] = [];
    lines.push(`Found ${rules.length} style rule(s):\n`);

    for (const rule of rules) {
      lines.push(`  ${sanitizeForTerminal(rule.name)}`);
      lines.push(`    ID:       ${rule.styleId}`);
      lines.push(`    Language: ${rule.language}`);
      lines.push(`    Version:  ${rule.version}`);
      lines.push(`    Created:  ${rule.creationTime}`);
      lines.push(`    Updated:  ${rule.updatedTime}`);

      if ('configuredRules' in rule) {
        const detailed = rule;
        if (detailed.configuredRules.length > 0) {
          lines.push(`    Rules:    ${detailed.configuredRules.join(', ')}`);
        }
        if (detailed.customInstructions.length > 0) {
          lines.push(`    Custom Instructions:`);
          for (const instruction of detailed.customInstructions) {
            const langSuffix = instruction.sourceLanguage ? ` [${instruction.sourceLanguage}]` : '';
            lines.push(`      - ${sanitizeForTerminal(instruction.label)}: ${sanitizeForTerminal(instruction.prompt)}${langSuffix}`);
          }
        }
      }

      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  /** Serialize style rules as pretty-printed JSON. */
  formatStyleRulesJson(rules: (StyleRule | StyleRuleDetailed)[]): string {
    return JSON.stringify(rules, null, 2);
  }

  async create(options: CreateStyleRuleOptions): Promise<StyleRule> {
    return this.service.createStyleRule(options);
  }

  async show(styleId: string, detailed = false): Promise<StyleRule | StyleRuleDetailed> {
    return this.service.getStyleRule(styleId, detailed);
  }

  async update(styleId: string, options: UpdateStyleRuleOptions): Promise<StyleRule> {
    return this.service.updateStyleRule(styleId, options);
  }

  async delete(styleId: string): Promise<void> {
    return this.service.deleteStyleRule(styleId);
  }

  async replaceRules(styleId: string, rules: string[]): Promise<StyleRuleDetailed> {
    return this.service.replaceConfiguredRules(styleId, rules);
  }

  /** Format a single style rule for human-readable terminal output. */
  formatStyleRule(rule: StyleRule | StyleRuleDetailed): string {
    const lines: string[] = [];
    lines.push(`  ${sanitizeForTerminal(rule.name)}`);
    lines.push(`    ID:       ${rule.styleId}`);
    lines.push(`    Language: ${rule.language}`);
    lines.push(`    Version:  ${rule.version}`);
    lines.push(`    Created:  ${rule.creationTime}`);
    lines.push(`    Updated:  ${rule.updatedTime}`);

    if ('configuredRules' in rule) {
      if (rule.configuredRules.length > 0) {
        lines.push(`    Rules:    ${rule.configuredRules.join(', ')}`);
      }
      if (rule.customInstructions.length > 0) {
        lines.push(`    Custom Instructions:`);
        for (const instruction of rule.customInstructions) {
          const langSuffix = instruction.sourceLanguage ? ` [${instruction.sourceLanguage}]` : '';
          lines.push(`      - ${sanitizeForTerminal(instruction.label)}: ${sanitizeForTerminal(instruction.prompt)}${langSuffix}`);
        }
      }
    }

    return lines.join('\n');
  }

  /** Serialize a single style rule as pretty-printed JSON. */
  formatStyleRuleJson(rule: StyleRule | StyleRuleDetailed): string {
    return JSON.stringify(rule, null, 2);
  }

  async listInstructions(styleId: string): Promise<CustomInstruction[]> {
    const rule = await this.service.getStyleRule(styleId, true);
    return 'customInstructions' in rule ? rule.customInstructions : [];
  }

  async addInstruction(
    styleId: string,
    options: CreateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    return this.service.createCustomInstruction(styleId, options);
  }

  async updateInstruction(
    styleId: string,
    label: string,
    options: UpdateCustomInstructionOptions,
  ): Promise<CustomInstruction> {
    return this.service.updateCustomInstruction(styleId, label, options);
  }

  async removeInstruction(styleId: string, label: string): Promise<void> {
    return this.service.deleteCustomInstruction(styleId, label);
  }

  /** Format a single custom instruction for human-readable terminal output. */
  formatCustomInstruction(instruction: CustomInstruction): string {
    const langSuffix = instruction.sourceLanguage ? ` [${instruction.sourceLanguage}]` : '';
    return `  ${sanitizeForTerminal(instruction.label)}${langSuffix}\n    ${sanitizeForTerminal(instruction.prompt)}`;
  }

  /** Format a list of custom instructions for human-readable terminal output. */
  formatCustomInstructionsList(instructions: CustomInstruction[]): string {
    if (instructions.length === 0) {
      return 'No custom instructions found.';
    }
    const lines: string[] = [`Found ${instructions.length} custom instruction(s):`, ''];
    for (const instruction of instructions) {
      lines.push(this.formatCustomInstruction(instruction));
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  /** Serialize a custom instruction or list as pretty-printed JSON. */
  formatCustomInstructionJson(data: CustomInstruction | CustomInstruction[]): string {
    return JSON.stringify(data, null, 2);
  }
}
