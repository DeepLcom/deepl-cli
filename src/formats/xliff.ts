import type {
  ExtractedEntry,
  FormatParser,
  TranslatedEntry,
} from './format.js';
import { ValidationError } from '../utils/errors.js';
import {
  describeControlChar,
  findForbiddenControlChar,
} from './util/control-chars.js';
import {
  findElement,
  insertBlocksAt,
  lineIndentAt,
  replaceElements,
  scanElements,
  type ElementPattern,
  type ScannedElement,
} from './xml-scan.js';

const VERSION_RE = /<(?:\w+:)?xliff[^>]*version=["'](\d+\.\d+)["']/i;

// The quote delimiter is captured so the value can exclude only the delimiter
// actually in use: only the delimiter needs escaping inside a value, so
// `id="label.don't"` is well-formed and must not be truncated at the apostrophe.
// Two ids differing only after one would otherwise collapse onto a single key,
// and XLIFF is exempt from `assertDistinctKeys`, so nothing would report it.
const TRANS_UNIT_EL: ElementPattern = {
  open: /<(?:\w+:)?trans-unit\s+id=(["'])((?:(?!\1)[^<])+)\1[^><]*>/iy,
  close: /<\/(?:\w+:)?trans-unit>/iy,
};

const UNIT_EL: ElementPattern = {
  open: /<(?:\w+:)?unit\s+id=(["'])((?:(?!\1)[^<])+)\1[^><]*>/iy,
  close: /<\/(?:\w+:)?unit>/iy,
};

/** The `id` of a scanned `trans-unit`/`unit`; group 0 is the quote delimiter. */
function unitId(element: ScannedElement): string {
  // Entity-decoded, because the writer escapes `&`/`"`/`<` when it interpolates
  // a key into the `id` attribute. Without decoding here the key would not round
  // trip: extract would report `a&amp;b` for the key the writer was given as
  // `a&b`.
  return unescapeXml(element.groups[1]!);
}

const SOURCE_EL: ElementPattern = {
  open: /<(\w+:)?source>/iy,
  close: /<\/(?:\w+:)?source>/iy,
};

// Attributes are optional but must be preserved: `state` is a standard XLIFF
// attribute that every CAT tool writes, so requiring a bare tag would make
// those elements invisible to this scan.
const TARGET_EL: ElementPattern = {
  open: /<(\w+:)?target((?:\s[^><]*)?)>/iy,
  close: /<\/(?:\w+:)?target>/iy,
};

const NOTE_EL: ElementPattern = {
  open: /<(?:\w+:)?note(?:\s[^><]*)?>/iy,
  close: /<\/(?:\w+:)?note>/iy,
};

const SEGMENT_EL: ElementPattern = {
  open: /<(?:\w+:)?segment(?:\s[^><]*)?>/iy,
  close: /<\/(?:\w+:)?segment>/iy,
};

// The element a new unit is written into when the document holds none to sit
// beside: `<body>` in 1.2, `<file>` in 2.0 (which has no `<body>`).
const BODY_EL: ElementPattern = {
  open: /<(?:\w+:)?body(?:\s[^><]*)?>/iy,
  close: /<\/(?:\w+:)?body>/iy,
};

const FILE_EL: ElementPattern = {
  open: /<(?:\w+:)?file(?:\s[^><]*)?>/iy,
  close: /<\/(?:\w+:)?file>/iy,
};

const INDENT_STEP = '  ';

const TRANSLATABLE_EL: ElementPattern = {
  open: /<(?:\w+:)?(?:source|target)(?:\s[^><]*)?>/iy,
  close: /<\/(?:\w+:)?(?:source|target)>/iy,
};

// One `name="value"` pair. Scanned globally from the start of the attribute run
// so pairs are consumed whole, which is what keeps a `state='…'` sequence sitting
// INSIDE another attribute's value from being read as the element's state.
const ATTR_PAIR_RE = /([a-zA-Z_:][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g;

interface AttrMatch {
  /** Offset of the value within the attribute run. */
  valueStart: number;
  valueEnd: number;
  value: string;
  /** Offsets of the whole `name="value"` pair, including any leading space. */
  pairStart: number;
  pairEnd: number;
}

/**
 * Find an attribute by name in an element's attribute run.
 *
 * Attributes are walked as whole pairs rather than searched for with a single
 * unanchored regex, so a `state='…'` sequence sitting inside another attribute's
 * value cannot shadow the real one — which would leave the review state neither
 * read nor rewritten. Comparing the captured name in full also means `xstate=`
 * is not a `state`.
 */
function findAttr(attrs: string, name: string): AttrMatch | undefined {
  ATTR_PAIR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PAIR_RE.exec(attrs)) !== null) {
    if (match[1]!.toLowerCase() !== name) continue;
    const value = match[3]!;
    const valueEnd = match.index + match[0].length - 1;
    let pairStart = match.index;
    while (pairStart > 0 && /\s/.test(attrs[pairStart - 1]!)) pairStart--;
    return {
      valueStart: valueEnd - value.length,
      valueEnd,
      value,
      pairStart,
      pairEnd: match.index + match[0].length,
    };
  }
  return undefined;
}

/** The value written for a target this reconstruct has just filled in. */
const TRANSLATED_STATE = 'translated';

/**
 * XLIFF states saying a translation is present but not ready to ship. 1.2 keeps
 * `state` on `<target>`; 2.0 keeps it on `<segment>` with a four-value
 * vocabulary.
 *
 * An ABSENT attribute is deliberately NOT read as 2.0's documented `initial`
 * default: absent is what this parser writes and what a file from a toolchain
 * with no review workflow carries, so reading it as unfinished would report
 * every such project as needing review. Only an explicit claim counts, and an
 * unrecognised value counts as shippable for the same reason — a string this
 * list does not know is not evidence that the translation is unfinished.
 */
const UNFINISHED_STATES_V12: ReadonlySet<string> = new Set([
  'new',
  'needs-translation',
  'needs-l10n',
  'needs-adaptation',
  'needs-review-translation',
  'needs-review-l10n',
  'needs-review-adaptation',
]);

const UNFINISHED_STATES_V2: ReadonlySet<string> = new Set(['initial']);

function stateOf(attrs: string): string | undefined {
  return findAttr(attrs, 'state')?.value;
}

/**
 * Say the element holds a translation, on an element whose translation this
 * reconstruct has just replaced. Whatever the previous value claimed — that the
 * string still needed translating, or that a human had signed the old one off —
 * it does not describe the text now in the element. An element carrying no
 * `state` gains none: absence is this parser's own output shape.
 */
function withTranslatedState(attrs: string): string {
  let result = attrs;

  // `state-qualifier` (1.2) and `subState` (2.0) qualify a state that no longer
  // describes this element's text, so they are dropped rather than rewritten:
  // their vocabularies have no "this is machine output now" value. Removed before
  // `state` and `approved` are rewritten, so those offsets are still valid.
  for (const name of ['state-qualifier', 'substate']) {
    const found = findAttr(result, name);
    if (found) {
      result = result.slice(0, found.pairStart) + result.slice(found.pairEnd);
    }
  }

  // `approved="yes"` is 1.2's other claim that a human signed this text off. It
  // cannot describe text this run has just replaced.
  const approved = findAttr(result, 'approved');
  if (approved?.value.toLowerCase() === 'yes') {
    result =
      result.slice(0, approved.valueStart) +
      'no' +
      result.slice(approved.valueEnd);
  }

  const state = findAttr(result, 'state');
  if (state) {
    result =
      result.slice(0, state.valueStart) +
      TRANSLATED_STATE +
      result.slice(state.valueEnd);
  }
  return result;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const XML_ENTITY_RE = /&(?:(amp|lt|gt|quot|apos)|#(x[0-9a-fA-F]+|[0-9]+));/g;

/**
 * Decode XML entities in a single pass. Handles the five named entities
 * plus decimal (`&#NN;`) and hex (`&#xNN;`) numeric character references.
 *
 * The single pass is required for correctness: chained `.replace()` calls
 * double-decode `&amp;lt;` (`&amp;` → `&`, then `&lt;` → `<`), corrupting
 * payloads that carry literal entities.
 */
function unescapeXml(value: string): string {
  return value.replace(
    XML_ENTITY_RE,
    (match, named: string | undefined, numeric: string | undefined) => {
      if (named) return NAMED_ENTITIES[named] ?? match;
      if (numeric) {
        const code =
          numeric.startsWith('x') || numeric.startsWith('X')
            ? parseInt(numeric.slice(1), 16)
            : parseInt(numeric, 10);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return match;
    }
  );
}

/**
 * Refuse XLIFF input that contains a CDATA section inside a `<source>` or
 * `<target>` element. The regex-based extract/reconstruct pair cannot
 * round-trip CDATA correctly — the `<` / `>` inside a CDATA body would
 * round-trip asymmetrically through `escapeXml` — so silent data
 * corruption is the alternative. Fail fast with an allowlist-style
 * message, matching the posture of the Laravel PHP parser's heredoc /
 * interpolation rejection.
 */
function assertNoCdataInTranslatable(content: string): void {
  if (!content.includes('<![CDATA[')) return;
  for (const element of scanElements(content, TRANSLATABLE_EL)) {
    if (element.inner.includes('<![CDATA[')) {
      throw new ValidationError(
        'XLIFF <source> / <target> elements containing CDATA sections are not supported.',
        'Inline the literal text without the <![CDATA[...]]> wrapper, or preprocess the file to entity-escape CDATA content before syncing.'
      );
    }
  }
}

/**
 * Refuse a value XML 1.0 cannot carry. Every C0 byte except tab, LF and CR is
 * outside the `Char` production, so there is no escape and no numeric character
 * reference for it: written raw the file stops being well-formed and every
 * conforming consumer rejects it. Fail fast naming the unit, the same stance
 * this parser already takes on CDATA.
 */
function assertNoControlChars(id: string, value: string): void {
  const found = findForbiddenControlChar(value);
  if (found !== undefined) {
    throw new ValidationError(
      `XLIFF trans-unit "${id}" would contain ${describeControlChar(found)}, ` +
        `which XML 1.0 cannot represent in any form.`,
      'Remove the control character from the translation, or from the source string it came from.'
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * A value written inside a double-quoted attribute, where `"` also has to be
 * escaped.
 *
 * The unit id is interpolated into the `id` attribute, and a key can hold `"`
 * legitimately, since a single-quoted `id` may contain one. Written raw, that or
 * an `&` produces an element no XML consumer can read.
 */
function escapeXmlAttr(value: string): string {
  return escapeXml(value).replace(/"/g, '&quot;');
}

function detectVersion(content: string): string {
  const match = VERSION_RE.exec(content);
  return match?.[1] ?? '1.2';
}

function rewriteInner(element: ScannedElement, inner: string): string {
  return `${element.openTag}${inner}${element.closeTag}`;
}

/**
 * True when the block's `<target>` already holds exactly this translation, so
 * rewriting the element changes nothing it says. Compared in the terms
 * `extractTranslations` reports, since that is where the translation being
 * written back came from.
 */
function targetHolds(block: string, translation: string): boolean {
  const target = findElement(block, TARGET_EL);
  return target !== undefined && unescapeXml(target.inner) === translation;
}

/**
 * Replace the first `<target>` in a block, or insert one after `<source>`
 * when the block has none.
 */
function applyTarget(
  block: string,
  translation: string,
  markTranslated: boolean
): string {
  const escaped = escapeXml(translation);
  const target = findElement(block, TARGET_EL);
  if (target) {
    const ns = target.groups[0] ?? '';
    const existing = target.groups[1] ?? '';
    const attrs = markTranslated ? withTranslatedState(existing) : existing;
    return (
      block.slice(0, target.start) +
      `<${ns}target${attrs}>${escaped}</${ns}target>` +
      block.slice(target.end)
    );
  }

  const source = findElement(block, SOURCE_EL);
  if (!source) return block;
  const ns = source.groups[0] ?? '';
  return (
    block.slice(0, source.end) +
    `\n        <${ns}target>${escaped}</${ns}target>` +
    block.slice(source.end)
  );
}

export class XliffFormatParser implements FormatParser {
  readonly name = 'XLIFF';
  readonly configKey = 'xliff';
  readonly extensions = ['.xlf', '.xliff'];

  extract(content: string): ExtractedEntry[] {
    assertNoCdataInTranslatable(content);
    const version = detectVersion(content);
    const entries: ExtractedEntry[] = [];

    if (version === '2.0') {
      this.extractV2(content, entries);
    } else {
      this.extractV12(content, entries);
    }

    return entries;
  }

  /**
   * XLIFF is bilingual, so `extract().value` is `<source>` even when the file
   * being read is a target. The translation is `<target>`; a unit with no
   * `<target>`, or an empty one, is untranslated and is left out so a caller
   * re-translates it. The element is located exactly as `applyTarget` locates
   * the one it overwrites, so the map reports what a write would replace.
   */
  extractTranslations(content: string): Map<string, string> {
    assertNoCdataInTranslatable(content);
    const translations = new Map<string, string>();

    for (const unit of this.translatedUnits(content)) {
      translations.set(unit.key, unit.translation);
    }

    return translations;
  }

  /**
   * Keys whose `<target>` holds a translation the file's own state attribute
   * says is not ready to ship. The translation itself stays in
   * `extractTranslations`: it belongs to whoever set that state, and a run has
   * to carry it forward rather than replace it.
   */
  extractNeedsReview(content: string): Set<string> {
    assertNoCdataInTranslatable(content);
    const unfinished =
      detectVersion(content) === '2.0'
        ? UNFINISHED_STATES_V2
        : UNFINISHED_STATES_V12;
    const flagged = new Set<string>();

    for (const unit of this.translatedUnits(content)) {
      const state = stateOf(unit.stateAttrs);
      if (state !== undefined && unfinished.has(state)) {
        flagged.add(unit.key);
      }
    }

    return flagged;
  }

  /**
   * Every unit holding a translation, with the attributes of the element this
   * XLIFF version records a review state on — `<target>` in 1.2, `<segment>` in
   * 2.0. One walk, so the two readers above cannot disagree about which units
   * count as translated. A unit with no `<target>`, or an empty one, is
   * untranslated and is left out so a caller re-translates it. The element is
   * located exactly as `applyTarget` locates the one it overwrites, so what is
   * reported is what a write would replace.
   */
  private *translatedUnits(content: string): Generator<{
    key: string;
    translation: string;
    stateAttrs: string;
  }> {
    const isV2 = detectVersion(content) === '2.0';

    for (const element of scanElements(
      content,
      isV2 ? UNIT_EL : TRANS_UNIT_EL
    )) {
      const scope = isV2
        ? findElement(element.inner, SEGMENT_EL)
        : { inner: element.inner, openTag: element.openTag };
      if (scope === undefined) continue;
      if (!findElement(scope.inner, SOURCE_EL)) continue;

      const target = findElement(scope.inner, TARGET_EL);
      if (!target) continue;
      const translation = unescapeXml(target.inner);
      if (translation === '') continue;

      yield {
        key: unitId(element),
        translation,
        stateAttrs: isV2 ? scope.openTag : (target.groups[1] ?? ''),
      };
    }
  }

  reconstruct(content: string, entries: TranslatedEntry[]): string {
    assertNoCdataInTranslatable(content);
    const isV2 = detectVersion(content) === '2.0';
    const translations = new Map<string, string>();
    for (const entry of entries) {
      translations.set(entry.key, entry.translation);
    }

    const slotted = new Set<string>();
    const rewritten = isV2
      ? this.reconstructV2(content, translations, slotted)
      : this.reconstructV12(content, translations, slotted);
    return this.writeMissingUnits(rewritten, entries, slotted, isV2);
  }

  extractContext(content: string, key: string): string | undefined {
    const unit = detectVersion(content) === '2.0' ? UNIT_EL : TRANS_UNIT_EL;

    for (const element of scanElements(content, unit)) {
      if (unitId(element) !== key) continue;
      const note = findElement(element.inner, NOTE_EL);
      return note ? unescapeXml(note.inner) : undefined;
    }
    return undefined;
  }

  private extractV12(content: string, entries: ExtractedEntry[]): void {
    for (const element of scanElements(content, TRANS_UNIT_EL)) {
      const source = findElement(element.inner, SOURCE_EL);
      if (!source) continue;
      entries.push(this.toEntry(unitId(element), source.inner, element.inner));
    }
  }

  private extractV2(content: string, entries: ExtractedEntry[]): void {
    for (const element of scanElements(content, UNIT_EL)) {
      const segment = findElement(element.inner, SEGMENT_EL);
      if (!segment) continue;

      const source = findElement(segment.inner, SOURCE_EL);
      if (!source) continue;
      entries.push(this.toEntry(unitId(element), source.inner, element.inner));
    }
  }

  private toEntry(
    id: string,
    rawSource: string,
    block: string
  ): ExtractedEntry {
    const entry: ExtractedEntry = { key: id, value: unescapeXml(rawSource) };
    const note = findElement(block, NOTE_EL);
    if (note) {
      entry.context = unescapeXml(note.inner);
    }
    return entry;
  }

  /**
   * Write a unit for every entry the document has no `id` for. Such an entry is
   * a key added to the source file after this target was written: the target is
   * the reconstruct template, so it has no slot, and dropping the entry loses
   * the string with nothing to distinguish it from a key never asked for.
   */
  private writeMissingUnits(
    content: string,
    entries: readonly TranslatedEntry[],
    slotted: ReadonlySet<string>,
    isV2: boolean
  ): string {
    const missing = entries.filter((entry) => !slotted.has(entry.key));
    if (missing.length === 0) return content;

    const units = scanElements(content, isV2 ? UNIT_EL : TRANS_UNIT_EL);
    const anchor = units[units.length - 1];
    let at: number;
    let indent: string;
    if (anchor) {
      at = anchor.end;
      indent = lineIndentAt(content, anchor.start);
    } else {
      const container = findElement(content, isV2 ? FILE_EL : BODY_EL);
      if (!container) return content;
      at = container.start + container.openTag.length;
      indent = lineIndentAt(content, container.start) + INDENT_STEP;
    }
    // Namespace prefix taken from the element being written beside, the way
    // applyTarget takes it from the <source> it inserts after.
    const ns =
      (anchor ? /^<(\w+:)/.exec(anchor.openTag)?.[1] : undefined) ?? '';

    const blocks = missing.map((entry) => {
      // The KEY is checked as well as the translation: it is interpolated into
      // the `id` attribute, and XML 1.0 has no representation for a C0 byte in
      // any form — not even a numeric character reference — so a control byte in
      // a source key yields a file no consumer reads and a live terminal
      // sequence in `git diff`.
      assertNoControlChars(entry.key, entry.key);
      assertNoControlChars(entry.key, entry.translation);
      const inner = isV2
        ? indent + INDENT_STEP.repeat(2)
        : indent + INDENT_STEP;
      const body = [
        `${inner}<${ns}source>${escapeXml(entry.value)}</${ns}source>`,
        `${inner}<${ns}target>${escapeXml(entry.translation)}</${ns}target>`,
      ];
      if (!isV2) {
        return [
          `<${ns}trans-unit id="${escapeXmlAttr(entry.key)}">`,
          ...body,
          `${indent}</${ns}trans-unit>`,
        ].join('\n');
      }
      return [
        `<${ns}unit id="${escapeXmlAttr(entry.key)}">`,
        `${indent}${INDENT_STEP}<${ns}segment>`,
        ...body,
        `${indent}${INDENT_STEP}</${ns}segment>`,
        `${indent}</${ns}unit>`,
      ].join('\n');
    });

    return insertBlocksAt(content, at, indent, blocks);
  }

  private reconstructV12(
    content: string,
    translations: Map<string, string>,
    slotted: Set<string>
  ): string {
    const result = replaceElements(content, TRANS_UNIT_EL, (element) => {
      const id = unitId(element);
      slotted.add(id);
      const translation = translations.get(id);
      if (translation === undefined) return '';
      assertNoControlChars(id, translation);
      const changed = !targetHolds(element.inner, translation);
      return rewriteInner(
        element,
        applyTarget(element.inner, translation, changed)
      );
    });
    return result.replace(/\n{3,}/g, '\n\n');
  }

  private reconstructV2(
    content: string,
    translations: Map<string, string>,
    slotted: Set<string>
  ): string {
    const result = replaceElements(content, UNIT_EL, (element) => {
      const id = unitId(element);
      slotted.add(id);
      const translation = translations.get(id);
      if (translation === undefined) return '';
      assertNoControlChars(id, translation);

      const segment = findElement(element.inner, SEGMENT_EL);
      if (!segment) return element.text;

      // 2.0 records the review state on the segment rather than the target.
      const changed = !targetHolds(segment.inner, translation);
      const openTag = changed
        ? withTranslatedState(segment.openTag)
        : segment.openTag;
      const inner =
        element.inner.slice(0, segment.start) +
        openTag +
        applyTarget(segment.inner, translation, changed) +
        segment.closeTag +
        element.inner.slice(segment.end);
      return rewriteInner(element, inner);
    });
    return result.replace(/\n{3,}/g, '\n\n');
  }
}
