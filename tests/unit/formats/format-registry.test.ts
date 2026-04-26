import { FormatRegistry, SUPPORTED_FORMAT_KEYS, createDefaultRegistry } from '../../../src/formats/index';
import type { FormatParser } from '../../../src/formats/format';

function createStubParser(overrides: Partial<FormatParser> = {}): FormatParser {
  return {
    name: 'Stub',
    configKey: 'stub',
    extensions: ['.stub'],
    extract: () => [],
    reconstruct: (content: string) => content,
    ...overrides,
  };
}

describe('FormatRegistry', () => {
  let registry: FormatRegistry;

  beforeEach(() => {
    registry = new FormatRegistry();
  });

  it('should register a parser and retrieve it by extension', () => {
    const parser = createStubParser({ name: 'JSON', extensions: ['.json'] });
    registry.register(parser);
    expect(registry.getParser('.json')).toBe(parser);
  });

  it('should return undefined for unknown extension', () => {
    expect(registry.getParser('.unknown')).toBeUndefined();
  });

  it('should handle multiple extensions per parser', () => {
    const parser = createStubParser({ name: 'YAML', extensions: ['.yaml', '.yml'] });
    registry.register(parser);
    expect(registry.getParser('.yaml')).toBe(parser);
    expect(registry.getParser('.yml')).toBe(parser);
  });

  it('should be case-insensitive for extension lookup', () => {
    const parser = createStubParser({ name: 'JSON', extensions: ['.json'] });
    registry.register(parser);
    expect(registry.getParser('.JSON')).toBe(parser);
    expect(registry.getParser('.Json')).toBe(parser);
  });

  it('should overwrite existing parser for same extension', () => {
    const parser1 = createStubParser({ name: 'Parser1', extensions: ['.json'] });
    const parser2 = createStubParser({ name: 'Parser2', extensions: ['.json'] });
    registry.register(parser1);
    registry.register(parser2);
    expect(registry.getParser('.json')).toBe(parser2);
  });

  it('should list all supported extensions', () => {
    registry.register(createStubParser({ extensions: ['.json'] }));
    registry.register(createStubParser({ extensions: ['.yaml', '.yml'] }));
    const extensions = registry.getSupportedExtensions();
    expect(extensions).toEqual(expect.arrayContaining(['.json', '.yaml', '.yml']));
    expect(extensions).toHaveLength(3);
  });

  it('should return empty list when no parsers registered', () => {
    expect(registry.getSupportedExtensions()).toEqual([]);
  });
});

describe('createDefaultRegistry', () => {
  it('should include all built-in parsers', async () => {
    const registry = await createDefaultRegistry();
    expect(registry.getParser('.json')?.name).toBe('JSON i18n');
    expect(registry.getParser('.yaml')?.name).toBe('YAML');
    expect(registry.getParser('.yml')?.name).toBe('YAML');
    expect(registry.getParser('.po')?.name).toBe('PO (gettext)');
    expect(registry.getParser('.pot')?.name).toBe('PO (gettext)');
    expect(registry.getParser('.xml')?.name).toBe('Android XML');
    expect(registry.getParser('.strings')?.name).toBe('iOS Strings');
    expect(registry.getParser('.arb')?.name).toBe('ARB (Flutter)');
    expect(registry.getParser('.xlf')?.name).toBe('XLIFF');
    expect(registry.getParser('.xliff')?.name).toBe('XLIFF');
  });

  it('should expose each parser by its canonical config key', async () => {
    const registry = await createDefaultRegistry();
    expect(registry.getParserByFormatKey('json')?.name).toBe('JSON i18n');
    expect(registry.getParserByFormatKey('yaml')?.name).toBe('YAML');
    expect(registry.getParserByFormatKey('po')?.name).toBe('PO (gettext)');
    expect(registry.getParserByFormatKey('android_xml')?.name).toBe('Android XML');
    expect(registry.getParserByFormatKey('ios_strings')?.name).toBe('iOS Strings');
    expect(registry.getParserByFormatKey('arb')?.name).toBe('ARB (Flutter)');
    expect(registry.getParserByFormatKey('xliff')?.name).toBe('XLIFF');
    expect(registry.getParserByFormatKey('toml')?.name).toBe('TOML i18n');
    expect(registry.getParserByFormatKey('properties')?.name).toBe('Java Properties');
    expect(registry.getParserByFormatKey('xcstrings')?.name).toBe('Xcode String Catalog');
  });
});

describe('SUPPORTED_FORMAT_KEYS', () => {
  it('matches the config keys registered in the default registry', async () => {
    const registry = await createDefaultRegistry();
    expect([...SUPPORTED_FORMAT_KEYS].sort()).toEqual(registry.getFormatKeys().sort());
  });

  it('covers every parser extension in a single source of truth', () => {
    expect([...SUPPORTED_FORMAT_KEYS].sort()).toEqual(
      ['android_xml', 'arb', 'ios_strings', 'json', 'laravel_php', 'po', 'properties', 'toml', 'xcstrings', 'xliff', 'yaml'].sort(),
    );
  });
});
