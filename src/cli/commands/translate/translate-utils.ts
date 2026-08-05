import * as fs from 'fs';
import * as path from 'path';
import { Language, Formality } from '../../../types/index.js';
import { ValidationError } from '../../../utils/errors.js';
import { Logger } from '../../../utils/logger.js';
import { hasGlossarySelection } from '../../../utils/glossary-params.js';
import {
  getAllLanguageCodes,
  getExtendedLanguageCodes,
  looksLikeLanguageTag,
} from '../../../data/language-registry.js';
import type { FileTranslationService } from '../../../services/file-translation.js';
import type { GlossaryService } from '../../../services/glossary.js';
import type { TranslateOptions, TranslationParams } from './types.js';

export const VALID_LANGUAGES: ReadonlySet<string> = getAllLanguageCodes();
export const EXTENDED_ONLY_LANGUAGES: ReadonlySet<string> =
  getExtendedLanguageCodes();

export const TEXT_BASED_EXTENSIONS = [
  '.txt',
  '.md',
  '.html',
  '.htm',
  '.srt',
  '.xlf',
  '.xliff',
  '.json',
  '.yaml',
  '.yml',
];
export const STRUCTURED_EXTENSIONS = ['.json', '.yaml', '.yml'];
export const SAFE_TEXT_SIZE_LIMIT = 100 * 1024; // 100 KiB (safe threshold, API limit is 128 KiB)

export const MAX_CUSTOM_INSTRUCTIONS = 10;
export const MAX_CUSTOM_INSTRUCTION_CHARS = 300;

export function warnIgnoredOptions(
  mode: string,
  options: TranslateOptions,
  supportedKeys: Set<string>
): void {
  const optionLabels: Record<string, string> = {
    splitSentences: '--split-sentences',
    tagHandling: '--tag-handling',
    modelType: '--model-type',
    preserveFormatting: '--preserve-formatting',
    context: '--context',
    glossary: '--glossary',
    translationMemory: '--translation-memory',
    tmThreshold: '--tm-threshold',
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
    if (
      val !== undefined &&
      val !== false &&
      !(Array.isArray(val) && val.length === 0)
    ) {
      ignored.push(flag);
    }
  }

  if (ignored.length > 0) {
    Logger.warn(
      `Warning: ${mode} mode does not support ${ignored.join(', ')}; these options will be ignored.`
    );
  }
}

/**
 * Codes already deferred to the API in this process. One run validates the same
 * target list from more than one place — the registrar's dry run, a mode's
 * multi-target split, then its per-target pass — and the note is worth saying
 * once, not once per call site.
 */
const deferredCodesWarned = new Set<string>();

/**
 * Clears the deferral-warning state. Tests asserting the warning need this in
 * `beforeEach`: the set is module state, which clearing Jest mocks leaves alone.
 */
export function resetDeferredLanguageWarnings(): void {
  deferredCodesWarned.clear();
}

/**
 * Rejects input that is not shaped like a language tag. Codes the bundled
 * snapshot does not list are passed through: GET /v3/languages is the authority
 * on which languages exist and the snapshot can lag it, so an unknown code is
 * the API's to accept or reject with a 400 of its own.
 *
 * `role` names the flag in the rejection, since `--from` and `--to` are rejected
 * for the same reasons and a user needs to know which one to fix.
 */
function validateLanguageCode(
  langCode: string,
  role: 'target' | 'source'
): void {
  if (VALID_LANGUAGES.has(langCode)) return;

  if (looksLikeLanguageTag(langCode)) {
    if (deferredCodesWarned.has(langCode)) return;
    deferredCodesWarned.add(langCode);
    // Said up front, before anything is sent or billed: the API answers an
    // unknown code with a bare "target_lang not supported" that points nowhere.
    Logger.warn(
      `Note: "${langCode}" is not in the bundled language list; deferring to the API.\n` +
        '      Run: deepl languages  to see the languages this build knows about.'
    );
    return;
  }

  throw new ValidationError(
    `Invalid ${role} language code: "${langCode}".`,
    'Run: deepl languages  to see all available languages'
  );
}

export function validateLanguageCodes(langCodes: string[]): void {
  for (const lang of langCodes) {
    validateLanguageCode(lang, 'target');
  }
}

/** Validates `--from`. Absent means auto-detect, which every mode allows. */
export function validateSourceLanguage(from: string | undefined): void {
  if (!from) return;
  validateLanguageCode(from, 'source');
}

/**
 * The flags whose extended-tier arms are checked below. Callers name only the
 * flags the run will honour: the input modes disagree about which they keep, and
 * refusing a command over a flag its mode discards contradicts that run.
 */
export interface ExtendedLanguageConstraints {
  modelType?: string;
  formality?: string;
  glossary?: string | string[];
}

