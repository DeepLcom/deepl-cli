/**
 * Style Rules Command
 * Handles listing and displaying DeepL style rules
 */

import Table from 'cli-table3';
import type { StyleRulesService } from '../../services/style-rules.js';
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
} from '../../types/index.js';
import { sanitizeForTerminal } from '../../utils/control-chars.js';
import { isColorEnabled } from '../../utils/formatters.js';

/** Total leaf settings across all categories. Used as the "Rules" count column. */
function countConfiguredRules(rules: ConfiguredRules): number {
  return Object.values(rules).reduce((sum, group) => sum + Object.keys(group).length, 0);
}

/** Render the configured-rules dictionary as indented text lines, sanitized. */
function renderConfiguredRulesText(rules: ConfiguredRules, lines: string[]): void {
  if (countConfiguredRules(rules) === 0) {
    return;
  }
  lines.push(`    Rules:`);
  for (const [category, settings] of Object.entries(rules)) {
    lines.push(`      ${sanitizeForTerminal(category)}:`);
    for (const [key, value] of Object.entries(settings)) {
      lines.push(`        ${sanitizeForTerminal(key)}: ${sanitizeForTerminal(value)}`);
    }
  }
}

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
        renderConfiguredRulesText(detailed.configuredRules, lines);
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

  /** Format style rules as a cli-table3 table. Includes rules/instructions counts when detailed. */
  formatStyleRulesTable(rules: (StyleRule | StyleRuleDetailed)[]): string {
    if (rules.length === 0) {
      return 'No style rules found.';
    }

    const detailed = rules.some(r => 'configuredRules' in r);
    const head = detailed
      ? ['Name', 'ID', 'Language', 'Version', 'Updated', 'Rules', 'Instructions']
      : ['Name', 'ID', 'Language', 'Version', 'Updated'];
    const colWidths = detailed ? [24, 18, 10, 9, 22, 7, 14] : [30, 20, 10, 9, 22];
    const colorDisabled = !isColorEnabled();

    const table = new Table({
      head,
      colWidths,
      wordWrap: true,
      ...(colorDisabled && { style: { head: [], border: [] } }),
    });

    for (const rule of rules) {
      const row: string[] = [
        sanitizeForTerminal(rule.name),
        rule.styleId,
        rule.language,
        String(rule.version),
        rule.updatedTime,
      ];
      if (detailed) {
        if ('configuredRules' in rule) {
          row.push(String(countConfiguredRules(rule.configuredRules)));
          row.push(String(rule.customInstructions.length));
        } else {
          row.push('—');
          row.push('—');
        }
      }
      table.push(row);
    }

    return table.toString();
  }

  /** Format a list of custom instructions as a cli-table3 table. */
  formatCustomInstructionsTable(instructions: CustomInstruction[]): string {
    if (instructions.length === 0) {
      return 'No custom instructions found.';
    }

    const colorDisabled = !isColorEnabled();
    const table = new Table({
      head: ['Label', 'Prompt', 'Source'],
      colWidths: [20, 50, 10],
      wordWrap: true,
      ...(colorDisabled && { style: { head: [], border: [] } }),
    });

    for (const instruction of instructions) {
      table.push([
        sanitizeForTerminal(instruction.label),
        sanitizeForTerminal(instruction.prompt),
        instruction.sourceLanguage ?? '—',
      ]);
    }

    return table.toString();
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

  async replaceRules(styleId: string, rules: ConfiguredRules): Promise<StyleRuleDetailed> {
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
      renderConfiguredRulesText(rule.configuredRules, lines);
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
