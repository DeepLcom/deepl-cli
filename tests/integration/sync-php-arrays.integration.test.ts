/**
 * Integration test: fixture-driven Laravel PHP round-trip through the
 * sync bucket walker.
 *
 * Exercises real filesystem reads against the 15-fixture corpus under
 * tests/fixtures/sync/formats/laravel-php. Verifies the walker's partition
 * into translatable + skipped entries, file-size + depth cap handling, and
 * the byte-equal reconstruct gate on non-collision fixtures. Complements
 * the unit-level assertions in tests/unit/formats/php-arrays.test.ts by
 * proving the same guarantees hold through the walker's config-resolution
 * path (glob, cap injection, parser re-instantiation for custom max_depth).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.unmock('fast-glob');

import { walkBuckets } from '../../src/sync/sync-bucket-walker';
import { FormatRegistry } from '../../src/formats/index';
import { PhpArraysFormatParser } from '../../src/formats/php-arrays';
import type { ResolvedSyncConfig } from '../../src/sync/sync-config';

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/sync/formats/laravel-php');

function makeRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  registry.register(new PhpArraysFormatParser());
  return registry;
}

function makeConfig(projectRoot: string, overrides: Partial<ResolvedSyncConfig> = {}): ResolvedSyncConfig {
  return {
    version: 1,
    source_locale: 'en',
    target_locales: ['de'],
    buckets: { laravel_php: { include: ['*.php'] } },
    configPath: path.join(projectRoot, '.deepl-sync.yaml'),
    projectRoot,
    overrides: {},
    ...overrides,
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('sync-php-arrays corpus integration', () => {
  let projectRoot: string;

  // Copies accept-class fixtures into a temp project root so the walker's
  // glob resolves against a realistic layout (not the source-tree fixtures
  // directory which holds reject-class fixtures alongside).
  const ACCEPT_FIXTURES = [
    '01-single-quote-escape.php',
    '02-double-quote-escapes.php',
    '06-mixed-syntax.php',
    '07-colon-placeholder.php',
    '08-trailing-commas.php',
    '09-ast-idempotence.php',
    '10-empty-nested-array.php',
    '12-escaped-dollar.php',
    '13-utf8-bom.php',
    '14-literal-pipe-in-prose.php',
    '15-irregular-whitespace-and-comments.php',
  ];

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-sync-laravel-'));
    for (const name of ACCEPT_FIXTURES) {
      fs.copyFileSync(path.join(CORPUS_DIR, name), path.join(projectRoot, name));
    }
  });

  afterEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('walks the full accept corpus through walkBuckets with no extract errors', async () => {
    const result = await collect(walkBuckets(makeConfig(projectRoot), makeRegistry()));
    expect(result).toHaveLength(ACCEPT_FIXTURES.length);
    for (const walked of result) {
      expect(walked.bucket).toBe('laravel_php');
      expect(walked.parser.configKey).toBe('laravel_php');
    }
  });

  it('byte-equal reconstruct on every walked file when translations equal source', async () => {
    const result = await collect(walkBuckets(makeConfig(projectRoot), makeRegistry()));
    for (const walked of result) {
      const translations = walked.entries.map((e) => ({ ...e, translation: e.value }));
      expect(walked.parser.reconstruct(walked.content, translations)).toBe(walked.content);
    }
  });

  it('tags no entries as skipped for any corpus fixture (no pipe-pluralization in 01-15)', async () => {
    const result = await collect(walkBuckets(makeConfig(projectRoot), makeRegistry()));
    for (const walked of result) {
      expect(walked.skippedEntries).toEqual([]);
    }
  });

  it('honors sync.limits.max_file_bytes by skipping an oversize file', async () => {
    const bigPath = path.join(projectRoot, 'big.php');
    const padding = 'x'.repeat(5000);
    fs.writeFileSync(
      bigPath,
      `<?php\n// ${padding}\nreturn ['a' => 'Hello'];\n`,
      'utf-8',
    );

    const config = makeConfig(projectRoot, {
      sync: {
        concurrency: 5,
        batch_size: 50,
        limits: { max_file_bytes: 1000 },
      },
    });
    const result = await collect(walkBuckets(config, makeRegistry()));
    expect(result.some((w) => w.sourceFile === bigPath)).toBe(false);
  });

  it('instantiates laravel_php with an override max_depth when sync.limits.max_depth is set', async () => {
    // Shallow cap forces all fixtures that have ≥2 levels of nesting
    // (06, 08, 09, 10, 15) to be skipped via PhpArraysCapExceededError.
    const config = makeConfig(projectRoot, {
      sync: {
        concurrency: 5,
        batch_size: 50,
        limits: { max_depth: 1 },
      },
    });
    const result = await collect(walkBuckets(config, makeRegistry()));
    const remaining = result.map((w) => path.basename(w.sourceFile)).sort();
    // Only files whose return array has no nested arrays survive maxDepth=1:
    // 01, 02, 07, 12, 13, 14. Files 06/08/09/10/15 get skipped.
    expect(remaining).toEqual(
      [
        '01-single-quote-escape.php',
        '02-double-quote-escapes.php',
        '07-colon-placeholder.php',
        '12-escaped-dollar.php',
        '13-utf8-bom.php',
        '14-literal-pipe-in-prose.php',
      ].sort(),
    );
  });
});
