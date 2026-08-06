/**
 * Integration tests for what a sync leaves behind when it does not finish:
 * an interrupted run (SIGINT/SIGTERM, where the handler gets to act) and a
 * recovery run after a crash (SIGKILL, where nothing got to act and the
 * previous run's `.deepl.bak` is the only surviving copy of the user's file).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import nock from 'nock';
import { SyncService } from '../../src/sync/sync-service';
import { TranslationService } from '../../src/services/translation';
import { GlossaryService } from '../../src/services/glossary';
import { DeepLClient } from '../../src/api/deepl-client';
import { FormatRegistry } from '../../src/formats/index';
import { JsonFormatParser } from '../../src/formats/json';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { BACKUP_SUFFIX } from '../../src/sync/sync-bak-cleanup';
import { DEEPL_FREE_API_URL, TEST_API_KEY } from '../helpers/nock-setup';
import {
  createMockConfigService,
  createMockCacheService,
} from '../helpers/mock-factories';

const CONFIG_YAML = `version: 1
source_locale: en
target_locales:
  - de
  - fr
sync:
  concurrency: 1
buckets:
  json:
    include:
      - "locales/en.json"
`;

const SOURCE = JSON.stringify({ a: 'Alpha', b: 'Beta' }, null, 2) + '\n';
const HUMAN_DE =
  JSON.stringify({ a: 'HUMAN-DE-Alpha', b: 'HUMAN-DE-Beta' }, null, 2) + '\n';
const HUMAN_FR =
  JSON.stringify({ a: 'HUMAN-FR-Alpha', b: 'HUMAN-FR-Beta' }, null, 2) + '\n';

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
      output: { format: 'text', color: false },
      proxy: {},
    })),
    getValue: jest.fn(() => false),
  });
  const translationService = new TranslationService(
    client,
    mockConfig,
    createMockCacheService()
  );
  const registry = new FormatRegistry();
  registry.register(new JsonFormatParser());
  const syncService = new SyncService(
    translationService,
    new GlossaryService(client),
    registry
  );
  return { client, syncService };
}

function replyWithMachineTranslations(body: unknown): {
  translations: Array<{ text: string; detected_source_language: string }>;
} {
  const params = new URLSearchParams(String(body));
  return {
    translations: params.getAll('text').map((text) => ({
      text: `MT ${text}`,
      detected_source_language: 'EN',
    })),
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('sync interruption and crash recovery', () => {
  let tmpDir: string;
  let client: DeepLClient;
  let syncService: SyncService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-interrupt-'));
    const services = createServices();
    client = services.client;
    syncService = services.syncService;

    fs.mkdirSync(path.join(tmpDir, 'locales'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.deepl-sync.yaml'), CONFIG_YAML);
    fs.writeFileSync(path.join(tmpDir, 'locales', 'en.json'), SOURCE);
    fs.writeFileSync(path.join(tmpDir, 'locales', 'de.json'), HUMAN_DE);
    fs.writeFileSync(path.join(tmpDir, 'locales', 'fr.json'), HUMAN_FR);
  });

  afterEach(() => {
    client.destroy();
    nock.cleanAll();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const dePath = (): string => path.join(tmpDir, 'locales', 'de.json');
  const deBakPath = (): string => dePath() + BACKUP_SUFFIX;

  it('restores an overwritten target on SIGINT instead of deleting its backup', async () => {
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, (_uri, body) => replyWithMachineTranslations(body));
    // The second locale is held until the assertions are done, so the run is
    // still in flight when the signal arrives — the only moment at which the
    // handler matters.
    let releaseSecondLocale = (): void => {};
    const secondLocale = new Promise<void>((resolve) => {
      releaseSecondLocale = resolve;
    });
    nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .reply(200, async (_uri, body) => {
        await secondLocale;
        return replyWithMachineTranslations(body);
      });

    const config = await loadSyncConfig(tmpDir);
    // In production the process exits on the signal; here the run is left to
    // settle after the assertions so the suite does not outlive it.
    const running = syncService.sync(config).catch(() => undefined);

    await waitFor(
      () =>
        fs.existsSync(deBakPath()) &&
        fs.readFileSync(dePath(), 'utf-8') !== HUMAN_DE
    );

    process.emit('SIGINT');

    expect(fs.readFileSync(dePath(), 'utf-8')).toBe(HUMAN_DE);
    expect(fs.existsSync(deBakPath())).toBe(false);

    releaseSecondLocale();
    await running;
  });
});
