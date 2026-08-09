import {
  FormatKeyCollisionError,
  describeKeyPath,
  type ExtractedEntry,
  type FormatParser,
  type TranslatedEntry,
} from './format.js';
import {
  describeControlChar,
  findForbiddenControlChar,
} from './util/control-chars.js';
import { ValidationError } from '../utils/errors.js';

interface PoEntry {
  translatorComments: string[];
  developerComments: string[];
  references: string[];
  flags: string[];
  msgctxt: string | undefined;
  msgid: string;
  msgidPlural: string | undefined;
  msgstr: string[];
  msgstrPlural: Map<number, string>;
  rawLines: string[];
}

type ParseTarget =
  'msgctxt' | 'msgid' | 'msgid_plural' | 'msgstr' | `msgstr[${number}]`;

function unquote(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return (
      trimmed
        .slice(1, -1)
        // `r` is here because `quote` writes it: without it an escaped CR read
        // back as a literal backslash + 'r', whose backslash the next `quote`
        // escaped in turn, so a carried entry grew a backslash on every run.
        // msgfmt flags neither spelling.
        .replace(/\\(\\|"|n|t|r)/g, (_match, ch: string) => {
          switch (ch) {
            case '\\':
              return '\\';
            case '"':
              return '"';
            case 'n':
              return '\n';
            case 't':
              return '\t';
            case 'r':
              return '\r';
            default:
              return ch;
          }
        })
    );
  }
  return trimmed;
}

function quote(value: string): string {
  return (
    '"' +
    value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') +
    '"'
  );
}

function quoteLong(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

  if (escaped.length <= 74) return `"${escaped}"`;

  const parts = escaped.split('\\n');
  const lines = ['""'];
  for (let i = 0; i < parts.length; i++) {
    const suffix = i < parts.length - 1 ? '\\n' : '';
    const chunk = `${parts[i]}${suffix}`;
    if (chunk) {
      lines.push(`"${chunk}"`);
    }
  }
  return lines.join('\n');
}

function isHeaderEntry(entry: PoEntry): boolean {
  return (
    entry.msgid === '' && entry.msgstr.length > 0 && entry.msgstr[0] !== ''
  );
}

const CONTEXT_SEPARATOR = '\x04';

/**
 * gettext reserves U+0004 as the msgctxt/msgid separator, so a msgid carrying
 * one is indistinguishable from a context-qualified entry. Left alone it lets a
 * plain msgid claim the key of an unrelated `msgctxt "x" / msgid "y"` pair, or —
 * where no such pair exists — makes reconstruct emit a msgctxt the source
 * catalog never had. The byte prints as nothing, so the source diff shows an
 * ordinary string.
 */
function assertNoContextSeparator(field: string, value: string): void {
  if (value.includes(CONTEXT_SEPARATOR)) {
    // Escaped, not echoed: the byte prints as nothing, so quoting it verbatim
    // would show the reader the string they already believe they have.
    const shown = describeKeyPath(value)
      .split(CONTEXT_SEPARATOR)
      .join('\\u0004');
    throw new FormatKeyCollisionError(
      `PO: ${field} "${shown}" contains a U+0004 byte, which gettext reserves ` +
        `as the msgctxt separator, so the entry is indistinguishable from a ` +
        `msgctxt/msgid pair. Remove the byte.`
    );
  }
}

/**
 * Refuse a translation carrying a control byte the PO escape set cannot spell.
 * `\n`, `\r` and `\t` are escaped above; everything else in C0 has no escape
 * this parser's own `unquote` understands, so writing it would put a live
 * terminal-control sequence into a committed catalog that no later read could
 * recover as text.
 */
function assertNoControlChars(key: string, value: string): void {
  const found = findForbiddenControlChar(value);
  if (found !== undefined) {
    throw new ValidationError(
      `PO entry "${describeKeyPath(key)}" would contain ` +
        `${describeControlChar(found)}, which the PO escape set cannot represent.`,
      'Remove the control character from the translation, or from the source string it came from.'
    );
  }
}

function makeKey(entry: PoEntry): string {
  assertNoContextSeparator('msgid', entry.msgid);
  if (entry.msgctxt !== undefined) {
    assertNoContextSeparator('msgctxt', entry.msgctxt);
    return `${entry.msgctxt}${CONTEXT_SEPARATOR}${entry.msgid}`;
  }
  return entry.msgid;
}

