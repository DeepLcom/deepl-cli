import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.unmock('fast-glob');

import nock from 'nock';
import { SyncService } from '../../src/sync/sync-service';
import { TranslationService } from '../../src/services/translation';
import { GlossaryService } from '../../src/services/glossary';
import { DeepLClient } from '../../src/api/deepl-client';
import { FormatRegistry } from '../../src/formats/index';
import { JsonFormatParser } from '../../src/formats/json';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { ValidationError } from '../../src/utils/errors';
import { DEEPL_FREE_API_URL, TEST_API_KEY } from '../helpers/nock-setup';
import { createMockConfigService, createMockCacheService } from '../helpers/mock-factories';

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

// Low cap so the test can create a realistic over-the-cap fixture cheaply.
const TEST_CAP = 10;
const OVER_CAP_FILES = 15;

const CONFIG_YAML = `version: 1
source_locale: en
target_locales:
  - de
buckets:
  json:
    include:
      - "locales/en.json"
context:
  enabled: true
  scan_paths:
    - "src/**/*.tsx"
sync:
  concurrency: 5
  batch_size: 50
  max_scan_files: ${TEST_CAP}
`;

const SOURCE_JSON = JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n';

describe('sync-service scan_paths: bounded walk prevents DoS on huge source trees', () => {
  let tmpDir: string;
  let client: DeepLClient;
  let syncService: SyncService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-scan-bounds-'));
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

  it(`throws ValidationError when scan_paths matches > max_scan_files (cap=${TEST_CAP}, fixture=${OVER_CAP_FILES})`, async () => {
    const configPath = path.join(tmpDir, '.deepl-sync.yaml');
    fs.writeFileSync(configPath, CONFIG_YAML, 'utf-8');

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    for (let i = 0; i < OVER_CAP_FILES; i++) {
      fs.writeFileSync(
        path.join(srcDir, `File${i}.tsx`),
        `export const k${i} = 'v${i}';\n`,
        'utf-8',
      );
    }
    const localePath = path.join(tmpDir, 'locales', 'en.json');
    fs.mkdirSync(path.dirname(localePath), { recursive: true });
    fs.writeFileSync(localePath, SOURCE_JSON, 'utf-8');

    nock(DEEPL_FREE_API_URL)
      .persist()
      .post('/v2/translate')
      .reply(200, { translations: [{ text: 'Hallo', detected_source_language: 'EN' }] });

    const config = await loadSyncConfig(configPath, {});

    let threw: Error | null = null;
    try {
      await syncService.sync(config, { dryRun: true });
    } catch (e) {
      threw = e as Error;
    }

    expect(threw).not.toBeNull();
    expect(threw).toBeInstanceOf(ValidationError);
    expect(threw!.message).toMatch(/scan_paths matched/i);
    expect(threw!.message).toMatch(/max/i);
  }, 30_000);
});
