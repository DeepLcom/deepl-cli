/**
 * Integration tests for the watch output layout.
 *
 * Every translation a watch session writes lands under one output directory, so
 * the output path has to carry the source's directory as well as its name:
 * flattening to the basename made two same-named sources in different
 * directories write the same file. The layout mirrors what
 * `deepl translate <dir> --output <dir>` already produces. Real files and a
 * real write path; only the translation call is stubbed.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.mock('p-limit', () => ({
  __esModule: true,
  default: (_concurrency: number) => {
    return (fn: () => Promise<unknown>) => fn();
  },
}));

import { WatchService } from '../../src/services/watch.js';
import { FileTranslationService } from '../../src/services/file-translation.js';
import { TranslationService } from '../../src/services/translation.js';
import type { Language } from '../../src/types/index.js';
import { createMockTranslationService } from '../helpers/mock-factories';

const DEBOUNCE_MS = 20;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const filesUnder = (dir: string): string[] => {
  const found: string[] = [];
  const walk = (current: string, relative: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        walk(child, childRelative);
      } else {
        found.push(childRelative);
      }
    }
  };
  walk(dir, '');
  return found.sort();
};

/**
 * Waits for the writes to land rather than sleeping a fixed span: the
 * structured-format path imports its service on first use, which under a full
 * suite run takes longer than any debounce multiple worth hard-coding. Returns
 * whatever is on disk when the count is reached or the bound expires, so the
 * assertion still reports the real listing on a genuine failure.
 */
const waitForFiles = async (dir: string, count: number): Promise<string[]> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const found = filesUnder(dir);
    if (found.length >= count) {
      return found;
    }
    await sleep(DEBOUNCE_MS);
  }
  return filesUnder(dir);
};