/**
 * Whether `line` can only be the start of the next entry.
 *
 * gettext ends an entry at the first line that is not a continuation of its
 * translation; the blank line convention is a convention, and `msgfmt -c`
 * accepts a catalog with none. Treating a blank line as the only terminator
 * collapsed such a catalog into a single entry, which cost the reader every
 * key but the last and made the writer put one translation into every `msgstr`
 * it walked past — the header's included, deleting the charset and
 * `Plural-Forms` lines with it.
 *
 * Only a msgstr-ish `target` can be interrupted this way. Before that the
 * entry is still assembling its `msgctxt`/`msgid`, where a second `msgid` line
 * is malformed input rather than a new entry, and is left to the existing
 * last-one-wins handling.
 */
function startsNextEntry(
  line: string,
  target: ParseTarget | undefined
): boolean {
  if (target !== 'msgstr' && !target?.startsWith('msgstr[')) {
    return false;
  }
  return (
    line.startsWith('#') || /^msgctxt\s/.test(line) || /^msgid\s/.test(line)
  );
}

function parseEntries(content: string): PoEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: PoEntry[] = [];
  let current: PoEntry = createEmptyEntry();
  let target: ParseTarget | undefined;
  let hasContent = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }

    if (line.trim() === '') {
      if (hasContent) {
        entries.push(current);
        current = createEmptyEntry();
        target = undefined;
        hasContent = false;
      }
      continue;
    }

    if (hasContent && startsNextEntry(line, target)) {
      entries.push(current);
      current = createEmptyEntry();
      target = undefined;
      hasContent = false;
    }

    current.rawLines.push(line);

    if (line.startsWith('#. ')) {
      current.developerComments.push(line.slice(3));
      continue;
    }
    if (line.startsWith('#: ')) {
      current.references.push(line.slice(3));
      continue;
    }
    if (line.startsWith('#, ')) {
      const flagStr = line.slice(3);
      current.flags.push(...flagStr.split(',').map((f) => f.trim()));
      continue;
    }
    if (line.startsWith('# ') || line === '#') {
      current.translatorComments.push(
        line.startsWith('# ') ? line.slice(2) : ''
      );
      continue;
    }
    if (line.startsWith('#~ ')) {
      continue;
    }

    const msgctxtMatch = /^msgctxt\s+(.*)$/.exec(line);
    if (msgctxtMatch?.[1]) {
      current.msgctxt = unquote(msgctxtMatch[1]);
      target = 'msgctxt';
      hasContent = true;
      continue;
    }

    const msgidPluralMatch = /^msgid_plural\s+(.*)$/.exec(line);
    if (msgidPluralMatch?.[1]) {
      current.msgidPlural = unquote(msgidPluralMatch[1]);
      target = 'msgid_plural';
      hasContent = true;
      continue;
    }

    const msgidMatch = /^msgid\s+(.*)$/.exec(line);
    if (msgidMatch?.[1]) {
      current.msgid = unquote(msgidMatch[1]);
      target = 'msgid';
      hasContent = true;
      continue;
    }

    const msgstrPluralMatch = /^msgstr\[(\d+)]\s+(.*)$/.exec(line);
    if (msgstrPluralMatch?.[1] && msgstrPluralMatch[2] !== undefined) {
      const idx = parseInt(msgstrPluralMatch[1], 10);
      current.msgstrPlural.set(idx, unquote(msgstrPluralMatch[2]));
      target = `msgstr[${idx}]`;
      hasContent = true;
      continue;
    }

    const msgstrMatch = /^msgstr\s+(.*)$/.exec(line);
    if (msgstrMatch?.[1]) {
      current.msgstr = [unquote(msgstrMatch[1])];
      target = 'msgstr';
      hasContent = true;
      continue;
    }

    if (line.trim().startsWith('"') && target) {
      const continued = unquote(line);
      switch (target) {
        case 'msgctxt':
          current.msgctxt = (current.msgctxt ?? '') + continued;
          break;
        case 'msgid':
          current.msgid += continued;
          break;
        case 'msgid_plural':
          current.msgidPlural = (current.msgidPlural ?? '') + continued;
          break;
        case 'msgstr':
          current.msgstr = [(current.msgstr[0] ?? '') + continued];
          break;
        default: {
          const pluralIdxMatch = /^msgstr\[(\d+)]$/.exec(target);
          if (pluralIdxMatch?.[1]) {
            const idx = parseInt(pluralIdxMatch[1], 10);
            const existing = current.msgstrPlural.get(idx) ?? '';
            current.msgstrPlural.set(idx, existing + continued);
          }
          break;
        }
      }
      continue;
    }
  }

  if (hasContent) {
    entries.push(current);
  }

  return entries;
}

