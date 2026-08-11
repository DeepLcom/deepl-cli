/**
 * Integration tests for a `deepl sync` run over a target file it cannot read.
 *
 * The pre-read of each locale's file used to swallow every failure as "this
 * locale has no existing translations", which cannot tell a locale that has
 * never been synced from one whose file is on disk and unreadable. For the
 * second case the run re-translated and re-billed every key and then wrote the
 * result over the file — and the lockfile stores hashes rather than translated
 * text, so that file was the only copy of the translations it replaced.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import nock from 'nock';

import { loadSyncConfig } from '../../src/sync/sync-config';
import { validateTranslations } from '../../src/sync/sync-validate';
import { Logger } from '../../src/utils/logger';
import { createSyncHarness, writeSyncConfig } from '../helpers/sync-harness';
import { DEEPL_FREE_API_URL } from '../helpers/nock-setup';

const SOURCE =
  JSON.stringify({ greeting: 'Hello', added: 'Translate me' }, null, 2) + '\n';

/** Parses as JSON, but `menu.save` names both the flat key and the nested path. */
const COLLIDING_TARGET =
  JSON.stringify(
    {
      greeting: 'REVIEWED Hola',
      added: 'REVIEWED Traduceme',
      'menu.save': 'FLAT',
      menu: { save: 'NESTED' },
    },
    null,
    2
  ) + '\n';

describe('sync over a target file that cannot be read', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;
  let errors: string[];
  let warnings: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-unusable-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    const sourcePath = path.join(tmpDir, 'locales', 'en.json');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, SOURCE, 'utf-8');
    errors = [];
    warnings = [];
    jest.spyOn(Logger, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
    jest.spyOn(Logger, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.join(' '));
    });
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    nock.cleanAll();
  });

  function targetPath(): string {
    return path.join(tmpDir, 'locales', 'es.json');
  }

  function replyTranslating(times = 4): nock.Scope {
    return nock(DEEPL_FREE_API_URL)
      .post('/v2/translate')
      .times(times)
      .reply(200, (_uri, body) => {
        const parsed = new URLSearchParams(body as string);
        return {
          translations: parsed.getAll('text').map((t) => ({
            text: `[es]${t}`,
            detected_source_language: 'EN',
            billed_characters: t.length,
          })),
        };
      });
  }

  /** A healthy project, then the target replaced by one the parser refuses. */
  async function damage(content = COLLIDING_TARGET): Promise<void> {
    replyTranslating();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));
    fs.writeFileSync(targetPath(), content, 'utf-8');
  }

  it('leaves the file byte-identical instead of rebuilding it', async () => {
    await damage();
    replyTranslating();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(COLLIDING_TARGET);
  });

  it('bills nothing for a locale whose translations it cannot read', async () => {
    await damage();
    const scope = replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.totalCharactersBilled).toBe(0);
    expect(scope.isDone()).toBe(false);
  });

  it('fails the locale and names the file and the reason', async () => {
    await damage();
    replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const es = result.fileResults.find((r) => r.locale === 'es')!;
    expect(es.translated).toBe(0);
    expect(es.failed).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('locales/es.json');
    expect(errors.join('\n')).toContain(
      "'menu.save' is the key of two different strings"
    );
  });

  it('records a key the source has just gained as failed, not translated', async () => {
    await damage();
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'en.json'),
      JSON.stringify(
        { greeting: 'Hello', added: 'Translate me', fresh: 'Good morning' },
        null,
        2
      ) + '\n',
      'utf-8'
    );
    replyTranslating();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    const lock = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
    ) as {
      entries: Record<
        string,
        Record<string, { translations: Record<string, { status: string }> }>
      >;
    };
    expect(
      lock.entries['locales/en.json']!['fresh']!.translations['es']!.status
    ).toBe('failed');
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(COLLIDING_TARGET);
  });

  it('leaves a target file that is on disk but unreadable alone', async () => {
    await damage(SOURCE);
    fs.chmodSync(targetPath(), 0o000);
    const scope = replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    fs.chmodSync(targetPath(), 0o644);
    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(SOURCE);
    expect(result.totalCharactersBilled).toBe(0);
    expect(scope.isDone()).toBe(false);
  });

  it('is left out of the --dry-run estimate, which the real run bills nothing for', async () => {
    await damage();
    // A key the source has just gained, so there is work to estimate.
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'en.json'),
      JSON.stringify(
        { greeting: 'Hello', added: 'Translate me', fresh: 'Good morning' },
        null,
        2
      ) + '\n',
      'utf-8'
    );

    const dry = await harness.syncService.sync(await loadSyncConfig(tmpDir), {
      dryRun: true,
    });

    // es is the only locale, and the real run refuses it and bills 0.
    expect(dry.estimatedCharacters).toBe(0);
  });

  it('is named by --dry-run rather than left for the real run to discover', async () => {
    await damage();

    await harness.syncService.sync(await loadSyncConfig(tmpDir), {
      dryRun: true,
    });

    const said = warnings.join('\n');
    expect(said).toContain('locales/es.json');
    expect(said).toContain("'menu.save' is the key of two different strings");
  });

  it('writes nothing while reporting the unreadable target', async () => {
    await damage();
    const before = fs.readFileSync(targetPath(), 'utf-8');
    const lockBefore = fs.readFileSync(
      path.join(tmpDir, '.deepl-sync.lock'),
      'utf-8'
    );

    await harness.syncService.sync(await loadSyncConfig(tmpDir), {
      dryRun: true,
    });

    expect(fs.readFileSync(targetPath(), 'utf-8')).toBe(before);
    expect(
      fs.readFileSync(path.join(tmpDir, '.deepl-sync.lock'), 'utf-8')
    ).toBe(lockBefore);
  });

  // Over-rejection guards: absent is not unusable, and a file that reads fine is
  // still repaired.
  it('leaves a healthy project --dry-run estimate and output alone', async () => {
    replyTranslating();
    await harness.syncService.sync(await loadSyncConfig(tmpDir));
    fs.writeFileSync(
      path.join(tmpDir, 'locales', 'en.json'),
      JSON.stringify(
        { greeting: 'Hello', added: 'Translate me', fresh: 'Good morning' },
        null,
        2
      ) + '\n',
      'utf-8'
    );

    const dry = await harness.syncService.sync(await loadSyncConfig(tmpDir), {
      dryRun: true,
    });

    expect(dry.estimatedCharacters).toBe('Good morning'.length);
    expect(dry.unwrittenKeys).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('still writes a locale that has never been synced', async () => {
    replyTranslating();

    const result = await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(result.totalCharactersBilled).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(targetPath(), 'utf-8'))).toEqual({
      greeting: '[es]Hello',
      added: '[es]Translate me',
    });
  });

  it('still repairs a readable target that lost a key', async () => {
    await damage(JSON.stringify({ greeting: '[es]Hello' }, null, 2) + '\n');
    replyTranslating();

    await harness.syncService.sync(await loadSyncConfig(tmpDir));

    expect(JSON.parse(fs.readFileSync(targetPath(), 'utf-8'))).toEqual({
      greeting: '[es]Hello',
      added: '[es]Translate me',
    });
  });
});

