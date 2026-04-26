/**
 * Shared test harness for sync integration tests.
 *
 * Exposes three helpers used across tests/integration/sync*.integration.test.ts:
 *   - createSyncHarness()   -> wires up SyncService with the real deps and mock config/cache
 *   - buildSyncConfigYaml() -> serializes a .deepl-sync.yaml document from a plain object
 *   - seedLockFile()        -> writes a valid .deepl-sync.lock to a test project root
 *
 * These replace ad-hoc template strings and duplicated service-wiring code that
 * accumulated across the sync integration tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

import { DeepLClient } from '../../src/api/deepl-client';
import { TranslationService } from '../../src/services/translation';
import { GlossaryService } from '../../src/services/glossary';
import { SyncService } from '../../src/sync/sync-service';
import { FormatRegistry } from '../../src/formats/index';
import { JsonFormatParser } from '../../src/formats/json';
import { YamlFormatParser } from '../../src/formats/yaml';
import { AndroidXmlFormatParser } from '../../src/formats/android-xml';
import { XliffFormatParser } from '../../src/formats/xliff';
import { XcstringsFormatParser } from '../../src/formats/xcstrings';
import { PoFormatParser } from '../../src/formats/po';
import { TomlFormatParser } from '../../src/formats/toml';
import { ArbFormatParser } from '../../src/formats/arb';
import { IosStringsFormatParser } from '../../src/formats/ios-strings';
import { PropertiesFormatParser } from '../../src/formats/properties';
import type { FormatParser } from '../../src/formats/index';
import type { SyncLockFile, SyncLockEntry } from '../../src/sync/types';
import { LOCK_FILE_NAME, LOCK_FILE_VERSION, LOCK_FILE_COMMENT } from '../../src/sync/types';
import { TEST_API_KEY } from './nock-setup';
import { createMockConfigService, createMockCacheService } from './mock-factories';

export type SupportedParser =
  | 'json'
  | 'yaml'
  | 'android_xml'
  | 'xliff'
  | 'xcstrings'
  | 'po'
  | 'toml'
  | 'arb'
  | 'ios_strings'
  | 'properties';

export interface SyncHarness {
  client: DeepLClient;
  syncService: SyncService;
  registry: FormatRegistry;
  cleanup: () => void;
}

export function createSyncHarness(opts: { parsers?: SupportedParser[]; maxRetries?: number } = {}): SyncHarness {
  const client = new DeepLClient(TEST_API_KEY, { maxRetries: opts.maxRetries ?? 0 });
  const mockConfig = createMockConfigService({
    get: jest.fn(() => ({
      auth: {},
      api: { baseUrl: '', usePro: false },
      defaults: { targetLangs: [], formality: 'default', preserveFormatting: false },
      cache: { enabled: false },
      output: { format: 'text', color: true },
      proxy: {},
    })),
    getValue: jest.fn(() => false),
  });
  const mockCache = createMockCacheService();
  const translationService = new TranslationService(client, mockConfig, mockCache);
  const glossaryService = new GlossaryService(client);
  const registry = new FormatRegistry();
  for (const name of opts.parsers ?? ['json']) {
    registry.register(parserFor(name));
  }
  const syncService = new SyncService(translationService, glossaryService, registry);
  return { client, syncService, registry, cleanup: () => client.destroy() };
}

function parserFor(name: SupportedParser): FormatParser {
  switch (name) {
    case 'json': return new JsonFormatParser();
    case 'yaml': return new YamlFormatParser();
    case 'android_xml': return new AndroidXmlFormatParser();
    case 'xliff': return new XliffFormatParser();
    case 'xcstrings': return new XcstringsFormatParser();
    case 'po': return new PoFormatParser();
    case 'toml': return new TomlFormatParser();
    case 'arb': return new ArbFormatParser();
    case 'ios_strings': return new IosStringsFormatParser();
    case 'properties': return new PropertiesFormatParser();
  }
}

export interface SyncConfigYamlOpts {
  sourceLocale?: string;
  targetLocales?: string[];
  buckets?: Record<string, Record<string, unknown>>;
  translation?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  tms?: Record<string, unknown>;
  ignore?: string[];
  context?: Record<string, unknown> | boolean;
}

export function buildSyncConfigYaml(opts: SyncConfigYamlOpts = {}): string {
  const config: Record<string, unknown> = {
    version: 1,
    source_locale: opts.sourceLocale ?? 'en',
    target_locales: opts.targetLocales ?? ['de'],
    buckets: opts.buckets ?? { json: { include: ['locales/en.json'] } },
  };
  if (opts.translation) config['translation'] = opts.translation;
  if (opts.validation) config['validation'] = opts.validation;
  if (opts.sync) config['sync'] = opts.sync;
  if (opts.tms) config['tms'] = opts.tms;
  if (opts.ignore) config['ignore'] = opts.ignore;
  if (opts.context !== undefined) config['context'] = opts.context;
  return YAML.stringify(config);
}

export function writeSyncConfig(dir: string, opts: SyncConfigYamlOpts = {}): string {
  const yaml = buildSyncConfigYaml(opts);
  const filePath = path.join(dir, '.deepl-sync.yaml');
  fs.writeFileSync(filePath, yaml, 'utf-8');
  return filePath;
}

export interface SeedLockOpts {
  sourceLocale?: string;
  entries: Record<string, Record<string, SyncLockEntry>>;
}

export function seedLockFile(dir: string, opts: SeedLockOpts): void {
  const sourceLocale = opts.sourceLocale ?? 'en';
  const now = new Date().toISOString();
  let totalKeys = 0;
  let totalTranslations = 0;
  for (const bucket of Object.values(opts.entries)) {
    for (const entry of Object.values(bucket)) {
      totalKeys += 1;
      totalTranslations += Object.keys(entry.translations ?? {}).length;
    }
  }
  const lockFile: SyncLockFile = {
    _comment: LOCK_FILE_COMMENT,
    version: LOCK_FILE_VERSION,
    generated_at: now,
    source_locale: sourceLocale,
    entries: opts.entries,
    stats: { total_keys: totalKeys, total_translations: totalTranslations, last_sync: now },
  };
  fs.writeFileSync(path.join(dir, LOCK_FILE_NAME), JSON.stringify(lockFile, null, 2) + '\n', 'utf-8');
}
