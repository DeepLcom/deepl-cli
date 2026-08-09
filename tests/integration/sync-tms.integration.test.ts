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
import { ConfigService } from '../../src/storage/config';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import {
  TMS_BASE,
  TMS_HOSTNAME,
  TMS_PROJECT,
  expectTmsPush,
  expectTmsPull,
  tmsConfig,
  approvedTmsTrust,
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
    writeJson(tmpDir, 'locales/en.json', {
      greeting: 'Hello',
      farewell: 'Goodbye',
    });
    writeJson(tmpDir, 'locales/de.json', {
      greeting: 'Hallo',
      farewell: 'Auf Wiedersehen',
    });

    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    const scopes = [
      expectTmsPush('farewell', 'de', 'Auf Wiedersehen', {
        auth: { apiKey: 'env-key' },
      }),
      expectTmsPush('greeting', 'de', 'Hallo', { auth: { apiKey: 'env-key' } }),
    ];

    const result = await pushTranslations(config, client, harness.registry);
    expect(result.pushed).toBe(2);
    expect(result.skipped).toEqual([]);
    for (const scope of scopes) {
      expect(scope.isDone()).toBe(true);
    }
  });

  it('pull: keeps a multi-line translation intact rather than fusing its lines', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { notice: 'Line one\nLine two' });
    writeJson(tmpDir, 'locales/de.json', { notice: 'OLD' });

    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    // A control byte that is never legitimate content is still removed, so the
    // value-stripping is narrowed rather than abandoned.
    expectTmsPull(
      'de',
      { notice: 'Zeile eins\nZeile zwei\tmit Tab\x1b[31m' },
      { auth: { apiKey: 'env-key' } }
    );

    const result = await pullTranslations(config, client, harness.registry);
    expect(result.pulled).toBe(1);

    const targetContent = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8')
    ) as Record<string, string>;
    expect(targetContent['notice']).toBe('Zeile eins\nZeile zwei\tmit Tab[31m');
  });

  // ---- Case 2: pull happy path ----
  it('pull: fetches translations, writes target file, and does not claim human review', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', {
      greeting: 'Hello',
      farewell: 'Goodbye',
    });
    writeJson(tmpDir, 'locales/de.json', {
      greeting: 'OLD',
      farewell: 'STALE',
    });

    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    const pullScope = expectTmsPull(
      'de',
      { greeting: 'Hallo (approved)', farewell: 'Tschüss (approved)' },
      { auth: { apiKey: 'env-key' } }
    );

    const result = await pullTranslations(config, client, harness.registry);
    expect(result.pulled).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(pullScope.isDone()).toBe(true);

    const targetContent = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8')
    ) as Record<string, string>;
    expect(targetContent['greeting']).toBe('Hallo (approved)');
    expect(targetContent['farewell']).toBe('Tschüss (approved)');

    const lockContent = JSON.parse(
      fs.readFileSync(path.join(tmpDir, LOCK_FILE_NAME), 'utf-8')
    ) as {
      entries: Record<
        string,
        Record<
          string,
          {
            translations: Record<
              string,
              { review_status: string; translated_at: string; status: string }
            >;
          }
        >
      >;
    };
    const bucketEntries = lockContent.entries['locales/en.json']!;
    // The export endpoint returns `{ key: value }` with no per-entry review
    // flag, so the pull has nothing to base a review claim on.
    expect(
      bucketEntries['greeting']!.translations['de']!.review_status
    ).toBeUndefined();
    expect(bucketEntries['greeting']!.translations['de']!.status).toBe(
      'translated'
    );
    expect(
      typeof bucketEntries['greeting']!.translations['de']!.translated_at
    ).toBe('string');
  });

  // ---- Case 2b: a key with no translation on either side ----
  it('pull: omits a key the TMS and the target file both lack instead of writing source text', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', {
      greeting: 'Hello',
      brand_new: 'Only in source',
    });
    writeJson(tmpDir, 'locales/de.json', { greeting: 'ALT' });

    process.env['TMS_API_KEY'] = 'env-key';
    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);
    expectTmsPull('de', { greeting: 'Hallo' }, { auth: { apiKey: 'env-key' } });

    const result = await pullTranslations(config, client, harness.registry);
    expect(result.pulled).toBe(1);

    const target = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8')
    ) as Record<string, string>;
    expect(target['greeting']).toBe('Hallo');
    expect(target).not.toHaveProperty('brand_new');
  });

  // ---- Case 2c: overwriting an existing local translation is disclosed ----
  it('pull: counts the existing local translations it replaced', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', {
      greeting: 'Hello',
      farewell: 'Goodbye',
      thanks: 'Thanks',
    });
    // greeting differs from the TMS value, farewell matches it, thanks is
    // absent locally — only the first is a replacement.
    writeJson(tmpDir, 'locales/de.json', {
      greeting: 'Von Hand redigiert',
      farewell: 'Tschüss',
    });

    process.env['TMS_API_KEY'] = 'env-key';
    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);
    expectTmsPull(
      'de',
      { greeting: 'Hallo', farewell: 'Tschüss', thanks: 'Danke' },
      { auth: { apiKey: 'env-key' } }
    );

    const result = await pullTranslations(config, client, harness.registry);
    expect(result.pulled).toBe(3);
    expect(result.replaced).toBe(1);
  });

  // ---- Case 2d: dry run ----
  it('pull --dry-run: reports what it would do and writes neither target nor lockfile', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { greeting: 'Hello' });
    writeJson(tmpDir, 'locales/de.json', { greeting: 'Von Hand redigiert' });
    const targetBefore = fs.readFileSync(
      path.join(tmpDir, 'locales/de.json'),
      'utf-8'
    );

    process.env['TMS_API_KEY'] = 'env-key';
    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);
    expectTmsPull('de', { greeting: 'Hallo' }, { auth: { apiKey: 'env-key' } });

    const result = await pullTranslations(config, client, harness.registry, {
      dryRun: true,
    });
    expect(result.pulled).toBe(1);
    expect(result.replaced).toBe(1);

    expect(fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8')).toBe(
      targetBefore
    );
    expect(fs.existsSync(path.join(tmpDir, LOCK_FILE_NAME))).toBe(false);
  });

  // ---- Case 2e: retired tms fields fail config load ----
  it.each(['auto_push', 'auto_pull', 'require_review'])(
    'loadSyncConfig rejects tms.%s written in real YAML',
    async (field) => {
      writeSyncConfig(tmpDir, {
        targetLocales: ['de'],
        tms: tmsConfig({
          [field]: field === 'require_review' ? ['de'] : true,
        }),
      });
      writeJson(tmpDir, 'locales/en.json', { greeting: 'Hello' });

      await expect(loadSyncConfig(tmpDir)).rejects.toThrow(ConfigError);
      await expect(loadSyncConfig(tmpDir)).rejects.toThrow(
        `tms.${field} was never implemented and has been removed`
      );
    }
  );

  // ---- Case 3: TMS_API_KEY env var precedence over config ----
  it('credential resolution: TMS_API_KEY env var overrides config.api_key', async () => {
    writeSyncConfig(tmpDir, { tms: tmsConfig({ api_key: 'from-config' }) });
    writeJson(tmpDir, 'locales/en.json', { k: 'Hello' });
    writeJson(tmpDir, 'locales/de.json', { k: 'Hallo' });

    process.env['TMS_API_KEY'] = 'from-env';

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    const scope = expectTmsPush('k', 'de', 'Hallo', {
      auth: { apiKey: 'from-env' },
    });

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
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    const scope = expectTmsPush('k', 'de', 'Hallo', {
      auth: { token: 'the-token' },
    });

    await pushTranslations(config, client, harness.registry);
    expect(scope.isDone()).toBe(true);
  });

  // ---- Case 5: secret-in-config warning ----
  it('credential resolution: emits a stderr warning when api_key is sourced from .deepl-sync.yaml', async () => {
    writeSyncConfig(tmpDir, { tms: tmsConfig({ api_key: 'in-config' }) });

    const warn = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const config = await loadSyncConfig(tmpDir);
      await createTmsClient(config.tms!, approvedTmsTrust);
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/TMS API key found in config file.*TMS_API_KEY/)
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

    await expect(
      client.pushKey('greeting', 'de', 'Hallo')
    ).resolves.toBeUndefined();
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
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    nock(TMS_BASE)
      .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
      .reply(401, { error: 'Unauthorized' });

    await expect(
      pushTranslations(config, client, harness.registry)
    ).rejects.toThrow(ConfigError);
    // Arm the nock scope again (the previous call consumed it) for the second assertion
    nock(TMS_BASE)
      .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
      .reply(401, { error: 'Unauthorized' });
    await expect(
      pushTranslations(config, client, harness.registry)
    ).rejects.toThrow(/TMS authentication failed \(401/);
  });
});

