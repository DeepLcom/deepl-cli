/**
 * A target file that cannot be read is not a target file that is not there.
 *
 * Every caller that opens a locale's file has to tell the two apart: the
 * lockfile stores hashes rather than translated text, so a file on disk holds
 * the only copy of its locale's translations, while a file that has never been
 * written holds nothing and is safe to create.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readTargetFile } from '../../../src/sync/sync-target-read';
import { PropertiesFormatParser } from '../../../src/formats/properties';
import { XcstringsFormatParser } from '../../../src/formats/xcstrings';
import { JsonFormatParser } from '../../../src/formats/json';
import type { FormatParser } from '../../../src/formats/format';

describe('readTargetFile()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-target-read-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function target(): string {
    return path.join(tmpDir, 'es.properties');
  }

  it('reports a file that is not there as absent', async () => {
    const read = await readTargetFile(new PropertiesFormatParser(), target());

    expect(read).toEqual({ state: 'absent' });
  });

  it('returns the content and the translations of a file it can parse', async () => {
    fs.writeFileSync(target(), 'greeting=Hola\nadded=Traduceme\n');

    const read = await readTargetFile(new PropertiesFormatParser(), target());

    expect(read.state).toBe('usable');
    if (read.state !== 'usable') return;
    expect(read.content).toBe('greeting=Hola\nadded=Traduceme\n');
    expect([...read.translations]).toEqual([
      ['greeting', 'Hola'],
      ['added', 'Traduceme'],
    ]);
  });

  it('reports a file the parser refuses as unusable, with the reason', async () => {
    fs.writeFileSync(target(), 'greeting=Hola\n');
    const refusing = {
      ...new PropertiesFormatParser(),
      extract: () => {
        throw new Error('two strings share one key');
      },
    } as unknown as FormatParser;

    const read = await readTargetFile(refusing, target());

    expect(read.state).toBe('unusable');
    if (read.state !== 'unusable') return;
    expect(read.reason).toBe('two strings share one key');
    // The error itself travels with the reason so a caller can tell one cause
    // apart from another — pull reports a collision under its own skip reason.
    expect(read.error).toBeInstanceOf(Error);
  });

  it('reports a real collision in a JSON target as unusable', async () => {
    const jsonTarget = path.join(tmpDir, 'es.json');
    fs.writeFileSync(
      jsonTarget,
      JSON.stringify({ 'a.b': 'FLAT', a: { b: 'NESTED' } }, null, 2)
    );

    const read = await readTargetFile(new JsonFormatParser(), jsonTarget);

    expect(read.state).toBe('unusable');
    if (read.state !== 'unusable') return;
    expect(read.reason).toContain("'a.b' is the key of two different strings");
  });

  it('reports a read failure that is not "no such file" as unusable', async () => {
    // A directory where a file is expected fails with EISDIR, which says the
    // path is occupied — the opposite of the absent case.
    fs.mkdirSync(target());

    const read = await readTargetFile(new PropertiesFormatParser(), target());

    expect(read.state).toBe('unusable');
    if (read.state !== 'unusable') return;
    expect(read.reason).toContain('EISDIR');
  });

  it('reads the named locale out of a multi-locale file', async () => {
    const xcstrings = path.join(tmpDir, 'app.xcstrings');
    fs.writeFileSync(
      xcstrings,
      JSON.stringify(
        {
          sourceLanguage: 'en',
          version: '1.0',
          strings: {
            greeting: {
              localizations: {
                en: { stringUnit: { state: 'translated', value: 'Hello' } },
                es: { stringUnit: { state: 'translated', value: 'Hola' } },
              },
            },
          },
        },
        null,
        2
      )
    );

    const read = await readTargetFile(
      new XcstringsFormatParser(),
      xcstrings,
      'es'
    );

    expect(read.state).toBe('usable');
    if (read.state !== 'usable') return;
    expect(read.translations.get('greeting')).toBe('Hola');
  });
});
