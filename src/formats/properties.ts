import type {
  ExtractedEntry,
  FormatParser,
  TranslatedEntry,
} from './format.js';
import { PendingCommentBuffer } from './pending-comment-buffer.js';
import { appendEntryLines } from './util/append-lines.js';
import { isForbiddenControlChar } from './util/control-chars.js';

// A key, treating `\X` as one unit so an escaped separator belongs to the key
// rather than ending it. Without that the parser could not read back a key it
// had just written: `escapeKey` escapes `=`, `:`, space and backslash, so
// `greeting:formal` is written `greeting\:formal` and was then split at the
// escaped colon — key `greeting\`, value `formal=Hello`. Half the key went out
// for translation as the value, and the real key never reached the target file.
const KEY_CHARS = String.raw`(?:[^=:#!\s\\]|\\.)(?:[^=:\\]|\\.)*?`;

// `key = value` / `key: value`.
const ENTRY_RE = new RegExp(String.raw`^(${KEY_CHARS})\s*[=:]\s*(.*)`);

// The key and its separator, byte for byte, so rewriting a value preserves the
// author's spelling of the line (`:` versus `=`, and the spacing around it).
const KEY_SEPARATOR_RE = new RegExp(String.raw`^(${KEY_CHARS}\s*[=:]\s*)`);
const COMMENT_RE = /^\s*[#!]/;

/**
 * A trailing backslash continues the line only when the run of backslashes
 * ending it is odd; an even run is one or more escaped literal backslashes,
 * which is exactly what escapeValue emits for a value ending in `\`. Testing
 * `endsWith('\\')` instead consumed the following entry and appended its raw
 * `key=value` text to the previous value.
 */
function continuesOnNextLine(line: string): boolean {
  let backslashes = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

export class PropertiesFormatParser implements FormatParser {
  readonly name = 'Java Properties';
  readonly configKey = 'properties';
  readonly extensions = ['.properties'];

  extract(content: string): ExtractedEntry[] {
    const entries: ExtractedEntry[] = [];
    const lines = content.split(/\r?\n/);
    let pendingComment: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!;
      const trimmed = line.trim();

      if (trimmed === '') {
        pendingComment = undefined;
        continue;
      }

      if (COMMENT_RE.test(trimmed)) {
        pendingComment = trimmed.replace(/^\s*[#!]\s?/, '');
        continue;
      }

      // Handle line continuations (trailing backslash)
      while (continuesOnNextLine(line) && i + 1 < lines.length) {
        i++;
        line = line.slice(0, -1) + lines[i]!.trimStart();
      }

      const match = ENTRY_RE.exec(line);
      if (match) {
        const key = this.unescapeKey(match[1]!.trim());
        const value = this.unescapeValue(match[2]!);
        const entry: ExtractedEntry = { key, value };
        if (pendingComment !== undefined) {
          entry.metadata = { comment: pendingComment };
        }
        entries.push(entry);
        pendingComment = undefined;
      }
    }

    return entries;
  }

  reconstruct(content: string, entries: TranslatedEntry[]): string {
    const translations = new Map<string, string>();
    for (const entry of entries) {
      translations.set(entry.key, entry.translation);
    }

    const lines = content.split(/\r?\n/);
    const result: string[] = [];
    const pending = new PendingCommentBuffer();
    const slotted = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!;
      const trimmed = line.trim();

      if (trimmed === '') {
        pending.collect(line);
        continue;
      }

      if (COMMENT_RE.test(trimmed)) {
        pending.collect(line);
        continue;
      }

      // Handle line continuations
      const startLine = i;
      while (continuesOnNextLine(line) && i + 1 < lines.length) {
        i++;
        line = line.slice(0, -1) + lines[i]!.trimStart();
      }

      const match = ENTRY_RE.exec(line);
      if (match) {
        const key = this.unescapeKey(match[1]!.trim());
        slotted.add(key);
        const translation = translations.get(key);
        if (translation !== undefined) {
          pending.flushToOutput(result);
          const escapedValue = this.escapeValue(translation);
          const originalLine = lines[startLine]!;
          const sepMatch = KEY_SEPARATOR_RE.exec(originalLine);
          if (sepMatch) {
            result.push(sepMatch[1] + escapedValue);
          } else {
            result.push(`${this.escapeKey(key)}=${escapedValue}`);
          }
        } else {
          pending.drop();
        }
      } else {
        pending.flushToOutput(result);
        result.push(line);
      }
    }
    pending.flushToOutput(result);

    // A key with no line in the template is one added to the source since this
    // target file was written. Dropping it loses the string with no trace: the
    // caller has no way to tell a key it asked for from one it did not.
    const appended: string[] = [];
    for (const [key, translation] of translations) {
      if (slotted.has(key)) continue;
      appended.push(`${this.escapeKey(key)}=${this.escapeValue(translation)}`);
    }
    appendEntryLines(result, appended);

    return result.join('\n');
  }

  private unescapeKey(s: string): string {
    return this.unescapeValue(s);
  }

  private unescapeValue(s: string): string {
    let result = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '\\' && i + 1 < s.length) {
        const next = s[i + 1]!;
        switch (next) {
          case 'n':
            result += '\n';
            i += 2;
            break;
          case 't':
            result += '\t';
            i += 2;
            break;
          case 'r':
            result += '\r';
            i += 2;
            break;
          case '\\':
            result += '\\';
            i += 2;
            break;
          case '=':
            result += '=';
            i += 2;
            break;
          case ':':
            result += ':';
            i += 2;
            break;
          case ' ':
            result += ' ';
            i += 2;
            break;
          case 'u': {
            const hex = s.slice(i + 2, i + 6);
            if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
              result += String.fromCharCode(parseInt(hex, 16));
              i += 6;
            } else {
              result += next;
              i += 2;
            }
            break;
          }
          default:
            result += next;
            i += 2;
            break;
        }
      } else {
        result += s[i]!;
        i++;
      }
    }
    return result;
  }

  private escapeKey(s: string): string {
    return s.replace(/[=: \\]/g, (ch) => '\\' + ch);
  }

  private escapeValue(s: string): string {
    // Leading spaces must be escaped: the value parser strips unescaped
    // whitespace after the separator, so a raw leading space is lost on
    // the next read. (Leading tabs are covered by the \t escape below.)
    const leading = /^ +/.exec(s);
    let result = leading ? '\\ '.repeat(leading[0].length) : '';
    for (const ch of s.slice(leading ? leading[0].length : 0)) {
      switch (ch) {
        case '\n':
          result += '\\n';
          break;
        case '\t':
          result += '\\t';
          break;
        case '\r':
          result += '\\r';
          break;
        case '\\':
          result += '\\\\';
          break;
        default: {
          // `\uXXXX` also carries the C0 controls the earlier cases do not:
          // written raw they survive into git, where a `git diff` or a CI log
          // viewer renders an ESC sequence as a live terminal command.
          if (
            ch.codePointAt(0)! > 0x7e ||
            isForbiddenControlChar(ch.codePointAt(0)!)
          ) {
            // Emit every UTF-16 code unit: an astral character such as an
            // emoji is a surrogate pair, and writing only charCodeAt(0)
            // leaves a lone high surrogate that cannot be decoded back.
            for (let i = 0; i < ch.length; i++) {
              result += '\\u' + ch.charCodeAt(i).toString(16).padStart(4, '0');
            }
          } else {
            result += ch;
          }
          break;
        }
      }
    }
    return result;
  }
}
