import * as fs from 'fs';
import * as path from 'path';
import type { FormatRegistry } from '../formats/index.js';
import { validateBatch, type ValidationResult } from './translation-validator.js';
import { resolveTargetPath, assertPathWithinRoot } from './sync-utils.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import { extractTranslatable, walkBuckets } from './sync-bucket-walker.js';

export interface ValidateIssue extends ValidationResult {
  locale: string;
  file: string;
}

export interface ValidateResult {
  totalChecked: number;
  passed: number;
  warnings: number;
  errors: number;
  issues: ValidateIssue[];
}

export async function validateTranslations(
  config: ResolvedSyncConfig,
  formatRegistry: FormatRegistry,
): Promise<ValidateResult> {
  const allIssues: ValidateIssue[] = [];
  let totalChecked = 0;

  for await (const walked of walkBuckets(config, formatRegistry)) {
    const { bucketConfig, parser, relPath, content: sourceContent, entries: sourceEntries, isMultiLocale } = walked;

    for (const locale of config.target_locales) {
      let targetEntries;
      let targetRelPath: string;

      if (isMultiLocale) {
        targetRelPath = relPath;
        targetEntries = extractTranslatable(parser, sourceContent, locale);
      } else {
        targetRelPath = resolveTargetPath(relPath, config.source_locale, locale, bucketConfig.target_path_pattern);
        const targetAbsPath = path.join(config.projectRoot, targetRelPath);
        assertPathWithinRoot(targetAbsPath, config.projectRoot);

        try {
          await fs.promises.access(targetAbsPath);
        } catch {
          continue;
        }

        const targetContent = await fs.promises.readFile(targetAbsPath, 'utf-8');
        targetEntries = extractTranslatable(parser, targetContent);
      }

      const targetMap = new Map(targetEntries.map((e) => [e.key, e.value]));

      const pairs = sourceEntries
        .filter((se) => targetMap.has(se.key))
        .map((se) => ({
          key: se.key,
          source: se.value,
          translation: targetMap.get(se.key)!,
        }));

      totalChecked += pairs.length;
      const results = validateBatch(pairs);
      const issuesOnly = results.filter((r) => r.severity !== 'pass');
      allIssues.push(...issuesOnly.map((r) => ({ ...r, locale, file: targetRelPath })));
    }
  }

  const warnings = allIssues.filter((i) => i.severity === 'warn').length;
  const errors = allIssues.filter((i) => i.severity === 'error').length;
  const passed = totalChecked - allIssues.length;

  return { totalChecked, passed, warnings, errors, issues: allIssues };
}
