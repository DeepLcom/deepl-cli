import * as path from 'path';
import { resolveSyncLimits } from './types.js';
import type { FormatRegistry } from '../formats/index.js';
import {
  validateBatch,
  type ValidationResult,
} from './translation-validator.js';
import { resolveTargetPath, assertPathWithinRoot } from './sync-utils.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import {
  extractExistingTranslations,
  walkBuckets,
} from './sync-bucket-walker.js';
import {
  readTargetFile,
  unvalidatedTargetMessage,
} from './sync-target-read.js';

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
  formatRegistry: FormatRegistry
): Promise<ValidateResult> {
  const allIssues: ValidateIssue[] = [];
  let totalChecked = 0;
  // File-level issues: an unreadable target holds translations nobody checked.
  // They count toward `errors` (exit 8) but not toward `totalChecked`, so
  // `passed` keeps meaning "checked pairs with no issue".
  let unreadableTargets = 0;

  for await (const walked of walkBuckets(config, formatRegistry)) {
    const {
      bucketConfig,
      parser,
      relPath,
      content: sourceContent,
      entries: sourceEntries,
      isMultiLocale,
    } = walked;

    for (const locale of config.target_locales) {
      let targetMap: Map<string, string>;
      let targetRelPath: string;

      if (isMultiLocale) {
        targetRelPath = relPath;
        targetMap = extractExistingTranslations(parser, sourceContent, locale);
      } else {
        targetRelPath = resolveTargetPath(
          relPath,
          config.source_locale,
          locale,
          bucketConfig.target_path_pattern
        );
        const targetAbsPath = path.join(config.projectRoot, targetRelPath);
        assertPathWithinRoot(targetAbsPath, config.projectRoot);

        const read = await readTargetFile(
          parser,
          targetAbsPath,
          undefined,
          resolveSyncLimits(config).max_file_bytes
        );
        if (read.state === 'absent') {
          // A locale that has never been synced has nothing to validate.
          continue;
        }
        if (read.state === 'unusable') {
          // Skipping with a warning would let the command exit 0 over a file
          // it never validated; dying on it would leave every other locale
          // unreported. It is an error-severity issue like any other.
          unreadableTargets++;
          allIssues.push({
            key: targetRelPath,
            source: '',
            translation: '',
            severity: 'error',
            issues: [
              {
                check: 'unusable_target',
                severity: 'error',
                message: unvalidatedTargetMessage(targetRelPath, read.reason),
              },
            ],
            locale,
            file: targetRelPath,
          });
          continue;
        }
        targetMap = read.translations;
      }

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
      allIssues.push(
        ...issuesOnly.map((r) => ({ ...r, locale, file: targetRelPath }))
      );
    }
  }

  const warnings = allIssues.filter((i) => i.severity === 'warn').length;
  const errors = allIssues.filter((i) => i.severity === 'error').length;
  const passed = totalChecked - (allIssues.length - unreadableTargets);

  return { totalChecked, passed, warnings, errors, issues: allIssues };
}