function createEmptyEntry(): PoEntry {
  return {
    translatorComments: [],
    developerComments: [],
    references: [],
    flags: [],
    msgctxt: undefined,
    msgid: '',
    msgidPlural: undefined,
    msgstr: [],
    msgstrPlural: new Map(),
    rawLines: [],
  };
}

export class PoFormatParser implements FormatParser {
  readonly name = 'PO (gettext)';
  readonly configKey = 'po';
  readonly extensions = ['.po', '.pot'];

  extract(content: string): ExtractedEntry[] {
    if (!content.trim()) {
      return [];
    }

    const parsed = parseEntries(content);
    const entries: ExtractedEntry[] = [];

    for (const pe of parsed) {
      if (isHeaderEntry(pe)) {
        continue;
      }

      if (
        pe.msgid === '' &&
        pe.msgstr.length === 0 &&
        pe.msgstrPlural.size === 0
      ) {
        continue;
      }

      const key = makeKey(pe);
      const value = pe.msgid;

      const entry: ExtractedEntry = { key, value };

      if (pe.developerComments.length > 0) {
        entry.context = pe.developerComments.join('\n');
      }

      const metadata: Record<string, unknown> = {};
      let hasMetadata = false;

      if (pe.flags.length > 0) {
        metadata['flags'] = [...pe.flags];
        hasMetadata = true;
      }

      if (pe.msgidPlural !== undefined) {
        metadata['msgid_plural'] = pe.msgidPlural;
        hasMetadata = true;
      }

      if (pe.msgstrPlural.size > 0) {
        const plurals: Record<string, string> = {};
        for (const [idx, val] of pe.msgstrPlural) {
          plurals[`msgstr[${idx}]`] = val;
        }
        metadata['plural_forms'] = plurals;
        hasMetadata = true;
      }

      if (pe.references.length > 0) {
        metadata['references'] = [...pe.references];
        hasMetadata = true;
      }

      if (hasMetadata) {
        entry.metadata = metadata;
      }

      entries.push(entry);
    }

    return entries;
  }

  /**
   * PO is bilingual, so `extract().value` is the msgid even when the file being
   * read is a target. The translation is the msgstr, and an empty msgstr is
   * gettext's spelling of "not translated yet" — such a key is left out so a
   * caller re-translates it rather than pinning the empty string.
   *
   * A plural entry has no bare msgstr; its first non-empty msgstr[n] stands in,
   * which is enough to report the entry as translated. The per-form values
   * travel separately in `metadata.plural_forms`.
   */
  /**
   * Keys carrying gettext's `fuzzy` flag with a translation to go with it.
   *
   * `msgfmt` leaves such an entry out of the compiled catalog, so the string the
   * application shows is the msgid — a key this CLI would otherwise report as
   * complete. A fuzzy entry with an empty msgstr is left out here: it has no
   * translation at all, which every reader already reports as missing.
   */
  extractNeedsReview(content: string): Set<string> {
    const flagged = new Set<string>();
    if (!content.trim()) {
      return flagged;
    }

    for (const pe of parseEntries(content)) {
      if (isHeaderEntry(pe)) continue;
      if (!pe.flags.includes('fuzzy')) continue;

      const singular = pe.msgstr[0];
      const hasTranslation =
        (singular !== undefined && singular !== '') ||
        [...pe.msgstrPlural.values()].some((v) => v !== '');
      if (hasTranslation) {
        flagged.add(makeKey(pe));
      }
    }

    return flagged;
  }

  extractTranslations(content: string): Map<string, string> {
    const translations = new Map<string, string>();
    if (!content.trim()) {
      return translations;
    }

    for (const pe of parseEntries(content)) {
      if (isHeaderEntry(pe)) {
        continue;
      }

      const singular = pe.msgstr[0];
      const translation =
        singular !== undefined && singular !== ''
          ? singular
          : [...pe.msgstrPlural.values()].find((v) => v !== '');
      if (translation === undefined) {
        continue;
      }

      translations.set(makeKey(pe), translation);
    }

    return translations;
  }

