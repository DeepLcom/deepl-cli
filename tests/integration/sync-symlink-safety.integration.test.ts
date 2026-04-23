/**
 * Security integration tests: sync push/pull/export/validate must refuse to
 * follow symbolic links when scanning source files via fast-glob.
 *
 * A malicious symlink committed in a repo (e.g., `locales/en.json` -> `/etc/passwd`
 * or SSH keys) would otherwise be silently followed and its contents shipped to
 * the TMS server, embedded in an exported XLIFF, or surfaced in validator error
 * messages. sync-service.ts and sync-context.ts already pass
 * `followSymbolicLinks: false` to fast-glob; these tests lock in the same
 * policy for push, pull, export, and validate.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { createTmsClient } from '../../src/sync/tms-client';
import { pushTranslations, pullTranslations } from '../../src/sync/sync-tms';
import { exportTranslations } from '../../src/sync/sync-export';
import { validateTranslations } from '../../src/sync/sync-validate';
import { loadSyncConfig } from '../../src/sync/sync-config';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { expectTmsPush, expectTmsPull, tmsConfig } from '../helpers/tms-nock';

function writeJson(dir: string, relPath: string, obj: unknown): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

/**
 * Create a symlink inside the project that points at a file OUTSIDE the
 * project root. Returns the path to the outside-the-root target so tests can
 * assert it was never read.
 *
 * Skips the test (not fails) on systems that cannot create symlinks (e.g.,
 * Windows without developer mode).
 */
function trySymlink(linkPath: string, targetPath: string): boolean {
  try {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(targetPath, linkPath);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'ENOSYS') return false;
    throw err;
  }
}

