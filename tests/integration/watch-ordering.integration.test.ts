/**
 * Integration tests for watch-mode write ordering.
 *
 * Real files, real FileTranslationService and real atomicWriteFile; only the
 * translation call is stubbed, with a per-call delay so the API returns out of
 * request order. The invariant under test is the content left on disk: the
 * translation of the newest source version, never an older one.
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
import { createMockTranslationService } from '../helpers/mock-factories';

const DEBOUNCE_MS = 20;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Watch write ordering integration', () => {
  let tmpDir: string;
  let outDir: string;
  let watchService: WatchService;
  let translationService: jest.Mocked<TranslationService>;
  let requestedTexts: string[];

  /** delays[n] is the delay applied to the nth translate call. */
  function stubDelays(delays: number[]): void {
    let call = 0;
    translationService.translate.mockImplementation(async (text: string) => {
      const n = call++;
      requestedTexts.push(text);
      await sleep(delays[Math.min(n, delays.length - 1)]!);
      return {
        text: `R${n}|${text}`,
        detectedSourceLang: 'en',
        targetLang: 'de',
        billedCharacters: text.length,
      } as Awaited<ReturnType<TranslationService['translate']>>;
    });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-order-'));
    outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    requestedTexts = [];
    translationService = createMockTranslationService();
    watchService = new WatchService(
      new FileTranslationService(translationService),
      { debounceMs: DEBOUNCE_MS }
    );
  });

  afterEach(async () => {
    await watchService.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('leaves the newest source version on disk when an older translation finishes last', async () => {
    const source = path.join(tmpDir, 'doc.md');
    const output = path.join(outDir, 'doc.de.md');
    fs.writeFileSync(source, 'BASE\n');

    watchService.watch(tmpDir, { targetLangs: ['de'], outputDir: outDir });
    stubDelays([600, 30]);

    fs.writeFileSync(source, 'VERSION-A\n');
    watchService.handleFileChange(source);
    await sleep(DEBOUNCE_MS * 3);

    fs.writeFileSync(source, 'VERSION-B\n');
    watchService.handleFileChange(source);
    await sleep(DEBOUNCE_MS * 3);

    await sleep(900);

    expect(requestedTexts).toEqual(['VERSION-A\n', 'VERSION-B\n']);
    expect(fs.readFileSync(output, 'utf-8')).toBe('R1|VERSION-B\n');
  }, 15000);

  it('collapses an edit storm during one translation into a single re-translation', async () => {
    const source = path.join(tmpDir, 'doc.md');
    const output = path.join(outDir, 'doc.de.md');
    fs.writeFileSync(source, 'BASE\n');

    watchService.watch(tmpDir, { targetLangs: ['de'], outputDir: outDir });
    stubDelays([600, 30]);

    fs.writeFileSync(source, 'EDIT-0\n');
    watchService.handleFileChange(source);
    await sleep(DEBOUNCE_MS * 3);

    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(source, `EDIT-${i}\n`);
      watchService.handleFileChange(source);
      await sleep(DEBOUNCE_MS * 3);
    }

    await sleep(900);

    expect(requestedTexts).toEqual(['EDIT-0\n', 'EDIT-5\n']);
    expect(fs.readFileSync(output, 'utf-8')).toBe('R1|EDIT-5\n');
    expect(watchService.getStats().translationsCount).toBe(2);
  }, 15000);

  it('still overlaps translations of two different files', async () => {
    const fileA = path.join(tmpDir, 'a.md');
    const fileB = path.join(tmpDir, 'b.md');
    fs.writeFileSync(fileA, 'AAA\n');
    fs.writeFileSync(fileB, 'BBB\n');

    watchService.watch(tmpDir, { targetLangs: ['de'], outputDir: outDir });
    stubDelays([400, 400]);

    const started = Date.now();
    watchService.handleFileChange(fileA);
    watchService.handleFileChange(fileB);
    await sleep(DEBOUNCE_MS * 3);
    await sleep(600);

    expect(requestedTexts.sort()).toEqual(['AAA\n', 'BBB\n']);
    expect(fs.existsSync(path.join(outDir, 'a.de.md'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'b.de.md'))).toBe(true);
    // Serialized runs would need 800ms of translation time, not ~400ms.
    expect(Date.now() - started).toBeLessThan(800);
  }, 15000);
});
