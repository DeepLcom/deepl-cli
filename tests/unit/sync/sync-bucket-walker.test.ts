import { extractTranslatable, walkBuckets } from '../../../src/sync/sync-bucket-walker';
import type { ExtractedEntry, FormatParser } from '../../../src/formats/index';
import { FormatRegistry } from '../../../src/formats/index';
import { JsonFormatParser } from '../../../src/formats/json';
import type { ResolvedSyncConfig } from '../../../src/sync/sync-config';
import { ValidationError } from '../../../src/utils/errors';

jest.mock('fast-glob', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
      stat: jest.fn(),
    },
  };
});

import fg from 'fast-glob';
import * as fs from 'fs';

const mockFg = fg as jest.MockedFunction<typeof fg>;
const mockReadFile = fs.promises.readFile as jest.Mock;
const mockStat = fs.promises.stat as jest.Mock;

function makeConfig(overrides: Partial<ResolvedSyncConfig> = {}): ResolvedSyncConfig {
  return {
    version: 1,
    source_locale: 'en',
    target_locales: ['de'],
    buckets: { json: { include: ['locales/en.json'] } },
    configPath: '/test/.deepl-sync.yaml',
    projectRoot: '/test',
    overrides: {},
    ...overrides,
  };
}

function makeRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  registry.register(new JsonFormatParser());
  return registry;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('walkBuckets', () => {
  beforeEach(() => {
    mockFg.mockReset();
    mockReadFile.mockReset();
    mockStat.mockReset();
    mockStat.mockResolvedValue({ size: 1024 });
  });

  it('yields one entry per source file with parsed entries', async () => {
    mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
    mockReadFile.mockResolvedValue('{"greeting":"Hello"}');

    const result = await collect(walkBuckets(makeConfig(), makeRegistry()));

    expect(result).toHaveLength(1);
    expect(result[0]!.bucket).toBe('json');
    expect(result[0]!.relPath).toBe('locales/en.json');
    expect(result[0]!.entries).toEqual([{ key: 'greeting', value: 'Hello' }]);
    expect(result[0]!.skippedEntries).toEqual([]);
    expect(result[0]!.isMultiLocale).toBe(false);
  });

  it('partitions entries tagged with metadata.skipped into skippedEntries', async () => {
    mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
    mockReadFile.mockResolvedValue('{}');

    const stubRegistry = new FormatRegistry();
    stubRegistry.register({
      name: 'Stub',
      configKey: 'json',
      extensions: ['.json'],
      extract: () => [
        { key: 'a', value: 'Hello' },
        { key: 'b', value: '{0}none|{1}one|[2,*]many', metadata: { skipped: { reason: 'pipe_pluralization' } } },
        { key: 'c', value: 'Goodbye' },
      ],
      reconstruct: (content: string) => content,
    });

    const result = await collect(walkBuckets(makeConfig(), stubRegistry));

    expect(result[0]!.entries.map((e) => e.key)).toEqual(['a', 'c']);
    expect(result[0]!.skippedEntries.map((e) => e.key)).toEqual(['b']);
  });

  it('calls fast-glob with followSymbolicLinks:false (symlink-exfil defense)', async () => {
    mockFg.mockResolvedValue([] as never);
    await collect(walkBuckets(makeConfig(), makeRegistry()));

    expect(mockFg).toHaveBeenCalledWith(
      ['locales/en.json'],
      expect.objectContaining({ followSymbolicLinks: false }),
    );
  });

  it('skips buckets with no registered parser when strictParser is unset', async () => {
    mockFg.mockResolvedValue([] as never);
    const config = makeConfig({ buckets: { xliff: { include: ['x.xlf'] } } });
    const emptyRegistry = new FormatRegistry();

    const result = await collect(walkBuckets(config, emptyRegistry));

    expect(result).toHaveLength(0);
  });

  it('throws ValidationError on missing parser when strictParser is set', async () => {
    const config = makeConfig({ buckets: { xliff: { include: ['x.xlf'] } } });
    const emptyRegistry = new FormatRegistry();

    await expect(
      collect(walkBuckets(config, emptyRegistry, { strictParser: true })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  describe('sync.limits enforcement', () => {
    it('skips files whose size exceeds sync.limits.max_file_bytes', async () => {
      mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
      mockStat.mockResolvedValue({ size: 5_000_000 });

      const config = makeConfig({
        sync: {
          concurrency: 5,
          batch_size: 50,
          limits: { max_file_bytes: 4_000_000 },
        },
      });
      const result = await collect(walkBuckets(config, makeRegistry()));

      expect(result).toHaveLength(0);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('skips files whose entry count exceeds sync.limits.max_entries_per_file', async () => {
      mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
      const bigObj: Record<string, string> = {};
      for (let i = 0; i < 6; i++) bigObj[`k${i}`] = `v${i}`;
      mockReadFile.mockResolvedValue(JSON.stringify(bigObj));

      const config = makeConfig({
        sync: {
          concurrency: 5,
          batch_size: 50,
          limits: { max_entries_per_file: 5 },
        },
      });
      const result = await collect(walkBuckets(config, makeRegistry()));

      expect(result).toHaveLength(0);
    });

    it('passes through files within the configured caps', async () => {
      mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
      mockStat.mockResolvedValue({ size: 100 });
      mockReadFile.mockResolvedValue('{"a":"Hello"}');

      const config = makeConfig({
        sync: {
          concurrency: 5,
          batch_size: 50,
          limits: { max_file_bytes: 1024, max_entries_per_file: 10 },
        },
      });
      const result = await collect(walkBuckets(config, makeRegistry()));

      expect(result).toHaveLength(1);
      expect(result[0]!.entries).toEqual([{ key: 'a', value: 'Hello' }]);
    });

    it('skips entire bucket when glob returns more files than sync.limits.max_source_files', async () => {
      mockFg.mockResolvedValue(Array.from({ length: 10 }, (_, i) => `/test/locales/en/${i}.json`));

      const config = makeConfig({
        sync: {
          concurrency: 5,
          batch_size: 50,
          limits: { max_source_files: 3 },
        },
      });
      const result = await collect(walkBuckets(config, makeRegistry()));

      expect(result).toHaveLength(0);
      expect(mockStat).not.toHaveBeenCalled();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('processes the bucket when file count equals max_source_files', async () => {
      mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
      mockStat.mockResolvedValue({ size: 100 });
      mockReadFile.mockResolvedValue('{"a":"Hello"}');

      const config = makeConfig({
        sync: {
          concurrency: 5,
          batch_size: 50,
          limits: { max_source_files: 1 },
        },
      });
      const result = await collect(walkBuckets(config, makeRegistry()));

      expect(result).toHaveLength(1);
    });

    it('skips files where a laravel_php parser depth cap is exceeded', async () => {
      mockFg.mockResolvedValue(['/test/lang/en.php'] as never);
      mockStat.mockResolvedValue({ size: 200 });
      mockReadFile.mockResolvedValue(
        `<?php return ['a' => ['b' => ['c' => ['d' => 'too deep']]]];`,
      );

      const { PhpArraysFormatParser } = await import('../../../src/formats/php-arrays');
      const registry = new FormatRegistry();
      registry.register(new PhpArraysFormatParser());

      const config = makeConfig({
        buckets: { laravel_php: { include: ['lang/en.php'] } },
        sync: {
          concurrency: 5,
          batch_size: 50,
          limits: { max_depth: 2 },
        },
      });
      const result = await collect(walkBuckets(config, registry));

      expect(result).toHaveLength(0);
    });
  });
});

describe('extractTranslatable', () => {
  function makeParser(
    entries: ExtractedEntry[],
    opts: { multiLocale?: boolean } = {},
  ): FormatParser {
    return {
      multiLocale: opts.multiLocale,
      extract: jest.fn((_content: string, _locale?: string) => entries),
      reconstruct: jest.fn(),
      format: 'json',
    } as unknown as FormatParser;
  }

  it('drops entries tagged with metadata.skipped from the returned list', () => {
    const parser = makeParser([
      { key: 'greeting', value: 'Hello' },
      { key: 'plural', value: '|{n} item', metadata: { skipped: 'pipe_pluralization' } },
      { key: 'farewell', value: 'Goodbye' },
    ]);
    const result = extractTranslatable(parser, '<content>');
    expect(result.map((e) => e.key)).toEqual(['greeting', 'farewell']);
  });

  it('forwards locale to the parser only when multiLocale is true', () => {
    const parser = makeParser([], { multiLocale: true });
    extractTranslatable(parser, '<content>', 'de');
    expect(parser.extract).toHaveBeenCalledWith('<content>', 'de');
  });

  it('omits locale argument for non-multiLocale parsers', () => {
    const parser = makeParser([], { multiLocale: false });
    extractTranslatable(parser, '<content>', 'de');
    expect(parser.extract).toHaveBeenCalledWith('<content>');
  });

  it('returns an empty array when every entry is skipped', () => {
    const parser = makeParser([
      { key: 'a', value: '|x', metadata: { skipped: 'pipe_pluralization' } },
      { key: 'b', value: '|y', metadata: { skipped: 'pipe_pluralization' } },
    ]);
    expect(extractTranslatable(parser, '<content>')).toEqual([]);
  });
});
