/**
 * Integration test for a `.properties` value ending in a backslash.
 *
 * `escapeValue` writes a literal trailing backslash as `\\`, which the reader's
 * continuation test read as "this line continues": the next entry was consumed
 * and its raw `key=value` text appended to the previous value. `sync push`
 * extracts the target file and sends each value to the TMS, so the swallowed
 * line's contents — key name included — left the machine as the translation of
 * the preceding key, and the swallowed key was never pushed at all.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { createTmsClient } from '../../src/sync/tms-client';
import { pushTranslations } from '../../src/sync/sync-tms';
import { loadSyncConfig } from '../../src/sync/sync-config';

import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import {
  TMS_BASE,
  TMS_PROJECT,
  tmsConfig,
  approvedTmsTrust,
} from '../helpers/tms-nock';

function write(dir: string, relPath: string, content: string): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

describe('sync push with a .properties value ending in a backslash', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let envSnapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    envSnapshot = { ...process.env };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-props-'));
    harness = createSyncHarness({ parsers: ['properties'] });
    process.env['TMS_API_KEY'] = 'env-key';
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

  it('pushes every key, and no key carries its neighbour raw text', async () => {
    writeSyncConfig(tmpDir, {
      targetLocales: ['de'],
      tms: tmsConfig(),
      buckets: { properties: { include: ['locales/messages_en.properties'] } },
    });
    write(
      tmpDir,
      'locales/messages_en.properties',
      'greeting=Hello\napi_key=SECRET_VALUE\nfooter=Bye\n'
    );
    // As `escapeValue` would have written it: `Hallo\` escaped to `Hallo\\`.
    write(
      tmpDir,
      'locales/messages_de.properties',
      'greeting=Hallo\\\\\napi_key=SECRET_VALUE\nfooter=Tschuess\n'
    );

    const config = await loadSyncConfig(tmpDir);
    const client = await createTmsClient(config.tms!, approvedTmsTrust);

    const sent: Record<string, string> = {};
    nock(TMS_BASE)
      .put(new RegExp(`/api/projects/${TMS_PROJECT}/keys/.+`))
      .times(3)
      .reply(200, function reply(uri: string, body: unknown) {
        const key = decodeURIComponent(uri.split('/keys/')[1]!);
        sent[key] = (body as { value: string }).value;
        return {};
      });

    const result = await pushTranslations(config, client, harness.registry);

    expect(result.pushed).toBe(3);
    expect(Object.keys(sent).sort()).toEqual(['api_key', 'footer', 'greeting']);
    expect(sent['greeting']).toBe('Hallo\\');
    expect(sent['greeting']).not.toContain('SECRET_VALUE');
    expect(sent['api_key']).toBe('SECRET_VALUE');
  });
});
