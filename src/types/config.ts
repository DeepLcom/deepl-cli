/**
 * Configuration type definitions
 */

import { Language, Formality, OutputFormat } from './common';

export interface DeepLConfig {
  auth: {
    apiKey?: string;
  };
  api: {
    baseUrl: string;
    usePro: boolean;
  };
  defaults: {
    sourceLang?: Language;
    targetLangs: Language[];
    formality: Formality;
    preserveFormatting: boolean;
  };
  cache: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  output: {
    format: OutputFormat;
    verbose: boolean;
    color: boolean;
  };
  watch: {
    debounceMs: number;
    autoCommit: boolean;
    pattern: string;
  };
  team: {
    org?: string;
    workspace?: string;
  };
}
