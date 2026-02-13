/**
 * Style Rules Command
 * Handles listing and displaying DeepL style rules
 */

import type { StyleRulesService } from '../../services/style-rules.js';
import { StyleRule, StyleRuleDetailed, StyleRulesListOptions } from '../../types/index.js';

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
      lines.push(`  ${rule.name}`);
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
            lines.push(`      - ${instruction.label}: ${instruction.prompt}${langSuffix}`);
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
}