describe('sync symlink safety (push/pull/export/validate)', () => {
  let projectDir: string;
  let outsideDir: string;
  let outsideSecret: string;
  let harness: ReturnType<typeof createSyncHarness>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-symlink-proj-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-symlink-secret-'));
    outsideSecret = path.join(outsideDir, 'secret.json');
    fs.writeFileSync(
      outsideSecret,
      JSON.stringify({ exfiltrated: 'TOP_SECRET_VALUE' }, null, 2),
      'utf-8',
    );
    harness = createSyncHarness({ parsers: ['json'] });
    delete process.env['TMS_API_KEY'];
    delete process.env['TMS_TOKEN'];
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
    if (fs.existsSync(outsideDir)) fs.rmSync(outsideDir, { recursive: true, force: true });
    nock.cleanAll();
    process.env = { ...originalEnv };
  });

  it('push: refuses to follow a symlink pointing outside the project root; real siblings still pushed', async () => {
    // Project layout:
    //   locales/en.json             -- real source
    //   locales/de.json             -- real target (pushed)
    //   locales/secrets/en.json     -- SYMLINK -> outside secret
    //   locales/secrets/de.json     -- real file with "exfiltrated" key
    //
    // If sync-tms.ts FOLLOWS the symlink, fast-glob returns both en.json files.
    // For each source, push reads its target-locale sibling (de.json in same
    // dir) and pushes those keys. So "exfiltrated" would hit the wire.
    //
    // With followSymbolicLinks:false, the symlinked locales/secrets/en.json is
    // silently skipped and only greeting is pushed.
    if (!trySymlink(path.join(projectDir, 'locales', 'secrets', 'en.json'), outsideSecret)) return;
    writeJson(projectDir, 'locales/en.json', { greeting: 'Hello' });
    writeJson(projectDir, 'locales/de.json', { greeting: 'Hallo' });
    writeJson(projectDir, 'locales/secrets/de.json', { exfiltrated: 'SHOULD_NOT_PUSH' });
    writeSyncConfig(projectDir, {
      targetLocales: ['de'],
      buckets: { json: { include: ['locales/**/en.json'] } },
      tms: tmsConfig(),
    });
    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(projectDir);
    const client = createTmsClient(config.tms!);

    // Only the real file's key is expected on the wire; the symlinked secret
    // must not be read or transmitted.
    const scope = expectTmsPush('greeting', 'de', 'Hallo', { auth: { apiKey: 'env-key' } });

    const result = await pushTranslations(config, client, harness.registry);
    expect(result.pushed).toBe(1);
    expect(scope.isDone()).toBe(true);
    // No request was made for an "exfiltrated" key.
    expect(nock.pendingMocks()).toEqual([]);
  });

  it('pull: does not treat a symlink as a source file when scanning for locale targets', async () => {
    if (!trySymlink(path.join(projectDir, 'locales', 'secrets', 'en.json'), outsideSecret)) return;
    writeJson(projectDir, 'locales/en.json', { greeting: 'Hello' });
    writeSyncConfig(projectDir, {
      targetLocales: ['de'],
      buckets: { json: { include: ['locales/**/en.json'] } },
      tms: tmsConfig(),
    });
    process.env['TMS_API_KEY'] = 'env-key';

    const config = await loadSyncConfig(projectDir);
    const client = createTmsClient(config.tms!);

    // The TMS server returns translations for BOTH "greeting" and
    // "exfiltrated". If the symlinked source is read, pullTranslations will
    // write locales/secrets/de.json containing the exfiltrated value. With
    // the symlink skipped, only locales/de.json is written.
    const pullScope = expectTmsPull(
      'de',
      { greeting: 'Hallo', exfiltrated: 'SHOULD_NEVER_APPEAR' },
      { auth: { apiKey: 'env-key' } },
    );

    const result = await pullTranslations(config, client, harness.registry);
    expect(pullScope.isDone()).toBe(true);
    expect(result.pulled).toBe(1);

    // The target file derived from the symlink (locales/secrets/de.json) must
    // never have been written.
    expect(fs.existsSync(path.join(projectDir, 'locales', 'secrets', 'de.json'))).toBe(false);
  });

  it('export: does not embed symlinked-file contents in XLIFF output', async () => {
    if (!trySymlink(path.join(projectDir, 'locales', 'secrets', 'en.json'), outsideSecret)) return;
    writeJson(projectDir, 'locales/en.json', { greeting: 'Hello' });
    writeSyncConfig(projectDir, {
      targetLocales: ['de'],
      buckets: { json: { include: ['locales/**/en.json'] } },
    });

    const config = await loadSyncConfig(projectDir);
    const result = await exportTranslations(config, harness.registry);

    expect(result.content).not.toContain('TOP_SECRET_VALUE');
    expect(result.content).not.toContain('exfiltrated');
    expect(result.content).toContain('greeting');
    expect(result.files).toBe(1);
  });

  it('validate: does not scan symlinked files when enumerating sources', async () => {
    // The symlinked source file contains placeholders that, if read and
    // validated, would surface in the issues list (mismatched placeholder
    // count vs. the target file).
    const maliciousSource = path.join(outsideDir, 'malicious-source.json');
    fs.writeFileSync(
      maliciousSource,
      JSON.stringify({ greeting: 'LEAKED %s %d %x' }, null, 2),
      'utf-8',
    );
    if (!trySymlink(path.join(projectDir, 'locales', 'secrets', 'en.json'), maliciousSource)) return;
    writeJson(projectDir, 'locales/en.json', { greeting: 'Hello %s' });
    writeJson(projectDir, 'locales/de.json', { greeting: 'Hallo %s' });
    // Target for the symlinked "source" -- no placeholder mismatches here so
    // the only way to produce an issue tagged with "secrets" is to have read
    // the symlinked source.
    writeJson(projectDir, 'locales/secrets/de.json', { greeting: 'harmless' });
    writeSyncConfig(projectDir, {
      targetLocales: ['de'],
      buckets: { json: { include: ['locales/**/en.json'] } },
    });

    const config = await loadSyncConfig(projectDir);
    const result = await validateTranslations(config, harness.registry);

    // The symlinked source must not appear anywhere in the issues list nor
    // contribute to totalChecked beyond the single real en.json entry.
    expect(result.totalChecked).toBe(1);
    for (const issue of result.issues) {
      expect(issue.file).not.toContain('secrets');
    }
  });
});
