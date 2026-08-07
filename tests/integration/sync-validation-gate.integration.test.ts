import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as querystring from 'querystring';

jest.unmock('fast-glob');

import nock from 'nock';
import { SyncService } from '../../src/sync/sync-service';
import { TranslationService } from '../../src/services/translation';
import { GlossaryService } from '../../src/services/glossary';
import { DeepLClient } from '../../src/api/deepl-client';
import { FormatRegistry } from '../../src/formats/index';
import { JsonFormatParser } from '../../src/formats/json';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { LOCK_FILE_NAME } from '../../src/sync/types';
import type { SyncLockEntry } from '../../src/sync/types';
import { DEEPL_FREE_API_URL, TEST_API_KEY } from '../helpers/nock-setup';
import {
  createMockConfigService,
  createMockCacheService,
} from '../helpers/mock-factories';

const CONFIG_YAML = `version: 1
source_locale: en
target_locales:
  - de
buckets:
  json:
    include:
      - "locales/en.json"
`;

function getTexts(body: unknown): string[] {
  const parsed =
    typeof body === 'string'
      ? (querystring.parse(body) as Record<string, string | string[]>)
      : (body as Record<string, string | string[]>);
  const text = parsed['text'];
  return Array.isArray(text) ? text : text ? [text] : [];
}

function createServices(): { client: DeepLClient; syncService: SyncService } {
  const client = new DeepLClient(TEST_API_KEY, { maxRetries: 0 });
  const mockConfig = createMockConfigService({
    get: jest.fn(() => ({
      auth: {},
      api: { baseUrl: '', usePro: false },
      defaults: {
        targetLangs: [],
        formality: 'default',
        preserveFormatting: false,
      },
      cache: { enabled: false },
      output: { format: 'text', color: true },
      proxy: {},
    })),
    getValue: jest.fn(() => false),
  });
  const registry = new FormatRegistry();
  registry.register(new JsonFormatParser());
  const syncService = new SyncService(
    new TranslationService(client, mockConfig, createMockCacheService()),
    new GlossaryService(client),
    registry
  );
  return { client, syncService };
}

/**
 * An engine that drops the `__VAR_n__` tokens the CLI substitutes for
 * placeholders, so every string carrying a placeholder comes back corrupt and
 * every string without one comes back fine.
 */
describe('Sync when the engine returns corrupt output', () => {
  let tmpDir: string;
  let client: DeepLClient;
  let syncService: SyncService;
  let sentTexts: string[][];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-valgate-'));
    const services = createServices();
    client = services.client;
    syncService = services.syncService;
    sentTexts = [];
    nock(DEEPL_FREE_API_URL)
      .persist()
      .post('/v2/translate')
      .reply(200, (_uri, body) => {
        const texts = getTexts(body);
        sentTexts.push(texts);
        return {
          translations: texts.map((t) => ({
            text: `de:${t
              .replace(/__VAR_\d+__/g, '')
              .replace(/\s+/g, ' ')
              .trim()}`,
            detected_source_language: 'EN',
            billed_characters: t.length,
          })),
        };
      });
  });

  afterEach(() => {
    client.destroy();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  function writeSource(keys: Record<string, string>): void {
    fs.writeFileSync(path.join(tmpDir, '.deepl-sync.yaml'), CONFIG_YAML);
    const absPath = path.join(tmpDir, 'locales', 'en.json');
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, JSON.stringify(keys, null, 2) + '\n', 'utf-8');
  }

  function readTarget(locale = 'de'): Record<string, string> {
    return JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales', `${locale}.json`), 'utf-8')
    ) as Record<string, string>;
  }

  function readLockEntries(): Record<string, SyncLockEntry> {
    const lock = JSON.parse(
      fs.readFileSync(path.join(tmpDir, LOCK_FILE_NAME), 'utf-8')
    ) as { entries: Record<string, Record<string, SyncLockEntry>> };
    return lock.entries['locales/en.json'] ?? {};
  }

  it('should not write a translation that lost a placeholder', async () => {
    writeSource({
      greeting: 'Hello {name}, welcome back',
      plain: 'This sentence has no placeholders at all',
    });

    const result = await syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.validationErrors).toBe(1);
    expect(result.success).toBe(false);
    expect(readTarget()).toEqual({
      plain: 'de:This sentence has no placeholders at all',
    });
  });

  it('should record a withheld key as failed so the next sync retries it', async () => {
    writeSource({ greeting: 'Hello {name}, welcome back' });

    await syncService.sync(await loadSyncConfig(tmpDir));
    expect(readLockEntries()['greeting']?.translations['de']?.status).toBe(
      'failed'
    );

    sentTexts = [];
    const second = await syncService.sync(await loadSyncConfig(tmpDir));

    expect(sentTexts.flat()).toEqual(['Hello __VAR_0__, welcome back']);
    expect(second.staleKeys).toBe(1);
  });

  it('should leave the previous translation in place rather than deleting the key', async () => {
    writeSource({ greeting: 'Hello {name}' });
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'de.json'),
      JSON.stringify({ greeting: 'Hallo {name}' }, null, 2) + '\n',
      'utf-8'
    );

    await syncService.sync(await loadSyncConfig(tmpDir));

    expect(readTarget()).toEqual({ greeting: 'Hallo {name}' });
  });

  it('should validate translations produced for a newly added target locale', async () => {
    writeSource({ greeting: 'Hello {name}' });
    // First sync establishes de; then fr is added, so greeting is `current`
    // in the lockfile but missing for fr — the backfill path.
    await syncService.sync(await loadSyncConfig(tmpDir));
    fs.writeFileSync(
      path.join(tmpDir, '.deepl-sync.yaml'),
      CONFIG_YAML.replace('  - de\n', '  - de\n  - fr\n')
    );

    const second = await syncService.sync(await loadSyncConfig(tmpDir));

    expect(second.validationErrors).toBeGreaterThanOrEqual(1);
    expect(second.success).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'locales', 'fr.json'))).toBe(true);
    expect(Object.hasOwn(readTarget('fr'), 'greeting')).toBe(false);
  });

  it('should write the translation when placeholder checking is disabled', async () => {
    writeSource({ greeting: 'Hello {name}' });
    fs.writeFileSync(
      path.join(tmpDir, '.deepl-sync.yaml'),
      `${CONFIG_YAML}validation:\n  check_placeholders: false\n`
    );

    const result = await syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.success).toBe(true);
    expect(readTarget()).toEqual({ greeting: 'de:Hello' });
  });
});
