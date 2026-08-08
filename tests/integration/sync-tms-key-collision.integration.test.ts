/**
 * Integration tests for a key collision in a TMS pull's target file.
 *
 * pullTranslations reads the existing target file to keep local translations the
 * export does not carry. That read is wrapped in a catch whose fallback is the
 * source content — correct for "target does not exist yet", ruinous for a file
 * that parses but cannot be keyed, since rebuilding from source discards every
 * local translation. A collision therefore has to leave the file untouched
 * rather than reach either the merge or the fallback.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { createTmsClient } from '../../src/sync/tms-client';
import { pullTranslations } from '../../src/sync/sync-tms';
import { loadSyncConfig } from '../../src/sync/sync-config';
import { Logger } from '../../src/utils/logger';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import {
  expectTmsPull,
  tmsConfig,
  approvedTmsTrust,
} from '../helpers/tms-nock';

function writeFile(dir: string, relPath: string, content: string): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

describe('sync pull with a colliding target file', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-collide-'));
    harness = createSyncHarness({ parsers: ['json'] });
    delete process.env['TMS_API_KEY'];
    delete process.env['TMS_TOKEN'];
    process.env['TMS_API_KEY'] = 'env-key';
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
    process.env = envSnapshot;
  });

  it('leaves the target file byte-identical and records a key_collision skip', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeFile(
      tmpDir,
      'locales/en.json',
      JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' }, null, 2) + '\n'
    );
    // Parses, but `a.b` names both the flat key and the nested path.
    const hostileTarget =
      JSON.stringify(
        {
          greeting: 'Hallo (hand-written)',
          'a.b': 'FLAT',
          a: { b: 'NESTED' },
        },
        null,
        2
      ) + '\n';
    writeFile(tmpDir, 'locales/de.json', hostileTarget);

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);
    const pullScope = expectTmsPull(
      'de',
      { greeting: 'Hallo (from TMS)' },
      { auth: { apiKey: 'env-key' } }
    );

    const warnings: string[] = [];
    jest.spyOn(Logger, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.join(' '));
    });

    const result = await pullTranslations(config, client, harness.registry);

    expect(pullScope.isDone()).toBe(true);
    expect(result.pulled).toBe(0);
    expect(result.skipped).toEqual([
      { file: 'locales/en.json', locale: 'de', reason: 'key_collision' },
    ]);
    expect(warnings.join('\n')).toContain('Skipping locales/de.json');

    expect(fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8')).toBe(
      hostileTarget
    );
  });

  it('still pulls into a target file whose keys are distinct', async () => {
    writeSyncConfig(tmpDir, { targetLocales: ['de'], tms: tmsConfig() });
    writeFile(
      tmpDir,
      'locales/en.json',
      JSON.stringify({ greeting: 'Hello' }, null, 2) + '\n'
    );
    writeFile(
      tmpDir,
      'locales/de.json',
      JSON.stringify({ greeting: 'ALT' }, null, 2) + '\n'
    );

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);
    expectTmsPull(
      'de',
      { greeting: 'Hallo (from TMS)' },
      { auth: { apiKey: 'env-key' } }
    );

    const result = await pullTranslations(config, client, harness.registry);

    expect(result.pulled).toBe(1);
    expect(result.skipped).toEqual([]);
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'locales/de.json'), 'utf-8')
    ) as Record<string, string>;
    expect(written['greeting']).toBe('Hallo (from TMS)');
  });
});
