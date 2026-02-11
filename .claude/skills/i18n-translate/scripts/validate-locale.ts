import * as path from 'path';
import { parseLocaleFile } from './lib/parse-locale-file.js';
import { flattenStrings, pathSetDiff, pathToDisplayString, getByPath } from './lib/flatten-keys.js';
import type { ValidationResult, ValidationIssue } from './lib/types.js';

export type FrameworkName = 'i18next' | 'angular' | 'rails' | 'vue-i18n' | 'react-intl' | 'next-intl' | 'flutter' | 'generic';

export function getVariablePatterns(framework: FrameworkName): RegExp[] {
  switch (framework) {
    case 'i18next':
    case 'angular':
      return [/\{\{[a-zA-Z0-9_]+\}\}/g];
    case 'rails':
      return [/%\{[a-zA-Z0-9_]+\}/g, /%<[a-zA-Z0-9_]+>[a-z]/g];
    case 'vue-i18n':
      return [/\{[a-zA-Z0-9_]+\}/g, /@:[a-zA-Z0-9_.]+/g];
    case 'react-intl':
    case 'next-intl':
    case 'flutter':
      return [/\{[a-zA-Z0-9_]+\}/g];
    case 'generic':
    default:
      return [/\{[a-zA-Z0-9_]+\}/g, /\$\{[a-zA-Z0-9_]+\}/g, /%[sd]/g];
  }
}

function extractVariables(value: string, patterns: RegExp[]): string[] {
  const vars: string[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      vars.push(match[0]);
    }
  }
  return vars.sort();
}

const PLACEHOLDER_PATTERN = /__INTL_[0-9a-f]+__/;

