/**
 * Structured File Translation Service
 * Handles translation of JSON/YAML files by extracting string values,
 * translating them via batch API, and reassembling the structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import {
  TranslationService,
  MAX_TEXT_BYTES,
  TRANSLATE_BATCH_SIZE,
} from './translation.js';
import { atomicWriteFile } from '../utils/atomic-write.js';
import { TranslationOptions, Language } from '../types/index.js';
import { safeReadFile } from '../utils/safe-read-file.js';
import {
  mapWithConcurrency,
  MULTI_TARGET_CONCURRENCY,
} from '../utils/concurrency.js';
import { ValidationError, NetworkError } from '../utils/errors.js';
import { describeKeyPath } from '../formats/format.js';

/**
 * Stack-safety ceiling for the direct `deepl translate <file>` path, which has
 * no `.deepl-sync.yaml` and therefore no `sync.limits.max_depth` to consult.
 * It matches `DEFAULT_JSON_MAX_DEPTH`: far above any realistic i18n file, far
 * below the depth at which a recursive walk exhausts the stack.
 */
export const MAX_STRUCTURED_DEPTH = 100;

/**
 * Size ceiling for the direct `deepl translate <file.json|.yaml>` path, which
 * has no `.deepl-sync.yaml` and therefore no `sync.limits.max_file_bytes` to
 * consult. It matches `HARD_MAX_SYNC_LIMITS.max_file_bytes`, the value sync
 * refuses to be configured above, so nothing sync can be made to accept is
 * refused here.
 *
 * Parsing a structured file costs roughly 7-13x its size in resident memory,
 * and the multi-target path parses a fresh copy per target language up to
 * `MULTI_TARGET_CONCURRENCY` at a time: measured, a 19.2 MB file peaked at
 * 252 MB for one target and 483 MB for five. The document route is capped far
 * higher (`MAX_DOCUMENT_FILE_SIZE`, 30 MB) because it streams the bytes to the
 * API once and never builds an object graph from them.
 */
export const MAX_STRUCTURED_FILE_BYTES = 10 * 1024 * 1024;

interface FileTranslationOptions {
  preserveCode?: boolean;
  /** Bypasses the cache read and write, so `--no-cache` reaches the batch
   *  path that every structured i18n format goes through. */
  skipCache?: boolean;
}

interface FileMultiTargetResult {
  targetLang: Language;
  text: string;
  outputPath?: string;
}

interface ExtractedString {
  path: (string | number)[];
  value: string;
  index: number;
}

interface ParsedFile {
  format: 'json' | 'yaml';
  data: unknown;
  yamlDoc?: YAML.Document;
  indent: number | string;
  trailingNewline: boolean;
}

const STRUCTURED_EXTENSIONS = ['.json', '.yaml', '.yml'];

export class StructuredFileTranslationService {
  private translationService: TranslationService;

  constructor(translationService: TranslationService) {
    this.translationService = translationService;
  }

  isStructuredFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return STRUCTURED_EXTENSIONS.includes(ext);
  }

  async translateFile(
    inputPath: string,
    outputPath: string,
    options: TranslationOptions,
    fileOptions: FileTranslationOptions = {}
  ): Promise<void> {
    const content = await this.readFile(inputPath);

    if (!content || content.trim() === '') {
      throw new ValidationError('Cannot translate empty file');
    }

    const ext = path.extname(inputPath).toLowerCase();
    const parsed = this.parseFile(content, ext);
    const strings = this.extractStrings(parsed.data);

    if (strings.length > 0) {
      const translations = await this.translateStringsInBatches(
        strings.map((s) => s.value),
        options,
        fileOptions
      );

      if (parsed.format === 'yaml' && parsed.yamlDoc) {
        this.reassembleYaml(parsed.yamlDoc, strings, translations);
      } else {
        this.reassemble(parsed.data, strings, translations);
      }
    }

    const serialized = this.serialize(parsed);

    const outputDir = path.dirname(outputPath);
    await fs.promises.mkdir(outputDir, { recursive: true });
    await atomicWriteFile(outputPath, serialized, 'utf-8');
  }

  async translateFileToMultiple(
    inputPath: string,
    targetLangs: Language[],
    options: Omit<TranslationOptions, 'targetLang'> & {
      outputDir?: string;
    } = {},
    fileOptions: FileTranslationOptions = {}
  ): Promise<FileMultiTargetResult[]> {
    const content = await this.readFile(inputPath);

    if (!content || content.trim() === '') {
      throw new ValidationError('Cannot translate empty file');
    }

    const ext = path.extname(inputPath).toLowerCase();

    // Parse once to extract strings (read-only, shared across all languages)
    const referenceParsed = this.parseFile(content, ext);
    const strings = this.extractStrings(referenceParsed.data);
    const stringValues = strings.map((s) => s.value);

    // Create output directory once before fan-out to avoid races
    if (options.outputDir) {
      await fs.promises.mkdir(options.outputDir, { recursive: true });
    }

    return mapWithConcurrency(
      targetLangs,
      async (targetLang) => {
        // Each language gets a fresh mutable copy for reassembly
        const parsed = this.parseFile(content, ext);

        if (strings.length > 0) {
          const translations = await this.translateStringsInBatches(
            stringValues,
            { ...options, targetLang },
            fileOptions
          );

          if (parsed.format === 'yaml' && parsed.yamlDoc) {
            this.reassembleYaml(parsed.yamlDoc, strings, translations);
          } else {
            this.reassemble(parsed.data, strings, translations);
          }
        }

        const serialized = this.serialize(parsed);

        const result: FileMultiTargetResult = {
          targetLang,
          text: serialized,
        };

        if (options.outputDir) {
          const inputFilename = path.basename(inputPath);
          const inputExt = path.extname(inputFilename);
          const basename = path.basename(inputFilename, inputExt);
          const outputFilename = `${basename}.${targetLang}${inputExt}`;
          const outputFilePath = path.join(options.outputDir, outputFilename);

          await atomicWriteFile(outputFilePath, serialized, 'utf-8');
          result.outputPath = outputFilePath;
        }

        return result;
      },
      MULTI_TARGET_CONCURRENCY
    );
  }

  private async readFile(filePath: string): Promise<string> {
    // Sized before the read, not after, so an oversize file is never resident:
    // both entry points funnel through here, which is the only place the bound
    // cannot be bypassed by a caller that forgets it.
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > MAX_STRUCTURED_FILE_BYTES) {
        const sizeMiB = (stat.size / (1024 * 1024)).toFixed(1);
        const limitMiB = (MAX_STRUCTURED_FILE_BYTES / (1024 * 1024)).toFixed(0);
        throw new ValidationError(
          `${path.basename(filePath)} is ${sizeMiB} MiB, which exceeds the maximum of ${limitMiB} MiB for a JSON or YAML file translated in one command.`,
          `Split the file, or use "deepl sync", which walks a locale directory file by file and translates only the keys that changed.`
        );
      }
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      const nodeErr = err as Error & { code?: string };
      if (nodeErr.code === 'ENOENT') {
        throw new ValidationError(`Input file not found: ${filePath}`);
      }
      // Any other stat failure flows through to the read below, which reports
      // it in the terms the caller already handles.
    }

    try {
      return await safeReadFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const nodeErr = err as Error & { code?: string };
      if (nodeErr.code === 'ENOENT') {
        throw new ValidationError(`Input file not found: ${filePath}`);
      }
      throw err;
    }
  }

  private parseFile(content: string, ext: string): ParsedFile {
    if (ext === '.json') {
      return this.parseJson(content);
    }
    return this.parseYaml(content);
  }

  private parseJson(content: string): ParsedFile {
    const data: unknown = JSON.parse(content);
    const indent = this.detectJsonIndent(content);
    const trailingNewline = content.endsWith('\n');

    return { format: 'json', data, indent, trailingNewline };
  }

  private parseYaml(content: string): ParsedFile {
    const doc = YAML.parseDocument(content);

    if (doc.errors && doc.errors.length > 0) {
      throw new ValidationError(`YAML parse error: ${doc.errors[0]?.message}`);
    }

    const data: unknown = doc.toJSON();
    if (data === null || data === undefined) {
      throw new ValidationError('Cannot translate empty file');
    }

    const trailingNewline = content.endsWith('\n');

    return { format: 'yaml', data, yamlDoc: doc, indent: 2, trailingNewline };
  }

  private detectJsonIndent(content: string): number | string {
    const match = content.match(/^[{[]\n(\t+|( +))/m);
    if (match) {
      if (match[1]?.startsWith('\t')) {
        return '\t';
      }
      return match[1]?.length ?? 2;
    }
    return 2;
  }

  private extractStrings(data: unknown): ExtractedString[] {
    const strings: ExtractedString[] = [];
    let index = 0;

    const walk = (
      value: unknown,
      currentPath: (string | number)[],
      depth: number
    ): void => {
      if (typeof value === 'string') {
        strings.push({ path: [...currentPath], value, index: index++ });
        return;
      }
      if (depth > MAX_STRUCTURED_DEPTH) {
        throw new ValidationError(
          `Max nesting depth ${MAX_STRUCTURED_DEPTH} exceeded at '${describeKeyPath(currentPath.join('.'))}'. ` +
            'Structured translation walks the document recursively, so a more deeply nested file would exhaust the stack.'
        );
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          walk(value[i], [...currentPath, i], depth + 1);
        }
      } else if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          walk(
            (value as Record<string, unknown>)[key],
            [...currentPath, key],
            depth + 1
          );
        }
      }
    };

    walk(data, [], 1);
    return strings;
  }

  private reassemble(
    data: unknown,
    strings: ExtractedString[],
    translations: string[]
  ): void {
    for (let i = 0; i < strings.length; i++) {
      const entry = strings[i]!;
      const translation = translations[i];
      if (translation === undefined) {
        continue;
      }

      let target: unknown = data;
      for (let j = 0; j < entry.path.length - 1; j++) {
        target = (target as Record<string | number, unknown>)[entry.path[j]!];
      }

      const lastKey = entry.path[entry.path.length - 1]!;
      (target as Record<string | number, unknown>)[lastKey] = translation;
    }
  }

  private reassembleYaml(
    doc: YAML.Document,
    strings: ExtractedString[],
    translations: string[]
  ): void {
    for (let i = 0; i < strings.length; i++) {
      const entry = strings[i]!;
      const translation = translations[i];
      if (translation === undefined) {
        continue;
      }

      const pathKeys = entry.path;
      let node: unknown = doc.contents;

      for (let j = 0; j < pathKeys.length - 1; j++) {
        const key = pathKeys[j]!;
        if (YAML.isMap(node)) {
          node = node.get(key, true);
        } else if (YAML.isSeq(node)) {
          node = node.get(Number(key), true);
        }
      }

      const lastKey = pathKeys[pathKeys.length - 1]!;
      if (YAML.isMap(node)) {
        node.set(lastKey, translation);
      } else if (YAML.isSeq(node)) {
        node.set(Number(lastKey), translation);
      }
    }
  }

  private serialize(parsed: ParsedFile): string {
    let result: string;

    if (parsed.format === 'json') {
      result = JSON.stringify(parsed.data, null, parsed.indent);
      if (parsed.trailingNewline && !result.endsWith('\n')) {
        result += '\n';
      }
    } else if (parsed.yamlDoc) {
      result = parsed.yamlDoc.toString();
      if (parsed.trailingNewline && !result.endsWith('\n')) {
        result += '\n';
      }
    } else {
      result = YAML.stringify(parsed.data);
    }

    return result;
  }

  /**
   * One output file cannot be partly translated, so a batch that comes back
   * incomplete aborts the run. Batches are capped at `TRANSLATE_BATCH_SIZE` as
   * well as by size, which keeps each call to a single API request: a rejection
   * then surfaces with its own exit code instead of arriving as empty slots.
   */
  private async translateStringsInBatches(
    strings: string[],
    options: TranslationOptions,
    fileOptions: FileTranslationOptions = {}
  ): Promise<string[]> {
    const results: string[] = [];
    let batch: string[] = [];
    let batchBytes = 0;

    const flush = async (): Promise<void> => {
      if (batch.length === 0) {
        return;
      }
      const offset = results.length;
      const batchResults = await this.translationService.translateBatch(
        batch,
        options,
        { skipCache: fileOptions.skipCache }
      );
      if (batchResults.length !== batch.length) {
        throw new NetworkError(
          `Translation batch failed: expected ${batch.length} results but got ${batchResults.length}. ` +
            'Aborting to prevent misaligned output.'
        );
      }
      for (let i = 0; i < batch.length; i++) {
        const result = batchResults[i];
        if (!result) {
          throw new NetworkError(
            `Translation batch failed: no translation returned for string ${offset + i + 1} of ${strings.length}. ` +
              'Aborting to prevent misaligned output.'
          );
        }
        results.push(result.text);
      }
      batch = [];
      batchBytes = 0;
    };

    for (const str of strings) {
      const strBytes = Buffer.byteLength(str, 'utf-8');

      if (
        batch.length >= TRANSLATE_BATCH_SIZE ||
        (batch.length > 0 && batchBytes + strBytes > MAX_TEXT_BYTES)
      ) {
        await flush();
      }

      batch.push(str);
      batchBytes += strBytes;
    }

    await flush();

    return results;
  }
}