  // Comment bookkeeping is local rather than via PendingCommentBuffer: po
  // backtracks into `result` at entry-start to slice trailing contiguous
  // `#`-runs into `commentLines`, for pop-on-delete or splice-with-fuzzy-strip
  // on keep. That is incompatible with the buffer's forward-only flush/drop
  // semantics.
  reconstruct(content: string, entries: TranslatedEntry[]): string {
    const translationMap = new Map<string, TranslatedEntry>();
    for (const entry of entries) {
      assertNoControlChars(entry.key, entry.translation);
      const plurals = entry.metadata?.['plural_forms'] as
        Record<string, string> | undefined;
      for (const form of Object.values(plurals ?? {})) {
        assertNoControlChars(entry.key, form);
      }
      translationMap.set(entry.key, entry);
    }

    const emittedKeys = new Set<string>();
    const lines = content.split(/\r?\n/);
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (line === undefined) {
        i++;
        continue;
      }

      if (line.trim() === '' || line.startsWith('#')) {
        result.push(line);
        i++;
        continue;
      }

      const commentLines: string[] = [];
      const entryLines: string[] = [];
      let entryMsgctxt: string | undefined;
      let entryMsgid = '';
      let entryMsgstr: string | undefined;
      const entryMsgstrPlural = new Map<number, string>();
      let target: ParseTarget | undefined;

      let backtrack = result.length - 1;
      while (backtrack >= 0 && result[backtrack]!.startsWith('#')) {
        commentLines.unshift(result[backtrack]!);
        backtrack--;
      }

      while (i < lines.length) {
        const el = lines[i];
        if (el === undefined) {
          break;
        }
        if (el.trim() === '') {
          break;
        }
        if (el.startsWith('#')) {
          break;
        }
        if (startsNextEntry(el, target)) {
          break;
        }
        entryLines.push(el);

        const ctxtM = /^msgctxt\s+(.*)$/.exec(el);
        if (ctxtM?.[1]) {
          entryMsgctxt = unquote(ctxtM[1]);
          target = 'msgctxt';
          i++;
          continue;
        }

        const idPluralM = /^msgid_plural\s+(.*)$/.exec(el);
        if (idPluralM?.[1]) {
          target = 'msgid_plural';
          i++;
          continue;
        }

        const idM = /^msgid\s+(.*)$/.exec(el);
        if (idM?.[1]) {
          entryMsgid = unquote(idM[1]);
          target = 'msgid';
          i++;
          continue;
        }

        const strPluralM = /^msgstr\[(\d+)]\s+(.*)$/.exec(el);
        if (strPluralM?.[1] && strPluralM[2] !== undefined) {
          const idx = parseInt(strPluralM[1], 10);
          entryMsgstrPlural.set(idx, unquote(strPluralM[2]));
          target = `msgstr[${idx}]`;
          i++;
          continue;
        }

        const strM = /^msgstr\s+(.*)$/.exec(el);
        if (strM?.[1]) {
          entryMsgstr = unquote(strM[1]);
          target = 'msgstr';
          i++;
          continue;
        }

        if (el.trim().startsWith('"') && target) {
          const continued = unquote(el);
          if (target === 'msgctxt') {
            entryMsgctxt = (entryMsgctxt ?? '') + continued;
          } else if (target === 'msgid') {
            entryMsgid += continued;
          } else if (target === 'msgstr') {
            entryMsgstr = (entryMsgstr ?? '') + continued;
          } else if (target.startsWith('msgstr[')) {
            const idx = parseInt(target.slice('msgstr['.length), 10);
            entryMsgstrPlural.set(
              idx,
              (entryMsgstrPlural.get(idx) ?? '') + continued
            );
          }
          i++;
          continue;
        }

        i++;
      }

      if (entryLines.length === 0) {
        continue;
      }

      assertNoContextSeparator('msgid', entryMsgid);
      if (entryMsgctxt !== undefined) {
        assertNoContextSeparator('msgctxt', entryMsgctxt);
      }
      const key =
        entryMsgctxt !== undefined
          ? `${entryMsgctxt}${CONTEXT_SEPARATOR}${entryMsgid}`
          : entryMsgid;

      if (isHeaderMsgidFromLines(entryMsgid, entryLines)) {
        for (const el of entryLines) {
          result.push(el);
        }
        continue;
      }

      const translatedEntry = translationMap.get(key);

      if (!translatedEntry) {
        for (let c = 0; c < commentLines.length; c++) {
          result.pop();
        }
        while (result.length > 0 && result[result.length - 1]!.trim() === '') {
          result.pop();
        }
        continue;
      }

      emittedKeys.add(key);

      const translation = translatedEntry.translation;
      const pluralTranslations = translatedEntry.metadata?.['plural_forms'] as
        Record<string, string> | undefined;

      // The fuzzy flag describes the translation the entry holds, so it is
      // stripped only when this run writes different content over it — the
      // same content test XLIFF applies to its review `state`. An entry
      // rewritten only because a sibling key changed keeps its comment lines
      // byte-for-byte, reviewer markers included.
      const writesChange =
        (entryMsgstr !== undefined && translation !== entryMsgstr) ||
        [...entryMsgstrPlural].some(([idx, existing]) => {
          const pluralVal = pluralTranslations?.[`msgstr[${idx}]`];
          return pluralVal !== undefined && pluralVal !== existing;
        });

      const commentStart = result.length - commentLines.length;
      result.splice(commentStart, commentLines.length);
      for (const cl of commentLines) {
        if (writesChange && /^#,/.test(cl)) {
          const flags = cl
            .slice(2)
            .trim()
            .split(/,\s*/)
            .filter((f) => f !== 'fuzzy');
          if (flags.length > 0) {
            result.push(`#, ${flags.join(', ')}`);
          }
        } else {
          result.push(cl);
        }
      }

      let inMsgstr = false;
      let inMsgstrPlural = false;

      for (const el of entryLines) {
        const strPluralM = /^msgstr\[(\d+)]\s+(.*)$/.exec(el);
        if (strPluralM?.[1] && strPluralM[2] !== undefined) {
          const idx = parseInt(strPluralM[1], 10);
          const pluralKey = `msgstr[${idx}]`;
          const pluralVal = pluralTranslations?.[pluralKey];
          if (pluralVal !== undefined) {
            result.push(`msgstr[${idx}] ${quoteLong(pluralVal)}`);
          } else {
            result.push(el);
          }
          inMsgstr = false;
          // Only a form this run is REPLACING swallows its continuation lines,
          // because `quoteLong` has just re-emitted the whole value. A form
          // being kept — a carried plural entry supplies no `plural_forms`, so
          // the file's own forms stand — must keep its continuations too:
          // gettext writes any form over 74 characters as `msgstr[N] ""` plus
          // continuations, so dropping them left the empty first line as the
          // whole translation.
          inMsgstrPlural = pluralVal !== undefined;
          continue;
        }

        const strM = /^msgstr\s+(.*)$/.exec(el);
        if (strM?.[1]) {
          result.push(`msgstr ${quoteLong(translation)}`);
          inMsgstr = true;
          inMsgstrPlural = false;
          continue;
        }

        if (el.trim().startsWith('"') && (inMsgstr || inMsgstrPlural)) {
          continue;
        }

        inMsgstr = false;
        inMsgstrPlural = false;
        result.push(el);
      }
    }

