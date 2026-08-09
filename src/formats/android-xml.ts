import {
  assertDistinctKeys,
  type ExtractedEntry,
  type FormatParser,
  type TranslatedEntry,
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
import { primaryPluralItem } from './util/plurals.js';

interface PluralItem {
  quantity: string;
  value: string;
}

const ATTRS = String.raw`((?:\s+[a-zA-Z_:][a-zA-Z0-9_:.-]*=(?:"[^"<]*"|'[^'<]*'))*)`;

const STRING_EL: ElementPattern = {
  open: new RegExp(
    String.raw`<string\s+name=(["\'])((?:(?!\1)[^<])+)\1${ATTRS}>`,
    'y'
  ),
  close: /<\/string>/y,
};

const PLURALS_EL: ElementPattern = {
  open: new RegExp(
    String.raw`<plurals\s+name=(["\'])((?:(?!\1)[^<])+)\1${ATTRS}>`,
    'y'
  ),
  close: /<\/plurals>/y,
};

const PLURAL_ITEM_EL: ElementPattern = {
  open: new RegExp(
    String.raw`<item\s+quantity=(["\'])((?:(?!\1)[^<])+)\1${ATTRS}>`,
    'y'
  ),
  close: /<\/item>/y,
};

const STRING_ARRAY_EL: ElementPattern = {
  open: new RegExp(
    String.raw`<string-array\s+name=(["\'])((?:(?!\1)[^<])+)\1${ATTRS}>`,
    'y'
  ),
  close: /<\/string-array>/y,
};

const ARRAY_ITEM_EL: ElementPattern = {
  open: /<item>/y,
  close: /<\/item>/y,
};

const RESOURCES_EL: ElementPattern = {
  open: /<resources(?:\s[^><]*)?>/y,
  close: /<\/resources>/y,
};

/**
 * The `name` / `quantity` of a scanned element.
 *
 * Group 0 is the quote delimiter, captured so the value can exclude only the
 * delimiter actually in use. Requiring a double quote made
 * `<string name='greeting'>` — well-formed XML, and already accepted for every
 * other attribute by ATTRS — invisible: never extracted, never translated and
 * never reported, so `sync status` read 100% while the string shipped in the
 * source language.
 */
function attrValue(element: ScannedElement): string {
  // Entity-decoded, because the writer escapes `&`/`"` when it interpolates a
  // key into the attribute. Without decoding here the key would not round-trip:
  // extract would report `a&amp;b` for the key the writer was given as `a&b`.
  return decodeXmlEntities(element.groups[1]!);
}

/** The element's remaining attributes, preserved verbatim on rewrite. */
function otherAttrs(element: ScannedElement): string {
  return element.groups[2] ?? '';
}

const INDENT_STEP = '    ';

// A `<string-array>` element's entries are keyed `<name>.<index>`, so a key
// ending in a dot-integer cannot be told apart from a plain resource whose name
// happens to end that way. Writing a new resource for one would invent a
// `<string>` named after an array slot, so those are left to the caller.
const ARRAY_ITEM_KEY_RE = /\.\d+$/;

const TRANSLATABLE_FALSE_RE = /\btranslatable\s*=\s*"false"/;

const XML_ENTITY_RE = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g;

/**
 * Decodes XML entities in a single pass, so a literal `&amp;lt;` decodes to
 * `&lt;` rather than collapsing all the way to `<`.
 */
function decodeXmlEntities(value: string): string {
  return value.replace(
    XML_ENTITY_RE,
    (
      match,
      hex: string | undefined,
      dec: string | undefined,
      named: string | undefined
    ) => {
      if (hex !== undefined) {
        const code = Number.parseInt(hex, 16);
        return code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      if (dec !== undefined) {
        const code = Number.parseInt(dec, 10);
        return code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      switch (named) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default:
          return match;
      }
    }
  );
}

function unescapeAndroid(value: string): string {
  const withoutBackslashEscapes = value.replace(
    /\\(\\|'|"|n|t|r)/g,
    (_match, ch: string) => {
      switch (ch) {
        case '\\':
          return '\\';
        case "'":
          return "'";
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
    }
  );
  return decodeXmlEntities(withoutBackslashEscapes);
}

/**
 * A value written inside a double-quoted XML attribute.
 *
 * `name` / `quantity` used to be interpolated raw, so a key holding `&` or `"`
 * produced an element no XML consumer can read.
 */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAndroid(value: string): string {
  return (
    value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      // & must precede < and >, or the entities produced below get re-escaped
      // into &amp;lt; — which compounds on every subsequent sync run.
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  );
}

/**
 * Refuse a value that would close the CDATA section it is written into.
 * Nothing inside a CDATA body is entity-escaped, so the text after a "]]>"
 * would be parsed as XML — an injected element in a generated resource file.
 * Fail fast rather than rewrite the value into something the round-trip
 * cannot reproduce, matching the XLIFF parser's stance on CDATA.
 */
/**
 * Refuse a value XML 1.0 cannot carry. Every C0 byte except tab, LF and CR is
 * outside the `Char` production, so there is no escape and no numeric character
 * reference for it: written raw the file stops being well-formed and aapt2
 * rejects the resource. Fail fast naming the resource, matching this parser's
 * existing stance on a CDATA breakout.
 */
function assertNoControlChars(name: string, value: string): void {
  const found = findForbiddenControlChar(value);
  if (found !== undefined) {
    throw new ValidationError(
      `Android resource "${name}" would contain ${describeControlChar(found)}, ` +
        `which XML 1.0 cannot represent in any form.`,
      'Remove the control character from the translation, or from the source string it came from.'
    );
  }
}

function assertNoCdataBreakout(value: string): void {
  if (value.includes(']]>')) {
    throw new ValidationError(
      'Android CDATA values containing "]]>" are not supported.',
      'Remove the "]]>" sequence from the text, or drop the <![CDATA[...]]> wrapper in the source file so the value is entity-escaped instead.'
    );
  }
}

export class AndroidXmlFormatParser implements FormatParser {
  readonly name = 'Android XML';
  readonly configKey = 'android_xml';
  readonly extensions = ['.xml'];

  extract(content: string): ExtractedEntry[] {
    const entries: ExtractedEntry[] = [];

    this.extractStrings(content, entries);
    this.extractPlurals(content, entries);
    this.extractStringArrays(content, entries);

    assertDistinctKeys(entries, 'Android XML', '.');

    return entries;
  }

  reconstruct(originalContent: string, entries: TranslatedEntry[]): string {
    const translations = new Map<string, string>();
    const pluralTranslations = new Map<string, Map<string, string>>();
    const arrayTranslations = new Map<string, Map<number, string>>();
    let arrayNames: Set<string> | undefined;

    for (const entry of entries) {
      if (entry.metadata?.['plurals']) {
        const plurals = entry.metadata['plurals'] as PluralItem[];
        const quantityMap = new Map<string, string>();
        for (const p of plurals) {
          quantityMap.set(p.quantity, p.value);
        }
        pluralTranslations.set(entry.key, quantityMap);
      } else if (entry.key.includes('.')) {
        const lastDot = entry.key.lastIndexOf('.');
        const arrayName = entry.key.substring(0, lastDot);
        const index = parseInt(entry.key.substring(lastDot + 1), 10);
        arrayNames ??= new Set(
          scanElements(originalContent, STRING_ARRAY_EL).map((el) =>
            attrValue(el)
          )
        );

        if (!isNaN(index) && arrayNames.has(arrayName)) {
          if (!arrayTranslations.has(arrayName)) {
            arrayTranslations.set(arrayName, new Map());
          }
          arrayTranslations.get(arrayName)!.set(index, entry.translation);
        } else {
          translations.set(entry.key, entry.translation);
        }
      } else {
        translations.set(entry.key, entry.translation);
      }
    }

    let result = replaceElements(originalContent, STRING_EL, (el) => {
      const attrs = otherAttrs(el);
      if (TRANSLATABLE_FALSE_RE.test(attrs)) {
        return el.text;
      }
      const translation = translations.get(attrValue(el));
      if (translation === undefined) {
        return null;
      }
      return this.rewriteInner(
        el,
        this.escapeForReconstruct(attrValue(el), el.inner, translation)
      );
    });

    result = replaceElements(result, PLURALS_EL, (el) => {
      const quantityMap = pluralTranslations.get(attrValue(el));
      if (!quantityMap) {
        // An entry handed over without per-form translations is one whose
        // plural forms this run did not translate: the element keeps the items
        // it already holds. Only a key absent from the entry list is removed.
        return translations.has(attrValue(el)) ? el.text : null;
      }
      const inner = replaceElements(el.inner, PLURAL_ITEM_EL, (item) => {
        const translation = quantityMap.get(attrValue(item));
        if (translation === undefined) {
          return item.text;
        }
        return this.rewriteInner(
          item,
          this.escapeForReconstruct(attrValue(el), item.inner, translation)
        );
      });
      return this.rewriteInner(el, inner);
    });

    result = replaceElements(result, STRING_ARRAY_EL, (el) => {
      const indexMap = arrayTranslations.get(attrValue(el));
      if (!indexMap) {
        return null;
      }
      let index = 0;
      const inner = replaceElements(el.inner, ARRAY_ITEM_EL, (item) => {
        const translation = indexMap.get(index);
        index++;
        if (translation === undefined) {
          return item.text;
        }
        return this.rewriteInner(
          item,
          this.escapeForReconstruct(attrValue(el), item.inner, translation)
        );
      });
      return this.rewriteInner(el, inner);
    });

    return this.writeMissingResources(result, translations, pluralTranslations);
  }

  /**
   * Write a resource for every entry the document has no element for. Such an
   * entry is a key added to the source file after this target was written: the
   * target is the reconstruct template, so it has no slot, and dropping the
   * entry loses the string with nothing to distinguish it from a key never
   * asked for.
   *
   * A new `<string-array>` item is not written — see ARRAY_ITEM_KEY_RE.
   */
  private writeMissingResources(
    content: string,
    translations: Map<string, string>,
    pluralTranslations: Map<string, Map<string, string>>
  ): string {
    const strings = scanElements(content, STRING_EL);
    const plurals = scanElements(content, PLURALS_EL);
    const arrays = scanElements(content, STRING_ARRAY_EL);
    const slotted = new Set(
      [...strings, ...plurals, ...arrays].map((el) => attrValue(el))
    );

    const missingStrings = [...translations].filter(
      ([name]) => !slotted.has(name) && !ARRAY_ITEM_KEY_RE.test(name)
    );
    const missingPlurals = [...pluralTranslations].filter(
      ([name, quantities]) => !slotted.has(name) && quantities.size > 0
    );
    if (missingStrings.length === 0 && missingPlurals.length === 0) {
      return content;
    }

    const anchor =
      strings[strings.length - 1] ??
      plurals[plurals.length - 1] ??
      arrays[arrays.length - 1];
    let at: number;
    let indent: string;
    if (anchor) {
      at = anchor.end;
      indent = lineIndentAt(content, anchor.start);
    } else {
      const resources = findElement(content, RESOURCES_EL);
      if (!resources) return content;
      at = resources.start + resources.openTag.length;
      indent = lineIndentAt(content, resources.start) + INDENT_STEP;
    }

    const blocks = [
      ...missingStrings.map(([name, translation]) => {
        // The KEY is checked as well as the translation: it is interpolated into
        // the `name` attribute, and XML 1.0 has no representation for a C0 byte
        // in any form, so a control byte in a source key produced a file no
        // consumer reads and a live terminal sequence in `git diff`.
        assertNoControlChars(name, name);
        assertNoControlChars(name, translation);
        return `<string name="${escapeXmlAttr(name)}">${escapeAndroid(translation)}</string>`;
      }),
      ...missingPlurals.map(([name, quantities]) => {
        assertNoControlChars(name, name);
        return [
          `<plurals name="${escapeXmlAttr(name)}">`,
          ...[...quantities].map(([quantity, value]) => {
            assertNoControlChars(name, quantity);
            assertNoControlChars(name, value);
            return `${indent}${INDENT_STEP}<item quantity="${escapeXmlAttr(quantity)}">${escapeAndroid(value)}</item>`;
          }),
          `${indent}</plurals>`,
        ].join('\n');
      }),
    ];

    return insertBlocksAt(content, at, indent, blocks);
  }

  private rewriteInner(element: ScannedElement, inner: string): string {
    return `${element.openTag}${inner}${element.closeTag}`;
  }

  private extractStrings(content: string, entries: ExtractedEntry[]): void {
    for (const el of scanElements(content, STRING_EL)) {
      if (TRANSLATABLE_FALSE_RE.test(otherAttrs(el))) {
        continue;
      }
      entries.push({ key: attrValue(el), value: this.decodeValue(el.inner) });
    }
  }

  private extractPlurals(content: string, entries: ExtractedEntry[]): void {
    for (const el of scanElements(content, PLURALS_EL)) {
      const plurals: PluralItem[] = scanElements(el.inner, PLURAL_ITEM_EL).map(
        (item) => ({
          quantity: attrValue(item),
          value: this.decodeValue(item.inner),
        })
      );

      const defaultItem = primaryPluralItem(plurals);
      entries.push({
        key: attrValue(el),
        value: defaultItem?.value ?? '',
        metadata: { plurals },
      });
    }
  }

  private extractStringArrays(
    content: string,
    entries: ExtractedEntry[]
  ): void {
    for (const el of scanElements(content, STRING_ARRAY_EL)) {
      const name = attrValue(el);
      let index = 0;
      for (const item of scanElements(el.inner, ARRAY_ITEM_EL)) {
        entries.push({
          key: `${name}.${index}`,
          value: this.decodeValue(item.inner),
        });
        index++;
      }
    }
  }

  private decodeValue(raw: string): string {
    if (raw.startsWith('<![CDATA[')) {
      // Adjacent sections concatenate, so `<![CDATA[a]]><![CDATA[b]]>` is "ab".
      const sectionRe = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
      let joined = '';
      let consumedTo = 0;
      let match: RegExpExecArray | null;
      while ((match = sectionRe.exec(raw)) !== null) {
        if (match.index !== consumedTo) break;
        joined += match[1]!;
        consumedTo = match.index + match[0].length;
      }
      if (consumedTo === raw.length) return joined;
    }
    return unescapeAndroid(raw);
  }

  private escapeForReconstruct(
    name: string,
    originalInner: string,
    translation: string
  ): string {
    assertNoControlChars(name, translation);
    if (originalInner.startsWith('<![CDATA[')) {
      assertNoCdataBreakout(translation);
      return `<![CDATA[${translation}]]>`;
    }
    return escapeAndroid(translation);
  }
}
