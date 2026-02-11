import * as fs from 'fs/promises';
import * as path from 'path';
import type { I18nProjectConfig } from './types.js';

const CONFIG_FILENAME = '.deepl-i18n.json';

export function getConfigPath(root?: string): string {
  return path.resolve(root ?? process.cwd(), CONFIG_FILENAME);
}

export async function loadProjectConfig(root?: string): Promise<I18nProjectConfig | null> {
  const configPath = getConfigPath(root);

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }

  if (!validateConfig(parsed)) {
    throw new Error(`Invalid config in ${configPath}: sourceLocale (string) and targetLocales (string[]) are required`);
  }

  return parsed;
}

export async function saveProjectConfig(config: I18nProjectConfig, root?: string): Promise<void> {
  const configPath = getConfigPath(root);
  const content = JSON.stringify(config, null, 2) + '\n';
  await fs.writeFile(configPath, content, 'utf-8');
}

export function createDefaultConfig(overrides?: Partial<I18nProjectConfig>): I18nProjectConfig {
  return {
    sourceLocale: 'en',
    targetLocales: [],
    ...overrides,
  };
}

export function validateConfig(config: unknown): config is I18nProjectConfig {
  if (config === null || config === undefined || typeof config !== 'object' || Array.isArray(config)) {
    return false;
  }

  const obj = config as Record<string, unknown>;

  if (typeof obj['sourceLocale'] !== 'string') return false;
  if (!Array.isArray(obj['targetLocales'])) return false;
  if (!(obj['targetLocales'] as unknown[]).every((v: unknown) => typeof v === 'string')) return false;

  if (obj['framework'] !== undefined && typeof obj['framework'] !== 'string') return false;
  if (obj['formality'] !== undefined && typeof obj['formality'] !== 'string') return false;
  if (obj['glossary'] !== undefined && typeof obj['glossary'] !== 'string') return false;
  if (obj['localePaths'] !== undefined) {
    if (!Array.isArray(obj['localePaths']) || !(obj['localePaths'] as unknown[]).every((v: unknown) => typeof v === 'string')) return false;
  }
  if (obj['excludePaths'] !== undefined) {
    if (!Array.isArray(obj['excludePaths']) || !(obj['excludePaths'] as unknown[]).every((v: unknown) => typeof v === 'string')) return false;
  }
  if (obj['monorepo'] !== undefined) {
    if (typeof obj['monorepo'] !== 'object' || obj['monorepo'] === null || Array.isArray(obj['monorepo'])) return false;
    const mono = obj['monorepo'] as Record<string, unknown>;
    if (!Array.isArray(mono['packages']) || !(mono['packages'] as unknown[]).every((v: unknown) => typeof v === 'string')) return false;
  }

  return true;
}
