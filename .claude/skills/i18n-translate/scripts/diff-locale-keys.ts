import { parseLocaleFile } from './lib/parse-locale-file.js';
import { flattenStrings, flattenAll, pathSetDiff, pathToDisplayString } from './lib/flatten-keys.js';
import type { DiffResult, KeyPath } from './lib/types.js';

export function diffLocaleKeys(
  sourceData: Record<string, unknown>,
  targetData: Record<string, unknown>,
  stringsOnly: boolean,
): DiffResult {
  const flatten = stringsOnly ? flattenStrings : flattenAll;

  const sourceEntries = flatten(sourceData);
  const targetEntries = flatten(targetData);

  const sourcePaths = sourceEntries.map(e => e.path);
  const targetPaths = targetEntries.map(e => e.path);

  const missing = pathSetDiff(sourcePaths, targetPaths);
  const extra = pathSetDiff(targetPaths, sourcePaths);

  const empty: KeyPath[] = [];
  for (const entry of targetEntries) {
    if ('value' in entry && entry.value === '') {
      empty.push(entry.path);
    }
  }

  return { missing, extra, empty };
}

function formatText(result: DiffResult): string {
  const lines: string[] = [];

  if (result.missing.length === 0 && result.extra.length === 0 && result.empty.length === 0) {
    return 'OK: Source and target have identical key structure with no empty values.';
  }

  if (result.missing.length > 0) {
    lines.push(`MISSING (${result.missing.length} keys in source but not in target):`);
    for (const p of result.missing) {
      lines.push(`  + ${pathToDisplayString(p)}`);
    }
  }

  if (result.extra.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`EXTRA (${result.extra.length} keys in target but not in source):`);
    for (const p of result.extra) {
      lines.push(`  - ${pathToDisplayString(p)}`);
    }
  }

  if (result.empty.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`EMPTY (${result.empty.length} keys with empty values in target):`);
    for (const p of result.empty) {
      lines.push(`  ? ${pathToDisplayString(p)}`);
    }
  }

  return lines.join('\n');
}

function formatJson(result: DiffResult): string {
  return JSON.stringify({
    missing: result.missing.map(pathToDisplayString),
    extra: result.extra.map(pathToDisplayString),
    empty: result.empty.map(pathToDisplayString),
  });
}

async function main() {
  const args = process.argv.slice(2);

  let format = 'text';
  let stringsOnly = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--format' && i + 1 < args.length) {
      format = args[++i]!;
    } else if (arg === '--strings-only') {
      stringsOnly = true;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error('Usage: diff-locale-keys <source> <target> [--format json|text] [--strings-only]');
    process.exit(2);
  }

  const [sourcePath, targetPath] = positional as [string, string];

  const source = await parseLocaleFile(sourcePath);
  const target = await parseLocaleFile(targetPath);

  const result = diffLocaleKeys(source.data, target.data, stringsOnly);

  if (format === 'json') {
    console.log(formatJson(result));
  } else {
    console.log(formatText(result));
  }

  const hasMissing = result.missing.length > 0;
  process.exit(hasMissing ? 1 : 0);
}

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(2);
  });
}