describe('sync validate over a target file that cannot be read', () => {
  let tmpDir: string;
  let harness: ReturnType<typeof createSyncHarness>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-validate-unusable-'));
    harness = createSyncHarness({ parsers: ['json'] });
    writeSyncConfig(tmpDir, {
      targetLocales: ['es', 'fr'],
      buckets: { json: { include: ['locales/en.json'] } },
    });
    const dir = path.join(tmpDir, 'locales');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'en.json'),
      JSON.stringify({ greeting: 'Hello {name}' }, null, 2) + '\n',
      'utf-8'
    );
  });

  afterEach(() => {
    harness.cleanup();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function write(locale: string, content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'locales', `${locale}.json`), content);
  }

  it('reports the unreadable file as an error and still validates the other locale', async () => {
    // es drops the placeholder, so a validated es proves the walk went on.
    write('es', JSON.stringify({ greeting: 'Hola' }, null, 2) + '\n');
    write('fr', '{ "greeting": "Bonjour {name}", %%% not json');

    const result = await validateTranslations(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    const frIssue = result.issues.find((i) => i.locale === 'fr');
    expect(frIssue).toBeDefined();
    expect(frIssue!.severity).toBe('error');
    expect(frIssue!.issues[0]!.check).toBe('unusable_target');
    expect(frIssue!.issues[0]!.message).toContain('locales/fr.json');
    expect(frIssue!.issues[0]!.message).toContain('not validated');

    const esIssue = result.issues.find((i) => i.locale === 'es');
    expect(esIssue).toBeDefined();
    expect(esIssue!.issues[0]!.message).toContain('{name}');

    expect(result.totalChecked).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.errors).toBe(2);
  });

  it('still skips a locale with no target file at all', async () => {
    write('es', JSON.stringify({ greeting: 'Hola {name}' }, null, 2) + '\n');

    const result = await validateTranslations(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    expect(result.issues).toEqual([]);
    expect(result.totalChecked).toBe(1);
    expect(result.passed).toBe(1);
  });

  it('leaves a healthy project result unchanged', async () => {
    write('es', JSON.stringify({ greeting: 'Hola {name}' }, null, 2) + '\n');
    write('fr', JSON.stringify({ greeting: 'Bonjour {name}' }, null, 2) + '\n');

    const result = await validateTranslations(
      await loadSyncConfig(tmpDir),
      harness.registry
    );

    expect(result).toEqual({
      totalChecked: 2,
      passed: 2,
      warnings: 0,
      errors: 0,
      issues: [],
    });
  });
});
