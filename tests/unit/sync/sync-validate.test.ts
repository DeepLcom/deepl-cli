import { validateTranslations } from '../../../src/sync/sync-validate';
import type { ResolvedSyncConfig } from '../../../src/sync/sync-config';
import type { FormatParser, FormatRegistry, ExtractedEntry } from '../../../src/formats/index';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    access: jest.fn(),
  },
}));
jest.mock('fast-glob', () => jest.fn());

import * as fs from 'fs';
import fg from 'fast-glob';

const mockFg = fg as jest.MockedFunction<typeof fg>;
const mockReadFile = fs.promises.readFile as jest.MockedFunction<typeof fs.promises.readFile>;
const mockAccess = fs.promises.access as jest.MockedFunction<typeof fs.promises.access>;

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
  } as ResolvedSyncConfig;
}

function makeParser(sourceEntries: ExtractedEntry[], targetEntries: ExtractedEntry[]): FormatParser {
  const extract = jest.fn()
    .mockReturnValueOnce(sourceEntries)
    .mockReturnValueOnce(targetEntries);
  return { name: 'JSON', configKey: 'json', extensions: ['.json'], extract, reconstruct: jest.fn() };
}

function makeRegistry(parser: FormatParser): FormatRegistry {
  return {
    getParser: jest.fn().mockReturnValue(parser),
    getParserByFormatKey: jest.fn().mockReturnValue(parser),
    register: jest.fn(),
    getSupportedExtensions: jest.fn(),
    getFormatKeys: jest.fn().mockReturnValue([parser.configKey]),
  } as unknown as FormatRegistry;
}

describe('validateTranslations', () => {
  beforeEach(() => {
    mockFg.mockResolvedValue(['/test/locales/en.json'] as never);
    mockAccess.mockResolvedValue(undefined);
  });

  it('should pass when all translations preserve placeholders', async () => {
    const source = [{ key: 'greeting', value: 'Hello {name}' }] as ExtractedEntry[];
    const target = [{ key: 'greeting', value: 'Hallo {name}' }] as ExtractedEntry[];
    mockReadFile.mockResolvedValueOnce('source').mockResolvedValueOnce('target');
    const parser = makeParser(source, target);
    const result = await validateTranslations(makeConfig(), makeRegistry(parser));
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.passed).toBe(1);
  });

  it('should detect missing placeholder as error', async () => {
    const source = [{ key: 'greeting', value: 'Hello {name}' }] as ExtractedEntry[];
    const target = [{ key: 'greeting', value: 'Hallo' }] as ExtractedEntry[];
    mockReadFile.mockResolvedValueOnce('source').mockResolvedValueOnce('target');
    const parser = makeParser(source, target);
    const result = await validateTranslations(makeConfig(), makeRegistry(parser));
    expect(result.errors).toBeGreaterThan(0);
  });

  it('should count warnings and errors separately', async () => {
    const source = [
      { key: 'a', value: 'Hello {name}' },
      { key: 'b', value: 'OK' },
    ] as ExtractedEntry[];
    const target = [
      { key: 'a', value: 'Hallo' },
      { key: 'b', value: 'OK' },
    ] as ExtractedEntry[];
    mockReadFile.mockResolvedValueOnce('source').mockResolvedValueOnce('target');
    const parser = makeParser(source, target);
    const result = await validateTranslations(makeConfig(), makeRegistry(parser));
    expect(result.totalChecked).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
  });

  it('should skip missing target file gracefully', async () => {
    const source = [{ key: 'greeting', value: 'Hello' }] as ExtractedEntry[];
    mockReadFile.mockResolvedValueOnce('source');
    mockAccess.mockRejectedValueOnce(new Error('ENOENT'));
    const parser: FormatParser = {
      name: 'JSON', configKey: 'json', extensions: ['.json'],
      extract: jest.fn().mockReturnValue(source),
      reconstruct: jest.fn(),
    };
    const result = await validateTranslations(makeConfig(), makeRegistry(parser));
    expect(result.totalChecked).toBe(0);
  });

  it('should return empty result for empty source', async () => {
    mockReadFile.mockResolvedValueOnce('source');
    const parser = makeParser([], []);
    const result = await validateTranslations(makeConfig(), makeRegistry(parser));
    expect(result.totalChecked).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('should resolve documented ios_strings bucket keys via the registry config-key lookup', async () => {
    const source = [{ key: 'greeting', value: 'Hello {name}' }] as ExtractedEntry[];
    const target = [{ key: 'greeting', value: 'Hallo {name}' }] as ExtractedEntry[];
    mockReadFile.mockResolvedValueOnce('source').mockResolvedValueOnce('target');
    const parser = makeParser(source, target);
    const registry = makeRegistry(parser);

    await validateTranslations(
      makeConfig({
        buckets: { ios_strings: { include: ['en.lproj/Localizable.strings'] } },
      }),
      registry,
    );

    expect(registry.getParserByFormatKey).toHaveBeenCalledWith('ios_strings');
  });
});
