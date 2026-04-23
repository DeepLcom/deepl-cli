import type { FormatRegistry } from '../formats/index.js';
import type { ResolvedSyncConfig } from './sync-config.js';
import { walkBuckets } from './sync-bucket-walker.js';
import { sweepStaleBackups, resolveBakSweepAgeMs } from './sync-bak-cleanup.js';

export interface ExportOptions {
  localeFilter?: string[];
  format?: 'xliff';
}

export interface ExportResult {
  files: number;
  keys: number;
  content: string;
}

export async function exportTranslations(
  config: ResolvedSyncConfig,
  registry: FormatRegistry,
  options?: ExportOptions,
): Promise<ExportResult> {
  try {
    await sweepStaleBackups(
      config.projectRoot,
      resolveBakSweepAgeMs(config.sync?.bak_sweep_max_age_seconds),
      config.buckets,
    );
  } catch {
    /* best-effort */
  }

  const locales = options?.localeFilter?.length
    ? config.target_locales.filter(l => options.localeFilter!.includes(l))
    : config.target_locales;

  const units: string[] = [];
  let fileCount = 0;

  for await (const walked of walkBuckets(config, registry)) {
    fileCount++;
    for (const entry of walked.entries) {
      const escaped = escapeXml(entry.value);
      units.push(
        `    <trans-unit id="${escapeXml(entry.key)}" resname="${escapeXml(entry.key)}">` +
        `\n      <source>${escaped}</source>` +
        (entry.context ? `\n      <note>${escapeXml(entry.context)}</note>` : '') +
        `\n      <note from="location">${escapeXml(walked.relPath)}</note>` +
        `\n    </trans-unit>`,
      );
    }
  }

  const xliff = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
    ...locales.map(locale =>
      `  <file source-language="${escapeXml(config.source_locale)}" target-language="${escapeXml(locale)}" datatype="plaintext">` +
      `\n    <body>\n${units.join('\n')}\n    </body>` +
      `\n  </file>`,
    ),
    '</xliff>',
    '',
  ].join('\n');

  return { files: fileCount, keys: units.length, content: xliff };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
