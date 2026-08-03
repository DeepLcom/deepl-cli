import chalk from 'chalk';
import Table from 'cli-table3';
import type { LanguagesService } from '../../services/languages.js';
import { LanguageInfo, type LanguageFeatures } from '../../api/deepl-client.js';
import {
  getSourceLanguages as getRegistrySourceLanguages,
  getTargetLanguages as getRegistryTargetLanguages,
  deriveLanguageEntry,
} from '../../data/language-registry.js';
import { isColorEnabled } from '../../utils/formatters.js';

export interface LanguageDisplayEntry {
  code: string;
  name: string;
  category: 'core' | 'regional' | 'extended';
  supportsFormality?: boolean;
  features?: LanguageFeatures;
}

/** Display order for the feature keys /v3/languages is known to report. */
const KNOWN_FEATURE_ORDER = [
  'formality',
  'glossary',
  'style_rules',
  'translation_memory',
  'tag_handling',
  'auto_detection',
];

const FEATURE_LABELS: Record<string, string> = {
  formality: 'Formality',
  glossary: 'Glossary',
  style_rules: 'Style Rules',
  translation_memory: 'Translation Memory',
  tag_handling: 'Tag Handling',
  auto_detection: 'Auto Detection',
};

function featureLabel(key: string): string {
  return (
    FEATURE_LABELS[key] ??
    key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/** Cell text for a language the response carried no feature data for at all. */
const UNKNOWN_CELL = '?';

/**
 * Whether the response described this language's features at all. An empty
 * matrix is data -- it says the language supports none of them -- while a
 * missing one means the language did not appear in the response.
 */
function hasFeatureData(entry: LanguageDisplayEntry): boolean {
  return entry.features !== undefined;
}

/**
 * Cell text for one feature on one language. A feature is supported when the
 * API reports the key at all; `status` describes maturity, so anything other
 * than `stable` is shown verbatim rather than collapsed to yes. `status` is an
 * open enum and may be absent, which still means the feature is there.
 *
 * A language the response omitted reads as unknown rather than unsupported:
 * the listing includes snapshot entries the API did not mention, and claiming
 * they support nothing would be inventing an answer.
 */
function featureCell(entry: LanguageDisplayEntry, key: string): string {
  if (!hasFeatureData(entry)) return UNKNOWN_CELL;
  const feature = entry.features?.[key];
  if (!feature) return '—';
  return !feature.status || feature.status === 'stable' ? 'yes' : feature.status;
}

function sortFeatureKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const indexA = KNOWN_FEATURE_ORDER.indexOf(a);
    const indexB = KNOWN_FEATURE_ORDER.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Splits the reported features into those worth a column and those every entry
 * shares. A uniform feature discriminates nothing, so it is reported once as a
 * note instead of repeated on every row. Deriving this from the response rather
 * than a fixed list means a new API feature surfaces without a code change.
 */
export function partitionFeatureKeys(entries: LanguageDisplayEntry[]): {
  columns: string[];
  uniform: Array<{ key: string; cell: string }>;
} {
  // Only languages the response described can say whether a feature varies.
  // Counting the rest would make every feature look non-uniform, turning one
  // shared by all of them into a column of repeated values.
  const described = entries.filter(hasFeatureData);
  if (described.length === 0) return { columns: [], uniform: [] };

  const allKeys = new Set<string>();
  for (const entry of described) {
    for (const key of Object.keys(entry.features ?? {})) allKeys.add(key);
  }

  const columns: string[] = [];
  const uniform: Array<{ key: string; cell: string }> = [];
  for (const key of allKeys) {
    const first = featureCell(described[0]!, key);
    if (described.some(entry => featureCell(entry, key) !== first)) {
      columns.push(key);
    } else {
      uniform.push({ key, cell: first });
    }
  }

  return {
    columns: sortFeatureKeys(columns),
    uniform: sortFeatureKeys(uniform.map(u => u.key)).map(
      key => uniform.find(u => u.key === key)!,
    ),
  };
}

function hasAnyFeatures(entries: LanguageDisplayEntry[]): boolean {
  return entries.some(hasFeatureData);
}

/**
 * Lowercased feature list for prose contexts, e.g. `glossary, style rules`.
 * Empty when there is nothing per-language to say: with no discriminating
 * features the footer note carries the answer, so annotating each row `none`
 * would contradict it.
 */
function featureList(entry: LanguageDisplayEntry, keys: string[]): string {
  if (!hasFeatureData(entry)) return 'no feature data';
  if (keys.length === 0) return '';
  const supported = keys
    .filter(key => featureCell(entry, key) !== '—')
    .map(key => {
      const cell = featureCell(entry, key);
      const label = featureLabel(key).toLowerCase();
      return cell === 'yes' ? label : `${label} (${cell})`;
    });
  return supported.length > 0 ? supported.join(', ') : 'none';
}

/**
 * The one-line summary for features every language shares. Scoped to the
 * languages the response described when some rows carry no data, since those
 * rows are listed too and the note cannot speak for them.
 */
function uniformNote(
  uniform: Array<{ key: string; cell: string }>,
  entries: LanguageDisplayEntry[],
): string | undefined {
  const supported = uniform.filter(u => u.cell !== '—' && u.cell !== UNKNOWN_CELL);
  if (supported.length === 0) return undefined;
  const list = supported
    .map(u => {
      const label = featureLabel(u.key).toLowerCase();
      return u.cell === 'yes' ? label : `${label} (${u.cell})`;
    })
    .join(', ');
  const subject = entries.every(hasFeatureData)
    ? 'All listed languages'
    : 'All languages with reported features';
  return `${subject} also support: ${list}.`;
}

export class LanguagesCommand {
  private service: LanguagesService;

  constructor(service: LanguagesService) {
    this.service = service;
  }

  async getSourceLanguages(): Promise<LanguageInfo[]> {
    return this.service.getSupportedLanguages('source');
  }

  async getTargetLanguages(): Promise<LanguageInfo[]> {
    return this.service.getSupportedLanguages('target');
  }

  /**
   * Merge API languages with the bundled snapshot. API names take precedence.
   *
   * The row set is the union of both: iterating only the snapshot meant a
   * language the API offers but the snapshot predates was silently dropped from
   * the listing, so `deepl languages` could not show what `translate` accepted.
   * Snapshot entries the API omits are kept, so a partial response never makes
   * languages disappear.
   */
  mergeWithRegistry(
    apiLanguages: LanguageInfo[],
    type: 'source' | 'target'
  ): LanguageDisplayEntry[] {
    const apiMap = new Map<string, LanguageInfo>();
    for (const lang of apiLanguages) {
      apiMap.set(lang.language.toLowerCase(), lang);
    }

    const registryEntries = type === 'source'
      ? getRegistrySourceLanguages()
      : getRegistryTargetLanguages();

    const merged = registryEntries.map(entry => {
      const apiLang = apiMap.get(entry.code);
      return {
        code: entry.code,
        name: apiLang?.name ?? entry.name,
        category: entry.category,
        ...(apiLang?.supportsFormality !== undefined && { supportsFormality: apiLang.supportsFormality }),
        ...(apiLang?.features && { features: apiLang.features }),
      };
    });

    const known = new Set(registryEntries.map(entry => entry.code));
    for (const lang of apiLanguages) {
      const code = lang.language.toLowerCase();
      if (known.has(code)) continue;
      // LanguageInfo carries no usable_as_source, and deriving it from the role
      // would tier the same code differently in each listing. A regional variant
      // always carries a subtag, which is the stable signal available here; core
      // and regional render in the same section anyway, and regenerating the
      // snapshot replaces the guess with the API's own answer.
      const { code: derivedCode, name, category } = deriveLanguageEntry({
        lang: code,
        name: lang.name,
        usable_as_source: !code.includes('-'),
        ...(lang.features && { features: lang.features }),
      });
      merged.push({
        code: derivedCode,
        name,
        category,
        ...(lang.supportsFormality !== undefined && { supportsFormality: lang.supportsFormality }),
        ...(lang.features && { features: lang.features }),
      });
    }

    return merged;
  }

  /**
   * Get display entries from registry only (no API call).
   */
  getRegistryLanguages(type: 'source' | 'target'): LanguageDisplayEntry[] {
    const entries = type === 'source'
      ? getRegistrySourceLanguages()
      : getRegistryTargetLanguages();

    return entries.map(entry => ({
      code: entry.code,
      name: entry.name,
      category: entry.category,
    }));
  }

  formatLanguages(
    languages: LanguageInfo[],
    type: 'source' | 'target',
    showFeatures = false
  ): string {
    if (languages.length === 0 && !this.service.hasClient()) {
      const displayEntries = this.getRegistryLanguages(type);
      return this.formatDisplayEntries(displayEntries, type, showFeatures);
    }

    const displayEntries = this.mergeWithRegistry(languages, type);
    return this.formatDisplayEntries(displayEntries, type, showFeatures);
  }

  formatDisplayEntries(
    entries: LanguageDisplayEntry[],
    type: 'source' | 'target',
    showFeatures = false
  ): string {
    const lines: string[] = [];
    const header = type === 'source' ? 'Source Languages:' : 'Target Languages:';
    const renderFeatures = showFeatures && hasAnyFeatures(entries);
    // Formality is one of the feature columns, so the [F] shorthand would say it twice.
    const showFormality =
      !renderFeatures && type === 'target' && entries.some(e => e.supportsFormality !== undefined);

    lines.push(chalk.bold(header));

    if (entries.length === 0) {
      lines.push(chalk.gray('  No languages available'));
      return lines.join('\n');
    }

    const coreAndRegional = entries.filter(e => e.category === 'core' || e.category === 'regional');
    const extended = entries.filter(e => e.category === 'extended');

    const allEntries = [...coreAndRegional, ...extended];
    const maxCodeLength = Math.max(...allEntries.map(e => e.code.length));
    const { columns, uniform } = renderFeatures
      ? partitionFeatureKeys(entries)
      : { columns: [], uniform: [] };
    const suffix = (entry: LanguageDisplayEntry): string => {
      if (!renderFeatures) return '';
      const list = featureList(entry, columns);
      return list ? chalk.gray(` — ${list}`) : '';
    };

    coreAndRegional.forEach(entry => {
      const code = entry.code.padEnd(maxCodeLength + 2);
      const formalityMarker = showFormality && entry.supportsFormality ? chalk.green(' [F]') : '';
      lines.push(`  ${chalk.cyan(code)} ${entry.name}${formalityMarker}${suffix(entry)}`);
    });

    if (extended.length > 0) {
      lines.push('');
      lines.push(chalk.gray('  Extended Languages (quality_optimized only, no formality/glossary):'));
      extended.forEach(entry => {
        const code = entry.code.padEnd(maxCodeLength + 2);
        lines.push(`  ${chalk.gray(code)} ${chalk.gray(entry.name)}${suffix(entry)}`);
      });
    }

    if (showFormality) {
      lines.push('');
      lines.push(chalk.gray('  [F] = supports formality parameter'));
    }

    const note = renderFeatures ? uniformNote(uniform, entries) : undefined;
    if (note) {
      lines.push('');
      lines.push(chalk.gray(`  ${note}`));
    }

    return lines.join('\n');
  }

  formatAllLanguages(
    sourceLanguages: LanguageInfo[],
    targetLanguages: LanguageInfo[],
    showFeatures = false
  ): string {
    const sourcePart = this.formatLanguages(sourceLanguages, 'source', showFeatures);
    const targetPart = this.formatLanguages(targetLanguages, 'target', showFeatures);

    return `${sourcePart}\n\n${targetPart}`;
  }

  /** Format a single language list (source or target) as a cli-table3 table. */
  formatLanguagesTable(
    languages: LanguageInfo[],
    type: 'source' | 'target',
    showFeatures = false
  ): string {
    const entries = languages.length === 0 && !this.service.hasClient()
      ? this.getRegistryLanguages(type)
      : this.mergeWithRegistry(languages, type);

    return this.formatDisplayEntriesTable(entries, type, showFeatures);
  }

  formatDisplayEntriesTable(
    entries: LanguageDisplayEntry[],
    type: 'source' | 'target',
    showFeatures = false
  ): string {
    const header = type === 'source' ? 'Source Languages' : 'Target Languages';
    if (entries.length === 0) {
      return `${header}: (no languages available)`;
    }

    const renderFeatures = showFeatures && hasAnyFeatures(entries);
    const { columns, uniform } = renderFeatures
      ? partitionFeatureKeys(entries)
      : { columns: [], uniform: [] };
    const showFormality =
      !renderFeatures && type === 'target' && entries.some(e => e.supportsFormality !== undefined);

    const head = ['Code', 'Name', 'Category'];
    const colWidths = [10, renderFeatures ? 24 : showFormality ? 30 : 36, 12];
    if (showFormality) {
      head.push('Formality');
      colWidths.push(13);
    }
    for (const key of columns) {
      head.push(featureLabel(key));
      colWidths.push(13);
    }
    const colorDisabled = !isColorEnabled();

    const table = new Table({
      head,
      colWidths,
      wordWrap: true,
      ...(colorDisabled && { style: { head: [], border: [] } }),
    });

    for (const entry of entries) {
      const row: string[] = [entry.code, entry.name, entry.category];
      if (showFormality) {
        row.push(entry.supportsFormality ? 'yes' : '—');
      }
      for (const key of columns) {
        row.push(featureCell(entry, key));
      }
      table.push(row);
    }

    const note = renderFeatures ? uniformNote(uniform, entries) : undefined;
    return `${header}:\n${table.toString()}${note ? `\n${note}` : ''}`;
  }

  /** Format both source and target language tables joined by a blank line. */
  formatAllLanguagesTable(
    sourceLanguages: LanguageInfo[],
    targetLanguages: LanguageInfo[],
    showFeatures = false
  ): string {
    return `${this.formatLanguagesTable(sourceLanguages, 'source', showFeatures)}\n\n${this.formatLanguagesTable(targetLanguages, 'target', showFeatures)}`;
  }
}