    for (const entry of entries) {
      if (emittedKeys.has(entry.key)) {
        continue;
      }

      if (result.length > 0 && result[result.length - 1]!.trim() !== '') {
        result.push('');
      }

      if (entry.key.includes(CONTEXT_SEPARATOR)) {
        const sepIdx = entry.key.indexOf(CONTEXT_SEPARATOR);
        const msgctxt = entry.key.slice(0, sepIdx);
        const msgid = entry.key.slice(sepIdx + 1);
        result.push(`msgctxt ${quote(msgctxt)}`);
        result.push(`msgid ${quote(msgid)}`);
      } else {
        result.push(`msgid ${quote(entry.key)}`);
      }
      result.push(`msgstr ${quoteLong(entry.translation)}`);
    }

    return result.join('\n');
  }
}

function isHeaderMsgidFromLines(msgid: string, entryLines: string[]): boolean {
  if (msgid !== '') {
    return false;
  }
  let foundMsgstr = false;
  for (const line of entryLines) {
    const strM = /^msgstr\s+(.*)$/.exec(line);
    if (strM?.[1]) {
      const val = unquote(strM[1]);
      if (val !== '') {
        return true;
      }
      foundMsgstr = true;
      continue;
    }
    if (foundMsgstr && line.trim().startsWith('"')) {
      return true;
    }
  }
  return false;
}
