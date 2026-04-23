/**
 * Integration tests for the sync push/pull TMS adapter.
 *
 * These tests drive pushTranslations / pullTranslations against a nock-mocked
 * TMS server and assert the wire contract, credential resolution, and error
 * paths end to end at the service layer (not via execSync). For CLI-binary
 * behavior, see tests/e2e/cli-sync-tms.e2e.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { TmsClient, createTmsClient } from '../../src/sync/tms-client';
import { pushTranslations, pullTranslations } from '../../src/sync/sync-tms';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { LOCK_FILE_NAME } from '../../src/sync/types';
import { ConfigError } from '../../src/utils/errors';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import {
  TMS_BASE,
  TMS_PROJECT,
  expectTmsPush,
  expectTmsPull,
  tmsConfig,
} from '../helpers/tms-nock';

function writeJson(dir: string, relPath: string, obj: unknown): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

describe('sync push/pull (TMS integration)', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-tms-'));
    harness = createSyncHarness({ parsers: ['json'] });
    delete process.env['TMS_API_KEY'];
    delete process.env['TMS_TOKEN'];
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
    process.env = envSnapshot;
  });

  // ---- Case 1: push happy path ----
  it('push: sends PUT per source key with ApiKey auth, returns pushed count', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { greeting: 'Hello', farewell: 'Goodbye' });
    writeJson(tmpDir, 'locales/de.json', { greeting: 'Hallo', farewell: 'Auf Wiedersehen' });

    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(tmpDir);
    const client = createTmsClient(config.tms!);

    const scopes = [
      expectTmsPush('farewell', 'de', 'Auf Wiedersehen', { auth: { apiKey: 'env-key' } }),
      expectTmsPush('greeting', 'de', 'Hallo', { auth: { apiKey: 'env-key' } }),
    ];

    const result = await pushTranslations(config, client, harness.registry);
    expect(result.pushed).toBe(2);
    expect(result.skipped).toEqual([]);
    for (const scope of scopes) {
      expect(scope.isDone()).toBe(true);
    }
  });

  // ---- Case 2: pull happy path ----
  it('pull: fetches translations, writes target file, updates lockfile with review_status=human_reviewed', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { greeting: 'Hello', farewell: 'Goodbye' });
    writeJson(tmpDir, 'locales/de.json', { greeting: 'OLD', farewell: 'STALE' });

    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(tmpDir);
    const client = createTmsClient(config.tms!);

    const pullScope = expectTmsPull(
      'de',
      { greeting: 'Hallo (approved)', farewell: 'Tschüss (approved)' },
      { auth: { apiKey: 'env-key' } },
    );

    const result = await pullTranslations(config, client, harness.registry);
    expect(result.pulled).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(pullScope.isDone()).toBe(true);

    const targetContent = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8'),
    ) as Record<string, string>;
    expect(targetContent['greeting']).toBe('Hallo (approved)');
    expect(targetContent['farewell']).toBe('Tschüss (approved)');

    const lockContent = JSON.parse(
      fs.readFileSync(path.join(tmpDir, LOCK_FILE_NAME), 'utf-8'),
    ) as { entries: Record<string, Record<string, { translations: Record<string, { review_status: string; translated_at: string; status: string }> }>> };
    const bucketEntries = lockContent.entries['locales/en.json']!;
    expect(bucketEntries['greeting']!.translations['de']!.review_status).toBe('human_reviewed');
    expect(bucketEntries['greeting']!.translations['de']!.status).toBe('translated');
    expect(typeof bucketEntries['greeting']!.translations['de']!.translated_at).toBe('string');
  });

  // ---- Case 3: TMS_API_KEY env var precedence over config ----
  it('credential resolution: TMS_API_KEY env var overrides config.api_key', async () => {
    writeSyncConfig(tmpDir, { tms: tmsConfig({ api_key: 'from-config' }) });
    writeJson(tmpDir, 'locales/en.json', { k: 'Hello' });
    writeJson(tmpDir, 'locales/de.json', { k: 'Hallo' });

    process.env['TMS_API_KEY'] = 'from-env';

    const config = await loadSyncConfig(tmpDir);
    const client = createTmsClient(config.tms!);

    const scope = expectTmsPush('k', 'de', 'Hallo', { auth: { apiKey: 'from-env' } });

    await pushTranslations(config, client, harness.registry);
    expect(scope.isDone()).toBe(true);
  });

  // ---- Case 4: TMS_TOKEN env var → Bearer auth ----
  it('credential resolution: TMS_TOKEN env var produces Bearer auth header', async () => {
    writeSyncConfig(tmpDir, { tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { k: 'Hello' });
    writeJson(tmpDir, 'locales/de.json', { k: 'Hallo' });

    process.env['TMS_TOKEN'] = 'the-token';

    const config = await loadSyncConfig(tmpDir);
    const client = createTmsClient(config.tms!);

    const scope = expectTmsPush('k', 'de', 'Hallo', { auth: { token: 'the-token' } });

    await pushTranslations(config, client, harness.registry);
    expect(scope.isDone()).toBe(true);
  });

  // ---- Case 5: secret-in-config warning ----
  it('credential resolution: emits a stderr warning when api_key is sourced from .deepl-sync.yaml', async () => {
    writeSyncConfig(tmpDir, { tms: tmsConfig({ api_key: 'in-config' }) });

    const warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const config = await loadSyncConfig(tmpDir);
      createTmsClient(config.tms!);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/TMS API key found in config file.*TMS_API_KEY/),
      );
    } finally {
      warn.mockRestore();
    }
  });

  // ---- Case 6: HTTPS enforcement — localhost exempt ----
  it('URL validation: accepts http://localhost for dev mode', async () => {
    const client = new TmsClient({
      serverUrl: 'http://localhost:3000',
      projectId: TMS_PROJECT,
      apiKey: 'k',
    });
    const scope = nock('http://localhost:3000')
      .put(`/api/projects/${TMS_PROJECT}/keys/greeting`)
      .reply(200, {});

    await expect(client.pushKey('greeting', 'de', 'Hallo')).resolves.toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });

  // ---- Case 7: non-HTTPS non-localhost rejected with ConfigError ----
  it('URL validation: rejects non-HTTPS non-localhost URLs with ConfigError', async () => {
    const client = new TmsClient({
      serverUrl: 'http://evil.example.com',
      projectId: TMS_PROJECT,
      apiKey: 'k',
    });

    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(ConfigError);
    await expect(client.pushKey('k', 'de', 'v')).rejects.toThrow(/HTTPS/);
  });

  // ---- Case 8: 401 surfaces as an actionable ConfigError ----
  it('error path: 401 from TMS surfaces as a ConfigError with a remediation hint', async () => {
    writeSyncConfig(tmpDir, { tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { k: 'Hello' });
    writeJson(tmpDir, 'locales/de.json', { k: 'Hallo' });

    process.env['TMS_API_KEY'] = 'bogus';

    const config = await loadSyncConfig(tmpDir);
    const client = createTmsClient(config.tms!);

    nock(TMS_BASE)
      .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
      .reply(401, { error: 'Unauthorized' });

    await expect(pushTranslations(config, client, harness.registry)).rejects.toThrow(ConfigError);
    // Arm the nock scope again (the previous call consumed it) for the second assertion
    nock(TMS_BASE)
      .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
      .reply(401, { error: 'Unauthorized' });
    await expect(pushTranslations(config, client, harness.registry)).rejects.toThrow(/TMS authentication failed \(401/);
  });
});