describe('Watch output layout integration', () => {
  let tmpDir: string;
  let sourceDir: string;
  let outDir: string;
  let watchService: WatchService;
  let translationService: jest.Mocked<TranslationService>;

  beforeEach(() => {
    // Realpath because the CLI is handed the spelling below while a comparison
    // against a path produced elsewhere would see /private/var on macOS.
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-layout-'))
    );
    sourceDir = path.join(tmpDir, 'src');
    outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    translationService = createMockTranslationService();
    const DEFAULT_LANG = 'es' as Language;
    translationService.translate.mockImplementation(
      async (text: string, options?: { targetLang?: Language }) => ({
        text: `${options?.targetLang ?? DEFAULT_LANG}:${text}`,
        detectedSourceLang: 'en' as Language,
        targetLang: options?.targetLang ?? DEFAULT_LANG,
        billedCharacters: text.length,
      })
    );
    translationService.translateBatch.mockImplementation(
      async (texts: string[], options: { targetLang: Language }) =>
        texts.map((text) => ({
          text: `${options.targetLang}:${text}`,
          detectedSourceLang: 'en',
          targetLang: options.targetLang,
          billedCharacters: text.length,
        }))
    );
    translationService.translateToMultiple.mockImplementation(
      async (text: string, targetLangs: readonly Language[]) =>
        targetLangs.map((targetLang) => ({
          text: `${targetLang}:${text}`,
          detectedSourceLang: 'en',
          targetLang,
          billedCharacters: text.length,
        }))
    );

    watchService = new WatchService(
      new FileTranslationService(translationService),
      { debounceMs: DEBOUNCE_MS }
    );
  });

  afterEach(async () => {
    await watchService.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const write = (relative: string, contents: string): string => {
    const full = path.join(sourceDir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
    return full;
  };

  it('keeps both translations when two sources share a basename', async () => {
    const a = write(path.join('a', 'doc.md'), 'Hello\n');
    const b = write(path.join('b', 'doc.md'), 'Good morning\n');

    watchService.watch(sourceDir, { targetLangs: ['es'], outputDir: outDir });
    watchService.handleFileChange(a);
    watchService.handleFileChange(b);

    expect(await waitForFiles(outDir, 2)).toEqual([
      path.join('a', 'doc.es.md'),
      path.join('b', 'doc.es.md'),
    ]);
    expect(fs.readFileSync(path.join(outDir, 'a', 'doc.es.md'), 'utf-8')).toBe(
      'es:Hello\n'
    );
    expect(fs.readFileSync(path.join(outDir, 'b', 'doc.es.md'), 'utf-8')).toBe(
      'es:Good morning\n'
    );
  });

  it('keeps both translations for every target when two sources share a basename', async () => {
    const a = write(path.join('a', 'doc.md'), 'Hello\n');
    const b = write(path.join('b', 'doc.md'), 'Good morning\n');

    watchService.watch(sourceDir, {
      targetLangs: ['es', 'fr'],
      outputDir: outDir,
    });
    watchService.handleFileChange(a);
    watchService.handleFileChange(b);

    expect(await waitForFiles(outDir, 4)).toEqual([
      path.join('a', 'doc.es.md'),
      path.join('a', 'doc.fr.md'),
      path.join('b', 'doc.es.md'),
      path.join('b', 'doc.fr.md'),
    ]);
    expect(fs.readFileSync(path.join(outDir, 'a', 'doc.fr.md'), 'utf-8')).toBe(
      'fr:Hello\n'
    );
    expect(fs.readFileSync(path.join(outDir, 'b', 'doc.fr.md'), 'utf-8')).toBe(
      'fr:Good morning\n'
    );
  });

  it('keeps a structured file per source directory', async () => {
    const a = write(path.join('a', 'app.json'), '{"greeting":"Hello"}');
    const b = write(path.join('b', 'app.json'), '{"greeting":"Good morning"}');

    watchService.watch(sourceDir, {
      targetLangs: ['es', 'fr'],
      outputDir: outDir,
    });
    watchService.handleFileChange(a);
    watchService.handleFileChange(b);

    expect(await waitForFiles(outDir, 4)).toEqual([
      path.join('a', 'app.es.json'),
      path.join('a', 'app.fr.json'),
      path.join('b', 'app.es.json'),
      path.join('b', 'app.fr.json'),
    ]);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(outDir, 'b', 'app.es.json'), 'utf-8')
      )
    ).toEqual({ greeting: 'es:Good morning' });
  });

  it('translates each source once per target and no more', async () => {
    const a = write(path.join('a', 'doc.md'), 'Hello\n');
    const b = write(path.join('b', 'doc.md'), 'Good morning\n');

    watchService.watch(sourceDir, { targetLangs: ['es'], outputDir: outDir });
    watchService.handleFileChange(a);
    watchService.handleFileChange(b);
    await waitForFiles(outDir, 2);
    // A settling span on top, so a third call would have arrived by now.
    await sleep(DEBOUNCE_MS * 8);

    expect(translationService.translate).toHaveBeenCalledTimes(2);
    expect(
      translationService.translate.mock.calls.map((call) => call[0]).sort()
    ).toEqual(['Good morning\n', 'Hello\n']);
  });

  it('leaves a source at the top of the watched directory flat', async () => {
    const doc = write('doc.md', 'Hello\n');

    watchService.watch(sourceDir, { targetLangs: ['es'], outputDir: outDir });
    watchService.handleFileChange(doc);

    expect(await waitForFiles(outDir, 1)).toEqual(['doc.es.md']);
    expect(fs.readFileSync(path.join(outDir, 'doc.es.md'), 'utf-8')).toBe(
      'es:Hello\n'
    );
  });

  it('leaves the output flat when the watched path is a single nested file', async () => {
    const doc = write(path.join('a', 'doc.md'), 'Hello\n');

    watchService.watch(doc, { targetLangs: ['es'], outputDir: outDir });
    watchService.handleFileChange(doc);

    expect(await waitForFiles(outDir, 1)).toEqual(['doc.es.md']);
  });
});
