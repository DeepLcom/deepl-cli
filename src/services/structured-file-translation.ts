/**
 * Structured File Translation Service
 * Handles translation of JSON/YAML files by extracting string values,
 * translating them via batch API, and reassembling the structure.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { TranslationService, MAX_TEXT_BYTES } from './translation.js';
import { TranslationOptions, Language } from '../types/index.js';
import { safeReadFile } from '../utils/safe-read-file.js';

interface FileTranslationOptions {
  preserveCode?: boolean;
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
    _fileOptions: FileTranslationOptions = {}
  ): Promise<void> {
    const content = await this.readFile(inputPath);

    if (!content || content.trim() === '') {
      throw new Error('Cannot translate empty file');
    }

    const ext = path.extname(inputPath).toLowerCase();
    const parsed = this.parseFile(content, ext);
    const strings = this.extractStrings(parsed.data);

    if (strings.length > 0) {
      const translations = await this.translateStringsInBatches(
        strings.map(s => s.value),
        options
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
    await fs.promises.writeFile(outputPath, serialized, 'utf-8');
  }

  async translateFileToMultiple(
    inputPath: string,
    targetLangs: Language[],
    options: Omit<TranslationOptions, 'targetLang'> & { outputDir?: string } = {}
  ): Promise<FileMultiTargetResult[]> {
    const content = await this.readFile(inputPath);

    if (!content || content.trim() === '') {
      throw new Error('Cannot translate empty file');
    }

    const ext = path.extname(inputPath).toLowerCase();
    const results: FileMultiTargetResult[] = [];

    for (const targetLang of targetLangs) {
      const parsed = this.parseFile(content, ext);
      const strings = this.extractStrings(parsed.data);

      if (strings.length > 0) {
        const translations = await this.translateStringsInBatches(
          strings.map(s => s.value),
          { ...options, targetLang }
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

        await fs.promises.mkdir(options.outputDir, { recursive: true });
        await fs.promises.writeFile(outputFilePath, serialized, 'utf-8');
        result.outputPath = outputFilePath;
      }

      results.push(result);
    }

    return results;
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      return await safeReadFile(filePath, 'utf-8');
    } catch (err: unknown) {
      const nodeErr = err as Error & { code?: string };
      if (nodeErr.code === 'ENOENT') {
        throw new Error(`Input file not found: ${filePath}`);
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
      throw new Error(`YAML parse error: ${doc.errors[0]?.message}`);
    }

    const data: unknown = doc.toJSON();
    if (data === null || data === undefined) {
      throw new Error('Cannot translate empty file');
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

    const walk = (value: unknown, currentPath: (string | number)[]): void => {
      if (typeof value === 'string') {
        strings.push({ path: [...currentPath], value, index: index++ });
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          walk(value[i], [...currentPath, i]);
        }
      } else if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          walk((value as Record<string, unknown>)[key], [...currentPath, key]);
        }
      }
    };

    walk(data, []);
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

  private async translateStringsInBatches(
    strings: string[],
    options: TranslationOptions
  ): Promise<string[]> {
    const results: string[] = [];
    let batch: string[] = [];
    let batchBytes = 0;

    for (const str of strings) {
      const strBytes = Buffer.byteLength(str, 'utf-8');

      if (batch.length > 0 && batchBytes + strBytes > MAX_TEXT_BYTES) {
        const batchResults = await this.translationService.translateBatch(batch, options);
        for (const r of batchResults) {
          results.push(r.text);
        }
        batch = [];
        batchBytes = 0;
      }

      batch.push(str);
      batchBytes += strBytes;
    }

    if (batch.length > 0) {
      const batchResults = await this.translationService.translateBatch(batch, options);
      for (const r of batchResults) {
        results.push(r.text);
      }
    }

    return results;
  }
}
