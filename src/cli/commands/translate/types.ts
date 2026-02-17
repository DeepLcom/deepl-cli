import { TranslationOptions } from '../../../types/api.js';
import { TranslationService } from '../../../services/translation.js';
import { FileTranslationService } from '../../../services/file-translation.js';
import { BatchTranslationService } from '../../../services/batch-translation.js';
import { DocumentTranslationService } from '../../../services/document-translation.js';
import { GlossaryService } from '../../../services/glossary.js';
import { ConfigService } from '../../../storage/config.js';

export interface TranslateOptions {
  to: string;
  from?: string;
  formality?: string;
  outputFormat?: string;
  preserveCode?: boolean;
  preserveFormatting?: boolean;
  context?: string;
  splitSentences?: string;
  tagHandling?: string;
  modelType?: string;
  showBilledCharacters?: boolean;
  enableMinification?: boolean;
  outlineDetection?: string;
  splittingTags?: string;
  nonSplittingTags?: string;
  ignoreTags?: string;
  output?: string;
  recursive?: boolean;
  pattern?: string;
  concurrency?: number;
  glossary?: string;
  customInstruction?: string[];
  styleId?: string;
  enableBetaLanguages?: boolean;
  tagHandlingVersion?: string;
  cache?: boolean;
  format?: string;
}

export interface TranslationParams extends TranslationOptions {
  outputFormat?: string;
  enableDocumentMinification?: boolean;
  outputDir?: string;
}

export interface HandlerContext {
  translationService: TranslationService;
  fileTranslationService: FileTranslationService;
  batchTranslationService: BatchTranslationService;
  documentTranslationService: DocumentTranslationService;
  glossaryService: GlossaryService;
  config: ConfigService;
}
