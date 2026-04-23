import { exportTranslations } from '../../../src/sync/sync-export';
import type { ResolvedSyncConfig } from '../../../src/sync/sync-config';
import { FormatRegistry } from '../../../src/formats/index';
import { JsonFormatParser } from '../../../src/formats/json';
import fg from 'fast-glob';
import * as fs from 'fs';

jest.mock('fast-glob');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
    },
  };
});

const mockedFg = fg as jest.MockedFunction<typeof fg>;
const mockedReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;

function makeConfig(overrides: Partial<ResolvedSyncConfig> = {}): ResolvedSyncConfig {
  return {
    version: 1,
    source_locale: 'en',
    target_locales: ['de', 'fr'],
    buckets: {
      json: {
        include: ['locales/en/**/*.json'],
      },
    },
    configPath: '/project/.deepl-sync.yaml',
    projectRoot: '/project',
    overrides: {},
    ...overrides,
  };
}

function makeRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  registry.register(new JsonFormatParser());
  return registry;
}

describe('exportTranslations()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should produce valid XLIFF with trans-unit elements containing source text', async () => {
    mockedFg.mockResolvedValue(['/project/locales/en/common.json'] as never);
    mockedReadFile.mockResolvedValue(JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' }));

    const result = await exportTranslations(makeConfig(), makeRegistry());

    expect(result.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result.content).toContain('<xliff version="1.2"');
    expect(result.content).toContain('<trans-unit id="farewell"');
    expect(result.content).toContain('<source>Goodbye</source>');
    expect(result.content).toContain('<trans-unit id="greeting"');
    expect(result.content).toContain('<source>Hello</source>');
  });

  it('should include file path in a note element', async () => {
    mockedFg.mockResolvedValue(['/project/locales/en/common.json'] as never);
    mockedReadFile.mockResolvedValue(JSON.stringify({ key: 'value' }));

    const result = await exportTranslations(makeConfig(), makeRegistry());

    expect(result.content).toContain('<note from="location">locales/en/common.json</note>');
  });

  it('should respect locale filter (only generates <file> for filtered locales)', async () => {
    mockedFg.mockResolvedValue(['/project/locales/en/common.json'] as never);
    mockedReadFile.mockResolvedValue(JSON.stringify({ key: 'value' }));

    const result = await exportTranslations(makeConfig(), makeRegistry(), {
      localeFilter: ['de'],
    });

    expect(result.content).toContain('target-language="de"');
    expect(result.content).not.toContain('target-language="fr"');
  });

  it('should return correct file and key counts', async () => {
    mockedFg.mockResolvedValue([
      '/project/locales/en/common.json',
      '/project/locales/en/other.json',
    ] as never);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify({ a: 'A', b: 'B' }))
      .mockResolvedValueOnce(JSON.stringify({ c: 'C' }));

    const result = await exportTranslations(makeConfig(), makeRegistry());

    expect(result.files).toBe(2);
    expect(result.keys).toBe(3);
  });

  it('should handle empty bucket (no files matched)', async () => {
    mockedFg.mockResolvedValue([] as never);

    const result = await exportTranslations(makeConfig(), makeRegistry());

    expect(result.files).toBe(0);
    expect(result.keys).toBe(0);
    expect(result.content).toContain('<xliff');
    expect(result.content).not.toContain('<trans-unit');
  });
});
