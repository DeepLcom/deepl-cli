import * as fs from 'fs/promises';
import { parseLocaleFile, serializeLocaleFile } from './lib/parse-locale-file.js';
import { flattenStrings, setByPath, getByPath, pathToDisplayString } from './lib/flatten-keys.js';
import type { MergeResult, KeyPath } from './lib/types.js';

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as T;
  const clone = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    clone[key] = deepClone(value);
  }
  return clone as T;
}

export function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): MergeResult {
  const added: KeyPath[] = [];
  const updated: KeyPath[] = [];
  const unchanged: KeyPath[] = [];

  const merged = deepClone(base);
  const patchLeaves = flattenStrings(patch);

  for (const entry of patchLeaves) {
    const existing = getByPath(base, entry.path);

    if (existing === undefined) {
      added.push(entry.path);
      setByPath(merged, entry.path, entry.value);
    } else if (existing !== entry.value) {
      updated.push(entry.path);
      setByPath(merged, entry.path, entry.value);
    } else {
      unchanged.push(entry.path);
    }
  }

  return { merged, added, updated, unchanged };
}

function formatDryRun(result: MergeResult, base: Record<string, unknown>): string {
  const lines: string[] = [];

  if (result.added.length > 0) {
    lines.push('Would ADD:');
    for (const p of result.added) {
      const val = getByPath(result.merged, p);
      lines.push(`  + ${pathToDisplayString(p)} = ${JSON.stringify(val)}`);
    }
  }

  if (result.updated.length > 0) {
    lines.push('Would UPDATE:');
    for (const p of result.updated) {
      const oldVal = getByPath(base, p);
      const newVal = getByPath(result.merged, p);
      lines.push(`  ~ ${pathToDisplayString(p)}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
    }
  }

  lines.push(`UNCHANGED: ${result.unchanged.length} keys`);

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let basePath: string | undefined;
  let patchPath: string | undefined;
  let outputPath: string | undefined;
  let dryRun = false;

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else {
      positional.push(args[i]!);
    }
  }

  basePath = positional[0];
  patchPath = positional[1];

  if (!basePath || !patchPath) {
    console.error('Usage: deep-merge <base> <patch> [--output <path>] [--dry-run]');
    process.exit(1);
  }

  const baseParsed = await parseLocaleFile(basePath);
  const patchParsed = await parseLocaleFile(patchPath);
  const result = deepMerge(baseParsed.data, patchParsed.data);

  if (dryRun) {
    console.log(formatDryRun(result, baseParsed.data));
    return;
  }

  const outPath = outputPath ?? basePath;
  const output = serializeLocaleFile({
    ...baseParsed,
    data: result.merged,
    filePath: outPath,
  });

  await fs.writeFile(outPath, output, 'utf-8');

  console.log(`Merged: ${result.added.length} added, ${result.updated.length} updated, ${result.unchanged.length} unchanged`);
}

const isDirectRun = process.argv[1]?.endsWith('deep-merge.ts') || process.argv[1]?.endsWith('deep-merge.js');
if (isDirectRun) {
  main().catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