export function validateLocale(
  sourceData: Record<string, unknown>,
  translatedData: Record<string, unknown>,
  framework?: FrameworkName
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fw: FrameworkName = framework ?? 'generic';

  const sourceEntries = flattenStrings(sourceData);
  const translatedEntries = flattenStrings(translatedData);

  const sourcePaths = sourceEntries.map(e => e.path);
  const translatedPaths = translatedEntries.map(e => e.path);

  // Check 2: Key structure match
  const missing = pathSetDiff(sourcePaths, translatedPaths);
  for (const p of missing) {
    issues.push({
      check: 'key-structure',
      severity: 'error',
      message: `Missing key: ${pathToDisplayString(p)}`,
      path: p,
    });
  }

  const extra = pathSetDiff(translatedPaths, sourcePaths);
  for (const p of extra) {
    issues.push({
      check: 'key-structure',
      severity: 'warning',
      message: `Extra key: ${pathToDisplayString(p)}`,
      path: p,
    });
  }

  // Check 3: No placeholder residue
  for (const entry of translatedEntries) {
    if (PLACEHOLDER_PATTERN.test(entry.value)) {
      issues.push({
        check: 'placeholder-residue',
        severity: 'error',
        message: `Unreplaced placeholder in ${entry.dotPath}: ${entry.value}`,
        path: entry.path,
      });
    }
  }

  // Check 4: Variable preservation
  const patterns = getVariablePatterns(fw);
  for (const sourceEntry of sourceEntries) {
    const translatedValue = getByPath(translatedData, sourceEntry.path);
    if (typeof translatedValue !== 'string') continue;

    const sourceVars = extractVariables(sourceEntry.value, patterns);
    const translatedVars = extractVariables(translatedValue, patterns);

    const sourceVarStr = JSON.stringify(sourceVars);
    const translatedVarStr = JSON.stringify(translatedVars);

    if (sourceVarStr !== translatedVarStr) {
      const missingVars = sourceVars.filter(v => !translatedVars.includes(v));
      const extraVars = translatedVars.filter(v => !sourceVars.includes(v));
      const details: string[] = [];
      if (missingVars.length) details.push(`missing: ${missingVars.join(', ')}`);
      if (extraVars.length) details.push(`extra: ${extraVars.join(', ')}`);
      issues.push({
        check: 'variable-preservation',
        severity: 'error',
        message: `Variable mismatch in ${sourceEntry.dotPath}: ${details.join('; ')}`,
        path: sourceEntry.path,
      });
    }
  }

  // Check 5: Untranslated values
  let identicalCount = 0;
  let totalCount = 0;
  for (const sourceEntry of sourceEntries) {
    const translatedValue = getByPath(translatedData, sourceEntry.path);
    if (typeof translatedValue !== 'string') continue;
    totalCount++;
    if (sourceEntry.value === translatedValue) {
      identicalCount++;
    }
  }
  if (identicalCount > 0 && totalCount > 0) {
    issues.push({
      check: 'untranslated',
      severity: 'warning',
      message: `${identicalCount}/${totalCount} values identical to source`,
    });
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
}

function formatText(result: ValidationResult): string {
  const lines: string[] = [];

  const missingKeys = result.issues.filter(i => i.check === 'key-structure' && i.severity === 'error');
  const extraKeys = result.issues.filter(i => i.check === 'key-structure' && i.severity === 'warning');
  const placeholders = result.issues.filter(i => i.check === 'placeholder-residue');
  const varMismatches = result.issues.filter(i => i.check === 'variable-preservation');
  const untranslated = result.issues.filter(i => i.check === 'untranslated');

  if (missingKeys.length === 0 && extraKeys.length === 0) {
    lines.push('Checking: Key structure... OK');
  } else {
    const parts: string[] = [];
    if (missingKeys.length > 0) parts.push(`${missingKeys.length} missing keys`);
    if (extraKeys.length > 0) parts.push(`${extraKeys.length} extra keys`);
    lines.push(`Checking: Key structure... ${missingKeys.length > 0 ? 'FAIL' : 'WARN'}: ${parts.join(', ')}`);
  }

  if (placeholders.length === 0) {
    lines.push('Checking: No placeholder residue... OK');
  } else {
    lines.push(`Checking: No placeholder residue... FAIL: ${placeholders.length} unreplaced placeholders`);
  }

  if (varMismatches.length === 0) {
    lines.push('Checking: Variable preservation... OK');
  } else {
    lines.push(`Checking: Variable preservation... FAIL: ${varMismatches.length} variable mismatches`);
  }

  if (untranslated.length === 0) {
    lines.push('Checking: Untranslated values... OK');
  } else {
    lines.push(`Checking: Untranslated values... WARN: ${untranslated[0]!.message}`);
  }

  const errorCount = result.issues.filter(i => i.severity === 'error').length;
  if (errorCount === 0) {
    lines.push('RESULT: PASS');
  } else {
    lines.push(`RESULT: FAIL (${errorCount} errors found)`);
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let sourcePath: string | undefined;
  let translatedPath: string | undefined;
  let framework: FrameworkName | undefined;
  let format: 'json' | 'text' = 'text';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--framework' && args[i + 1]) {
      framework = args[++i] as FrameworkName;
    } else if (arg === '--format' && args[i + 1]) {
      format = args[++i] as 'json' | 'text';
    } else if (!sourcePath) {
      sourcePath = arg;
    } else if (!translatedPath) {
      translatedPath = arg;
    }
  }

  if (!sourcePath || !translatedPath) {
    console.error('Usage: validate-locale <source> <translated> [--framework <name>] [--format json|text]');
    process.exit(2);
  }

  try {
    const sourceFile = await parseLocaleFile(path.resolve(sourcePath));
    const translatedFile = await parseLocaleFile(path.resolve(translatedPath));

    const result = validateLocale(sourceFile.data, translatedFile.data, framework);

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatText(result));
    }

    process.exit(result.valid ? 0 : 1);
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(2);
  }
}

const isDirectRun = process.argv[1]?.endsWith('validate-locale.ts') || process.argv[1]?.endsWith('validate-locale.js');
if (isDirectRun) {
  main();
}
