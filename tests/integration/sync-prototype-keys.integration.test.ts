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
import { SyncLockManager } from '../../src/sync/sync-lock';
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

describe('Sync with prototype-named i18n keys', () => {
  let tmpDir: string;
  let client: DeepLClient;
  let syncService: SyncService;
  let sentTexts: string[][];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-proto-'));
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
            text: `de:${t}`,
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

  function readLock(): {
    entries: Record<string, Record<string, SyncLockEntry>>;
    stats: { total_keys: number };
  } {
    return JSON.parse(
      fs.readFileSync(path.join(tmpDir, LOCK_FILE_NAME), 'utf-8')
    );
  }

  it('should record a __proto__ key in the lockfile so it is not re-translated forever', async () => {
    writeSource({
      greeting: 'Hello',
      ['__proto__']: 'Polluted',
      normal: 'World',
    });
    const config = await loadSyncConfig(tmpDir);

    const first = await syncService.sync(config);
    expect(first.success).toBe(true);
    expect(sentTexts.flat()).toContain('Polluted');

    const lockEntries = readLock().entries['locales/en.json'];
    expect(Object.keys(lockEntries ?? {}).sort()).toEqual([
      '__proto__',
      'greeting',
      'normal',
    ]);
    expect(readLock().stats.total_keys).toBe(3);

    const translated = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales', 'de.json'), 'utf-8')
    ) as Record<string, string>;
    expect(Object.hasOwn(translated, '__proto__')).toBe(true);
    expect(
      Object.getOwnPropertyDescriptor(translated, '__proto__')?.value
    ).toBe('de:Polluted');

    sentTexts = [];
    const second = await syncService.sync(await loadSyncConfig(tmpDir));
    expect(second.success).toBe(true);
    expect(sentTexts.flat()).toEqual([]);
    expect(second.currentKeys).toBe(3);
  });

  it('should not treat an inherited Object.prototype member as an existing lock entry', async () => {
    writeSource({
      constructor: 'Build',
      toString: 'Render',
      valueOf: 'Unwrap',
      hasOwnProperty: 'Owns',
    });

    const first = await syncService.sync(await loadSyncConfig(tmpDir));
    expect(first.success).toBe(true);
    expect(first.newKeys).toBe(4);
    expect(first.staleKeys).toBe(0);

    sentTexts = [];
    const second = await syncService.sync(await loadSyncConfig(tmpDir));
    expect(sentTexts.flat()).toEqual([]);
    expect(second.currentKeys).toBe(4);
  });

  it('should not lose a __proto__ key written through the lock manager', async () => {
    const lockPath = path.join(tmpDir, LOCK_FILE_NAME);
    const manager = new SyncLockManager(lockPath);
    const entry: SyncLockEntry = {
      source_hash: 'abc123',
      source_text: 'Polluted',
      translations: {
        de: {
          hash: 'abc123',
          translated_at: '2026-08-07T00:00:00.000Z',
          status: 'translated',
        },
      },
    };

    await manager.updateEntry('locales/en.json', 'greeting', entry);
    await manager.updateEntry('locales/en.json', '__proto__', entry);

    const reread = await manager.read();
    const stored = reread.entries['locales/en.json'] ?? {};
    expect(Object.keys(stored).sort()).toEqual(['__proto__', 'greeting']);
    expect(reread.stats.total_keys).toBe(2);

    await manager.removeEntry('locales/en.json', '__proto__');
    const afterRemoval = await manager.read();
    expect(Object.keys(afterRemoval.entries['locales/en.json'] ?? {})).toEqual([
      'greeting',
    ]);
  });

  it('should keep a file path named __proto__ in the entries map', async () => {
    const manager = new SyncLockManager(path.join(tmpDir, LOCK_FILE_NAME));
    await manager.updateEntry('__proto__', 'greeting', {
      source_hash: 'abc123',
      source_text: 'Hello',
      translations: {},
    });

    const reread = await manager.read();
    expect(Object.keys(reread.entries)).toEqual(['__proto__']);
  });
});
