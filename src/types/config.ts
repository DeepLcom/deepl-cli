/**
 * Configuration type definitions
 */

import { Language, Formality, OutputFormat } from './common.js';

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
  tms: {
    /**
     * Hostnames the user has approved as TMS destinations. `.deepl-sync.yaml`
     * chooses `tms.server`, so a checkout the user does not control can name
     * the host that an env-held TMS_API_KEY is sent to; only a hostname listed
     * here (or approved at the prompt) receives an env-sourced credential.
     */
    allowedServers: string[];
  };
}