/** `ExtendedLanguageConstraints` plus the source language, for the entry point below. */
export interface TranslationLanguageConstraints extends ExtendedLanguageConstraints {
  from?: string;
}

/**
 * The language gate for every translate input mode. One entry point because a
 * mode that checked codes without the extended-tier arms accepted, and sent,
 * commands its siblings rejected locally.
 */
export function validateTranslationLanguages(
  targets: string[],
  options: TranslationLanguageConstraints
): void {
  validateSourceLanguage(options.from);
  validateLanguageCodes(targets);
  validateExtendedLanguageConstraints(targets.join(','), options);
}

export function validateExtendedLanguageConstraints(
  targetLang: string,
  options: ExtendedLanguageConstraints
): void {
  const langs = targetLang.includes(',')
    ? targetLang.split(',').map((l) => l.trim())
    : [targetLang];

  const extendedLangs = langs.filter((l) => EXTENDED_ONLY_LANGUAGES.has(l));
  if (extendedLangs.length === 0) return;

  const langList = extendedLangs.join(', ');

  if (options.modelType === 'latency_optimized') {
    throw new ValidationError(
      `Language(s) ${langList} only support quality_optimized model type, not latency_optimized`
    );
  }

  if (options.formality && options.formality !== 'default') {
    throw new ValidationError(
      `Language(s) ${langList} do not support formality settings`
    );
  }

  if (hasGlossarySelection(options)) {
    throw new ValidationError(
      `Language(s) ${langList} do not support glossaries`
    );
  }
}

export function validateXmlTags(tags: string[], paramName: string): void {
  const xmlNamePattern = /^[a-zA-Z_][\w.-]*$/;

  for (const tag of tags) {
    if (!tag || tag.trim() === '') {
      throw new ValidationError(`${paramName}: Tag name cannot be empty`);
    }

    if (tag.toLowerCase().startsWith('xml')) {
      throw new ValidationError(
        `${paramName}: Tag name "${tag}" cannot start with "xml" (reserved)`
      );
    }

    if (!xmlNamePattern.test(tag)) {
      throw new ValidationError(
        `${paramName}: Invalid XML tag name "${tag}". Tags must start with a letter or underscore and contain only letters, digits, hyphens, underscores, or periods.`
      );
    }
  }
}

/**
 * Validate `--tag-handling-version` and return it. Shared so every handler maps
 * the flag: the CLI pins v2 whenever tag handling is on, so a handler that
 * dropped the flag would send v2 to a caller who asked for v1.
 */
export function validateTagHandlingVersion(
  options: TranslateOptions
): TranslationParams['tagHandlingVersion'] {
  if (!options.tagHandlingVersion) return undefined;
  if (!options.tagHandling) {
    throw new ValidationError(
      '--tag-handling-version requires --tag-handling to be set (xml or html)'
    );
  }
  if (
    options.tagHandlingVersion !== 'v1' &&
    options.tagHandlingVersion !== 'v2'
  ) {
    throw new ValidationError('--tag-handling-version must be "v1" or "v2"');
  }
  return options.tagHandlingVersion;
}

export function buildTranslationOptions(
  options: TranslateOptions
): TranslationParams {
  const result: TranslationParams = {
    targetLang: options.to as Language,
  };

  if (options.from) result.sourceLang = options.from as Language;
  if (options.formality) result.formality = options.formality as Formality;
  if (options.context) result.context = options.context;
  if (options.splitSentences)
    result.splitSentences =
      options.splitSentences as TranslationParams['splitSentences'];
  if (options.tagHandling)
    result.tagHandling =
      options.tagHandling as TranslationParams['tagHandling'];
  const tagHandlingVersion = validateTagHandlingVersion(options);
  if (tagHandlingVersion) result.tagHandlingVersion = tagHandlingVersion;
  if (options.modelType)
    result.modelType = options.modelType as TranslationParams['modelType'];
  if (options.preserveFormatting !== undefined)
    result.preserveFormatting = options.preserveFormatting;
  if (options.showBilledCharacters) result.showBilledCharacters = true;

  return result;
}

export async function resolveGlossaryId(
  glossaryService: GlossaryService,
  nameOrId: string,
  expected?: { from: Language; targets: Language[] }
): Promise<string> {
  return glossaryService.resolveGlossaryId(nameOrId, expected);
}

export function isFilePath(
  input: string,
  cachedStats: fs.Stats | null | undefined,
  fileTranslationService: FileTranslationService
): boolean {
  if (cachedStats?.isFile()) {
    return true;
  }

  if (!cachedStats && fs.existsSync(input)) {
    return true;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
    return false;
  }

  const hasPathSep =
    input.includes(path.sep) || input.includes('/') || input.includes('\\');

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