describe('TMS destination trust (real user config store)', () => {
  let tmpDir: string;
  let configDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-tms-trust-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-tms-cfg-'));
    harness = createSyncHarness({ parsers: ['json'] });
    process.env['DEEPL_CONFIG_DIR'] = configDir;
    process.env['TMS_API_KEY'] = 'MUST-NOT-LEAK';
    delete process.env['TMS_TOKEN'];
  });

  afterEach(() => {
    harness.cleanup();
    for (const dir of [tmpDir, configDir]) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    nock.cleanAll();
    process.env = envSnapshot;
  });

  function seedRepo(): void {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeJson(tmpDir, 'locales/en.json', { greeting: 'Hello' });
    writeJson(tmpDir, 'locales/de.json', { greeting: 'Hallo' });
  }

  it('refuses an unapproved host and sends nothing, reading the real user config', async () => {
    seedRepo();
    const scope = expectTmsPush('greeting', 'de', 'Hallo');

    const config = await loadSyncConfig(tmpDir);
    await expect(
      createTmsClient(config.tms!, { canPrompt: () => false })
    ).rejects.toThrow(ConfigError);
    expect(scope.isDone()).toBe(false);
  });

  it('proceeds when the host was pre-approved with deepl config set', async () => {
    new ConfigService().set('tms.allowedServers', [TMS_HOSTNAME]);
    seedRepo();
    const scope = expectTmsPush('greeting', 'de', 'Hallo', {
      auth: { apiKey: 'MUST-NOT-LEAK' },
    });

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, {
      canPrompt: () => false,
    });
    const result = await pushTranslations(config, client, harness.registry);
    expect(result.pushed).toBe(1);
    expect(scope.isDone()).toBe(true);
  });

  it('records an accepted prompt in the user config, outside the repo', async () => {
    seedRepo();
    const config = await loadSyncConfig(tmpDir);
    await createTmsClient(config.tms!, {
      canPrompt: () => true,
      promptForApproval: async () => true,
    });

    expect(new ConfigService().getValue('tms.allowedServers')).toEqual([
      TMS_HOSTNAME,
    ]);
    expect(fs.existsSync(path.join(configDir, 'config.json'))).toBe(true);
    expect(fs.readdirSync(tmpDir)).not.toContain('config.json');
  });

  it('does not prompt again on a later run once approved', async () => {
    seedRepo();
    const config = await loadSyncConfig(tmpDir);
    const promptForApproval = jest.fn(async () => true);
    await createTmsClient(config.tms!, {
      canPrompt: () => true,
      promptForApproval,
    });
    await createTmsClient(config.tms!, {
      canPrompt: () => true,
      promptForApproval,
    });
    expect(promptForApproval).toHaveBeenCalledTimes(1);
  });

  it('records the approval only once when the same host is approved twice', async () => {
    seedRepo();
    const config = await loadSyncConfig(tmpDir);
    for (let i = 0; i < 2; i++) {
      await createTmsClient(config.tms!, {
        canPrompt: () => true,
        promptForApproval: async () => true,
      });
    }
    expect(new ConfigService().getValue('tms.allowedServers')).toEqual([
      TMS_HOSTNAME,
    ]);
  });
});
