import * as fs from 'fs';
import * as path from 'path';
import { Language, Formality } from '../../../types/index.js';
import { ValidationError } from '../../../utils/errors.js';
import { Logger } from '../../../utils/logger.js';
import { getAllLanguageCodes, getExtendedLanguageCodes } from '../../../data/language-registry.js';
import type { FileTranslationService } from '../../../services/file-translation.js';
import type { GlossaryService } from '../../../services/glossary.js';
import type { TranslateOptions, TranslationParams } from './types.js';

export const VALID_LANGUAGES: ReadonlySet<string> = getAllLanguageCodes();
export const EXTENDED_ONLY_LANGUAGES: ReadonlySet<string> = getExtendedLanguageCodes();

export const TEXT_BASED_EXTENSIONS = ['.txt', '.md', '.html', '.htm', '.srt', '.xlf', '.xliff', '.json', '.yaml', '.yml'];
export const STRUCTURED_EXTENSIONS = ['.json', '.yaml', '.yml'];
export const SAFE_TEXT_SIZE_LIMIT = 100 * 1024; // 100 KiB (safe threshold, API limit is 128 KiB)

export const MAX_CUSTOM_INSTRUCTIONS = 10;
export const MAX_CUSTOM_INSTRUCTION_CHARS = 300;

export function warnIgnoredOptions(mode: string, options: TranslateOptions, supportedKeys: Set<string>): void {
  const optionLabels: Record<string, string> = {
    splitSentences: '--split-sentences',
    tagHandling: '--tag-handling',
    modelType: '--model-type',
    preserveFormatting: '--preserve-formatting',
    context: '--context',
    glossary: '--glossary',
    customInstruction: '--custom-instruction',
    styleId: '--style-id',
    outlineDetection: '--outline-detection',
    splittingTags: '--splitting-tags',
    nonSplittingTags: '--non-splitting-tags',
    ignoreTags: '--ignore-tags',
    tagHandlingVersion: '--tag-handling-version',
    showBilledCharacters: '--show-billed-characters',
    preserveCode: '--preserve-code',
    enableMinification: '--enable-minification',
  };

  const ignored: string[] = [];
  for (const [key, flag] of Object.entries(optionLabels)) {
    if (supportedKeys.has(key)) continue;
    const val = options[key as keyof TranslateOptions];
    if (val !== undefined && val !== false && !(Array.isArray(val) && val.length === 0)) {
      ignored.push(flag);
    }
  }

  if (ignored.length > 0) {
    Logger.warn(`Warning: ${mode} mode does not support ${ignored.join(', ')}; these options will be ignored.`);
  }
}

export function validateLanguageCodes(langCodes: string[]): void {
  for (const lang of langCodes) {
    if (!VALID_LANGUAGES.has(lang)) {
      throw new ValidationError(
        `Invalid target language code: "${lang}". Valid codes: ${Array.from(VALID_LANGUAGES).sort().join(', ')}`,
        'Run: deepl languages  to see all available languages'
      );
    }
  }
}

export function validateExtendedLanguageConstraints(targetLang: string, options: TranslateOptions): void {
  const langs = targetLang.includes(',')
    ? targetLang.split(',').map(l => l.trim())
    : [targetLang];

  const extendedLangs = langs.filter(l => EXTENDED_ONLY_LANGUAGES.has(l));
  if (extendedLangs.length === 0) return;

  const langList = extendedLangs.join(', ');

  if (options.modelType === 'latency_optimized') {
    throw new ValidationError(`Language(s) ${langList} only support quality_optimized model type, not latency_optimized`);
  }

  if (options.formality && options.formality !== 'default') {
    throw new ValidationError(`Language(s) ${langList} do not support formality settings`);
  }

  if (options.glossary) {
    throw new ValidationError(`Language(s) ${langList} do not support glossaries`);
  }
}

export function validateXmlTags(tags: string[], paramName: string): void {
  const xmlNamePattern = /^[a-zA-Z_][\w.-]*$/;

  for (const tag of tags) {
    if (!tag || tag.trim() === '') {
      throw new ValidationError(`${paramName}: Tag name cannot be empty`);
    }

    if (tag.toLowerCase().startsWith('xml')) {
      throw new ValidationError(`${paramName}: Tag name "${tag}" cannot start with "xml" (reserved)`);
    }

    if (!xmlNamePattern.test(tag)) {
      throw new ValidationError(`${paramName}: Invalid XML tag name "${tag}". Tags must start with a letter or underscore and contain only letters, digits, hyphens, underscores, or periods.`);
    }
  }
}

export function buildTranslationOptions(options: TranslateOptions): TranslationParams {
  const result: TranslationParams = {
    targetLang: options.to as Language,
  };

  if (options.from) result.sourceLang = options.from as Language;
  if (options.formality) result.formality = options.formality as Formality;
  if (options.context) result.context = options.context;
  if (options.splitSentences) result.splitSentences = options.splitSentences as TranslationParams['splitSentences'];
  if (options.tagHandling) result.tagHandling = options.tagHandling as TranslationParams['tagHandling'];
  if (options.modelType) result.modelType = options.modelType as TranslationParams['modelType'];
  if (options.preserveFormatting !== undefined) result.preserveFormatting = options.preserveFormatting;
  if (options.showBilledCharacters) result.showBilledCharacters = true;

  return result;
}

export async function resolveGlossaryId(glossaryService: GlossaryService, nameOrId: string): Promise<string> {
  return glossaryService.resolveGlossaryId(nameOrId);
}

export function isFilePath(input: string, cachedStats: fs.Stats | null | undefined, fileTranslationService: FileTranslationService): boolean {
  if (cachedStats?.isFile()) {
    return true;
  }

  if (!cachedStats && fs.existsSync(input)) {
    return true;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
    return false;
  }

  const hasPathSep = input.includes(path.sep) ||
                     input.includes('/') ||
                     input.includes('\\');

  return hasPathSep && fileTranslationService.isSupportedFile(input);
}

export function isTextBasedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_BASED_EXTENSIONS.includes(ext);
}

export function isStructuredFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return STRUCTURED_EXTENSIONS.includes(ext);
}

export function getFileSize(filePath: string): number | null {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return null;
  }
}
