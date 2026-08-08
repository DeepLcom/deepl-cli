/**
 * Integration tests for the watch loop guard.
 *
 * The guard exists so a file the CLI writes into a watched directory does not
 * re-trigger the watcher. It is scoped to the output directory, so a source
 * file that merely carries a target-language segment in its name is still
 * translated. Real files and a real write path; only the translation call is
 * stubbed.
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
import { Logger } from '../../src/utils/logger.js';
import { createMockTranslationService } from '../helpers/mock-factories';

const DEBOUNCE_MS = 20;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('Watch output-file guard integration', () => {
  let tmpDir: string;
  let watchService: WatchService;
  let translationService: jest.Mocked<TranslationService>;
  let warnings: string[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-watch-guard-'));
    warnings = [];
    jest.spyOn(Logger, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.join(' '));
    });
    translationService = createMockTranslationService();
    translationService.translate.mockImplementation(async (text: string) => ({
      text: `es:${text}`,
      detectedSourceLang: 'en',
      targetLang: 'es',
      billedCharacters: text.length,
    }));
    watchService = new WatchService(
      new FileTranslationService(translationService),
      { debounceMs: DEBOUNCE_MS }
    );
  });

  afterEach(async () => {
    await watchService.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('translates a source file whose name carries a target-language segment', async () => {
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const source = path.join(tmpDir, 'pricing.es.md');
    fs.writeFileSync(source, 'Precios\n');

    watchService.watch(tmpDir, { targetLangs: ['es'], outputDir: outDir });
    watchService.handleFileChange(source);
    await sleep(DEBOUNCE_MS * 5);

    expect(
      fs.readFileSync(path.join(outDir, 'pricing.es.es.md'), 'utf-8')
    ).toBe('es:Precios\n');
    expect(warnings).toEqual([]);
  });

  it('does not re-translate the file it just wrote into the watched directory', async () => {
    const source = path.join(tmpDir, 'doc.md');
    fs.writeFileSync(source, 'Hello\n');

    // Output directory is the watched directory, so the output is watched too.
    watchService.watch(tmpDir, { targetLangs: ['es'], outputDir: tmpDir });
    watchService.handleFileChange(source);
    await sleep(DEBOUNCE_MS * 5);

    const output = path.join(tmpDir, 'doc.es.md');
    expect(fs.readFileSync(output, 'utf-8')).toBe('es:Hello\n');

    watchService.handleFileChange(output);
    await sleep(DEBOUNCE_MS * 5);

    expect(translationService.translate).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(tmpDir, 'doc.es.es.md'))).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('says once why it skips a user file sitting in the output directory', async () => {
    const source = path.join(tmpDir, 'pricing.es.md');
    fs.writeFileSync(source, 'Precios\n');

    watchService.watch(tmpDir, { targetLangs: ['es'], outputDir: tmpDir });
    watchService.handleFileChange(source);
    watchService.handleFileChange(source);
    await sleep(DEBOUNCE_MS * 5);

    expect(translationService.translate).not.toHaveBeenCalled();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('pricing.es.md');
    expect(warnings[0]).toContain('output directory');
  });
});
