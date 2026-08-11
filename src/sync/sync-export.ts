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
  options?: ExportOptions
): Promise<ExportResult> {
  try {
    await sweepStaleBackups(
      config.projectRoot,
      resolveBakSweepAgeMs(config.sync?.bak_sweep_max_age_seconds),
      config.buckets
    );
  } catch {
    /* best-effort */
  }

  const locales = options?.localeFilter?.length
    ? config.target_locales.filter((l) => options.localeFilter!.includes(l))
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
          (entry.context
            ? `\n      <note>${escapeXml(entry.context)}</note>`
            : '') +
          `\n      <note from="location">${escapeXml(walked.relPath)}</note>` +
          `\n    </trans-unit>`
      );
    }
  }

  const xliff = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
    ...locales.map(
      (locale) =>
        `  <file source-language="${escapeXml(config.source_locale)}" target-language="${escapeXml(locale)}" datatype="plaintext">` +
        `\n    <body>\n${units.join('\n')}\n    </body>` +
        `\n  </file>`
    ),
    '</xliff>',
    '',
  ].join('\n');

  return { files: fileCount, keys: units.length, content: xliff };
}

/**
 * Tab, newline and carriage return become numeric character references because
 * an XML parser normalizes them to a space inside an attribute value, which
 * would silently change a `trans-unit` id. The remaining C0 controls have no
 * representation at all in XML 1.0 — not even as a character reference — so
 * they are replaced. C1 (U+0080-U+009F) is left alone: those are valid XML 1.0
 * characters and round-trip unchanged.
 */
function escapeXml(s: string): string {
  return (
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\t/g, '&#9;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;')
      // eslint-disable-next-line no-control-regex -- intentional: C0 controls have no XML 1.0 representation
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '?')
  );
}
