import type { FormatParser } from './format.js';
import { JsonFormatParser } from './json.js';
import { YamlFormatParser } from './yaml.js';
import { PoFormatParser } from './po.js';
import { AndroidXmlFormatParser } from './android-xml.js';
import { IosStringsFormatParser } from './ios-strings.js';
import { ArbFormatParser } from './arb.js';
import { XliffFormatParser } from './xliff.js';
import { TomlFormatParser } from './toml.js';
import { PropertiesFormatParser } from './properties.js';
import { XcstringsFormatParser } from './xcstrings.js';
import { PhpArraysFormatParser } from './php-arrays.js';

export class FormatRegistry {
  private parsers = new Map<string, FormatParser>();
  private parsersByFormatKey = new Map<string, FormatParser>();

  register(parser: FormatParser): void {
    for (const ext of parser.extensions) {
      this.parsers.set(ext.toLowerCase(), parser);
    }
    this.parsersByFormatKey.set(parser.configKey, parser);
  }

  getParser(extension: string): FormatParser | undefined {
    return this.parsers.get(extension.toLowerCase());
  }

  getParserByFormatKey(configKey: string): FormatParser | undefined {
    return this.parsersByFormatKey.get(configKey);
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.parsers.keys());
  }

  getFormatKeys(): string[] {
    return Array.from(this.parsersByFormatKey.keys());
  }
}

function buildDefaultRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  registry.register(new JsonFormatParser());
  registry.register(new YamlFormatParser());
  registry.register(new PoFormatParser());
  registry.register(new AndroidXmlFormatParser());
  registry.register(new IosStringsFormatParser());
  registry.register(new ArbFormatParser());
  registry.register(new XliffFormatParser());
  registry.register(new TomlFormatParser());
  registry.register(new PropertiesFormatParser());
  registry.register(new XcstringsFormatParser());
  registry.register(new PhpArraysFormatParser());
  return registry;
}

export function createDefaultRegistrySync(): FormatRegistry {
  return buildDefaultRegistry();
}

export async function createDefaultRegistry(): Promise<FormatRegistry> {
  return buildDefaultRegistry();
}

/**
 * Canonical list of supported --file-format / sync bucket keys, derived from
 * the default registry. Adding a parser + registering it automatically
 * surfaces the new format in CLI choices — no parallel arrays to maintain.
 */
export const SUPPORTED_FORMAT_KEYS: readonly string[] =
  Object.freeze(buildDefaultRegistry().getFormatKeys());

export type { FormatParser, ExtractedEntry, TranslatedEntry } from './format.js';
