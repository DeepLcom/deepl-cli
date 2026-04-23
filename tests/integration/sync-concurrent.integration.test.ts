import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';
import { SyncService } from '../../src/sync/sync-service';
import { TranslationService } from '../../src/services/translation';
import { GlossaryService } from '../../src/services/glossary';
import { DeepLClient } from '../../src/api/deepl-client';
import { FormatRegistry } from '../../src/formats/index';
import { JsonFormatParser } from '../../src/formats/json';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { ConfigError } from '../../src/utils/errors';
import { PROCESS_LOCK_FILE_NAME } from '../../src/sync/sync-process-lock';
import { DEEPL_FREE_API_URL, TEST_API_KEY } from '../helpers/nock-setup';
import { createMockConfigService, createMockCacheService } from '../helpers/mock-factories';
import { handleSyncPull } from '../../src/cli/commands/sync/register-sync-pull';

function createServices(): { client: DeepLClient; syncService: SyncService } {
  const client = new DeepLClient(TEST_API_KEY, { maxRetries: 0 });
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
  registry.register(new JsonFormatParser());
  const syncService = new SyncService(translationService, glossaryService, registry);
  return { client, syncService };
}

const BASIC_CONFIG_YAML = `version: 1
source_locale: en
target_locales:
  - de
buckets:
  json:
    include:
      - "locales/en.json"
`;

const SOURCE_JSON = JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n';

function writeYamlConfig(dir: string, yaml: string): void {
  fs.writeFileSync(path.join(dir, '.deepl-sync.yaml'), yaml, 'utf-8');
}

function writeSourceFile(dir: string, relPath: string, content: string): void {
  const absPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
}

describe('Sync Concurrent Runs Integration', () => {
  let tmpDir: string;
  let client: DeepLClient;
  let syncService: SyncService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-concurrent-'));
    const services = createServices();
    client = services.client;
    syncService = services.syncService;
  });

  afterEach(() => {
    client.destroy();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  it('releases the process lock so a subsequent sync in the same directory can proceed', async () => {
    writeYamlConfig(tmpDir, BASIC_CONFIG_YAML);
    writeSourceFile(tmpDir, 'locales/en.json', SOURCE_JSON);

    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, {
        translations: [
          { text: 'Hallo', detected_source_language: 'EN', billed_characters: 5 },
        ],
      });

    const config = await loadSyncConfig(tmpDir);
    const first = await syncService.sync(config);
    expect(first.success).toBe(true);

    const pidFile = path.join(tmpDir, PROCESS_LOCK_FILE_NAME);
    expect(fs.existsSync(pidFile)).toBe(false);

    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, { translations: [] });

    const second = await syncService.sync(config);
    expect(second.success).toBe(true);
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  it('reclaims a stale pidfile left behind by a crashed process and emits a warning', async () => {
    writeYamlConfig(tmpDir, BASIC_CONFIG_YAML);
    writeSourceFile(tmpDir, 'locales/en.json', SOURCE_JSON);

    const pidFile = path.join(tmpDir, PROCESS_LOCK_FILE_NAME);
    const stalePid = findDeadPid();
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: stalePid, startedAt: new Date(Date.now() - 60_000).toISOString() }),
      'utf-8',
    );

    const warnSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, {
        translations: [
          { text: 'Hallo', detected_source_language: 'EN', billed_characters: 5 },
        ],
      });

    try {
      const config = await loadSyncConfig(tmpDir);
      const result = await syncService.sync(config);
      expect(result.success).toBe(true);
      expect(fs.existsSync(pidFile)).toBe(false);

      const warnCalls = warnSpy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(warnCalls.toLowerCase()).toContain('stale');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('refuses to start and throws ConfigError when the pidfile names a live process', async () => {
    writeYamlConfig(tmpDir, BASIC_CONFIG_YAML);
    writeSourceFile(tmpDir, 'locales/en.json', SOURCE_JSON);

    const pidFile = path.join(tmpDir, PROCESS_LOCK_FILE_NAME);
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      'utf-8',
    );

    const config = await loadSyncConfig(tmpDir);

    await expect(syncService.sync(config)).rejects.toMatchObject({
      name: 'ConfigError',
      exitCode: 7,
    });

    expect(fs.existsSync(pidFile)).toBe(true);

    const raw = fs.readFileSync(pidFile, 'utf-8');
    const parsed = JSON.parse(raw) as { pid: number };
    expect(parsed.pid).toBe(process.pid);

    fs.unlinkSync(pidFile);
  });
});

function findDeadPid(): number {
  for (let candidate = 99999; candidate < 200000; candidate++) {
    try {
      process.kill(candidate, 0);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') {
        return candidate;
      }
    }
  }
  throw new Error('could not find a dead PID for test setup');
}

// ConfigError import is validated against thrown error shape via toMatchObject above.
void ConfigError;

describe('sync pull concurrent lock guard', () => {
  const TMS_YAML = `version: 1
source_locale: en
target_locales:
  - de
buckets:
  json:
    include:
      - "locales/en.json"
tms:
  enabled: true
  server: https://tms.test
  project_id: proj-test
`;

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-pull-lock-'));
    fs.writeFileSync(path.join(tmpDir, '.deepl-sync.yaml'), TMS_YAML, 'utf-8');
    const localesDir = path.join(tmpDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });
    fs.writeFileSync(path.join(localesDir, 'en.json'), JSON.stringify({ hello: 'Hello' }, null, 2) + '\n', 'utf-8');
    process.env['TMS_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    delete process.env['TMS_API_KEY'];
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  it('rejects with ConfigError when a concurrent deepl sync holds the pidfile lock', async () => {
    const pidFile = path.join(tmpDir, PROCESS_LOCK_FILE_NAME);
    fs.writeFileSync(
      pidFile,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      'utf-8',
    );

    const handleError = jest.fn((err: Error) => { throw err; });

    await expect(
      handleSyncPull({ syncConfig: path.join(tmpDir, '.deepl-sync.yaml'), format: 'text' }, handleError),
    ).rejects.toMatchObject({
      name: 'ConfigError',
      exitCode: 7,
    });

    expect(fs.existsSync(pidFile)).toBe(true);
    const raw = fs.readFileSync(pidFile, 'utf-8');
    const parsed = JSON.parse(raw) as { pid: number };
    expect(parsed.pid).toBe(process.pid);

    fs.unlinkSync(pidFile);
  });
});
