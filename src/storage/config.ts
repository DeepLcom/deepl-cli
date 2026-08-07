/**
 * Configuration management service
 * Handles loading, saving, and accessing configuration
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  DeepLConfig,
  Formality,
  Language,
  OutputFormat,
} from '../types/index.js';
import { resolvePaths } from '../utils/paths.js';
import {
  isValidLanguage,
  looksLikeLanguageTag,
} from '../data/language-registry.js';
import { ConfigError } from '../utils/errors.js';
import { validateApiUrl } from '../utils/validate-url.js';
import { Logger } from '../utils/logger.js';
import { errorMessage } from '../utils/error-message.js';

const VALID_FORMALITY: readonly Formality[] = [
  'default',
  'more',
  'less',
  'prefer_more',
  'prefer_less',
] as const;

const VALID_OUTPUT_FORMATS: readonly OutputFormat[] = [
  'text',
  'json',
  'table',
] as const;

const BOOLEAN_CONFIG_PATHS = [
  'api.usePro',
  'cache.enabled',
  'output.verbose',
  'output.color',
  'watch.autoCommit',
  'defaults.preserveFormatting',
] as const;

// Path segments that would walk or rewrite the prototype chain instead of
// plain config data (prototype pollution).
const FORBIDDEN_KEY_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export const ALLOWED_SERVERS_PATH = 'tms.allowedServers';

/**
 * What `URL.hostname` yields, and nothing else: a bare host, or a bracketed
 * IPv6 literal. The allowlist is compared against a parsed hostname, so an
 * entry carrying a scheme, port, path, or wildcard could never match and would
 * read as approval that silently does not apply.
 */
const TMS_HOSTNAME_PATTERN =
  /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)$/;

function parseAllowedServers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(
      `${ALLOWED_SERVERS_PATH} must be an array of hostnames`,
      `Run: deepl config set ${ALLOWED_SERVERS_PATH} tms.example.com  (comma-separate several hosts)`
    );
  }

  return value.map((entry) => {
    if (typeof entry !== 'string') {
      throw new ConfigError(
        `${ALLOWED_SERVERS_PATH} entries must be strings, got ${entry === null ? 'null' : typeof entry}`
      );
    }
    const host = entry.trim().toLowerCase();
    if (host === '') {
      throw new ConfigError(
        `${ALLOWED_SERVERS_PATH} entries must not be empty`
      );
    }
    if (!TMS_HOSTNAME_PATTERN.test(host)) {
      throw new ConfigError(
        `Invalid TMS host "${entry}" for ${ALLOWED_SERVERS_PATH}: expected a bare hostname such as tms.example.com`,
        'Drop the scheme, port, path, and any wildcard. The allowlist matches a parsed hostname exactly.'
      );
    }
    return host;
  });
}

const DEFAULT_CACHE_SIZE = 1024 * 1024 * 1024; // 1GB
const DEFAULT_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
/** Debounce delay applied by `watch` when neither the flag nor configuration
 *  names one. Exported so the CLI default and this schema default stay one
 *  value. */
export const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Language values are stored lowercase, matching what `deepl languages` prints
 * and what the translate paths normalize their flags to, so a config written as
 * `DE` does not read back as a code the registry cannot look up. TMS hostnames
 * are stored the same way, since they are matched against a parsed hostname.
 */
function normalizeConfigValue(path: string, value: unknown): unknown {
  if (path === 'defaults.sourceLang' && typeof value === 'string') {
    return value.toLowerCase();
  }
  if (path === 'defaults.targetLangs' && Array.isArray(value)) {
    return value.map((lang) =>
      typeof lang === 'string' ? lang.toLowerCase() : lang
    );
  }
  if (path === ALLOWED_SERVERS_PATH) {
    return parseAllowedServers(value);
  }
  return value;
}

export class ConfigService {
  private config: DeepLConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? resolvePaths().configFile;
    this.config = this.load();
  }

  /**
   * Get the entire configuration
   * Returns a readonly reference to prevent accidental mutations
   *
   * IMPORTANT: Do not mutate the returned config object.
   * If you need to modify the config, use set() method instead.
   */
  get(): Readonly<DeepLConfig> {
    return this.config;
  }

  set(key: string, value: unknown): void {
    this.validateKeyString(key);

    const keys = key.split('.');
    this.validatePath(keys, value);
    value = normalizeConfigValue(keys.join('.'), value);

    let current: Record<string, unknown> = this.config as unknown as Record<
      string,
      unknown
    >;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!k || !Object.hasOwn(current, k)) {
        throw new ConfigError(`Invalid path: ${key}`);
      }
      current = current[k] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey && !Object.hasOwn(current, lastKey)) {
      throw new ConfigError(`Invalid path: ${key}`);
    }

    if (lastKey) {
      current[lastKey] = value;
    }
    this.save();
  }

  /**
   * Get a specific configuration value by path
   */
  getValue<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const keys = key.split('.');
    let current: unknown = this.config;

    for (const k of keys) {
      if (
        current &&
        typeof current === 'object' &&
        !FORBIDDEN_KEY_SEGMENTS.has(k) &&
        Object.hasOwn(current, k)
      ) {
        current = (current as Record<string, unknown>)[k];
      } else {
        return defaultValue;
      }
    }

    return current as T;
  }

  /**
   * Check if a configuration key exists
   */
  has(key: string): boolean {
    const keys = key.split('.');
    let current: unknown = this.config;

    for (const k of keys) {
      if (
        current &&
        typeof current === 'object' &&
        !FORBIDDEN_KEY_SEGMENTS.has(k) &&
        Object.hasOwn(current, k)
      ) {
        current = (current as Record<string, unknown>)[k];
      } else {
        return false;
      }
    }

    return current !== undefined;
  }

  /**
   * Delete a configuration value
   */
  delete(key: string): void {
    const keys = key.split('.');
    this.validateSegments(keys);
    let current: Record<string, unknown> = this.config as unknown as Record<
      string,
      unknown
    >;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!k || !Object.hasOwn(current, k)) {
        return;
      }
      current = current[k] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey && Object.hasOwn(current, lastKey)) {
      delete current[lastKey];
      this.save();
    }
  }

  /**
   * Clear all configuration and reset to defaults
   *
   * NOTE: This method only clears the configuration file, not the cache database.
   * If you have an active CacheService instance, you should call cache.close()
   * before calling this method to release the database connection.
   * In CLI usage, this is handled automatically by process exit handlers.
   */
  clear(): void {
    this.config = ConfigService.getDefaults();
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }

  /**
   * Get default configuration
   */
  static getDefaults(): DeepLConfig {
    return {
      auth: {
        apiKey: undefined,
      },
      api: {
        baseUrl: 'https://api.deepl.com',
        usePro: true,
      },
      defaults: {
        sourceLang: undefined,
        targetLangs: [],
        formality: 'default',
        preserveFormatting: true,
      },
      cache: {
        enabled: true,
        maxSize: DEFAULT_CACHE_SIZE,
        ttl: DEFAULT_CACHE_TTL,
      },
      output: {
        format: 'text',
        verbose: false,
        color: true,
      },
      watch: {
        debounceMs: DEFAULT_DEBOUNCE_MS,
        autoCommit: false,
        pattern: '*.md',
      },
      tms: {
        allowedServers: [],
      },
    };
  }

  /**
   * Load configuration from disk
   */
  private load(): DeepLConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data) as DeepLConfig;
        const merged = this.mergeWithDefaults(loaded);
        this.validateLoadedConfig(merged);
        return merged;
      }
    } catch (error) {
      Logger.warn(
        'Failed to load config, using defaults:',
        errorMessage(error)
      );
    }

    return ConfigService.getDefaults();
  }

  /**
   * Validates a config read from disk, and normalizes its language codes in
   * place. A file written before codes were stored lowercase -- or edited by
   * hand -- otherwise keeps its casing, and `TranslationService` merges
   * `defaults.sourceLang` verbatim, so `DE` and an explicit `--from de` would key
   * two cache entries for one request.
   */
  private validateLoadedConfig(config: DeepLConfig): void {
    if (config.api?.baseUrl) {
      validateApiUrl(config.api.baseUrl);
    }
    if (config.defaults?.sourceLang) {
      this.validateLanguage(config.defaults.sourceLang, 'defaults.sourceLang');
      config.defaults.sourceLang =
        config.defaults.sourceLang.toLowerCase() as Language;
    }
    if (config.defaults?.targetLangs) {
      for (const lang of config.defaults.targetLangs) {
        this.validateLanguage(lang, 'defaults.targetLangs');
      }
      config.defaults.targetLangs = config.defaults.targetLangs.map(
        (lang) => lang.toLowerCase() as Language
      );
    }
    if (config.defaults?.formality) {
      this.validateFormality(config.defaults.formality, 'defaults.formality');
    }
  }

  /**
   * Save configuration to disk
   */
  private save(): void {
    // Unpredictable name, exclusive create. This file holds the API key in
    // plaintext, and at a guessable path a planted symlink would redirect the
    // write and survive the rename as config.json. `wx` fails instead of
    // following whatever is already there.
    const tmpPath = `${this.configPath}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`;
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(tmpPath, JSON.stringify(this.config, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
        flag: 'wx',
      });
      // The mode above is masked by the umask at creation; chmod is not.
      fs.chmodSync(tmpPath, 0o600);
      fs.renameSync(tmpPath, this.configPath);
    } catch (error) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore cleanup errors */
      }
      throw new ConfigError(`Failed to save config: ${errorMessage(error)}`);
    }
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   */
  private mergeWithDefaults(loaded: Partial<DeepLConfig>): DeepLConfig {
    const defaults = ConfigService.getDefaults();
    return {
      auth: { ...defaults.auth, ...loaded.auth },
      api: { ...defaults.api, ...loaded.api },
      defaults: { ...defaults.defaults, ...loaded.defaults },
      cache: { ...defaults.cache, ...loaded.cache },
      output: { ...defaults.output, ...loaded.output },
      watch: { ...defaults.watch, ...loaded.watch },
      tms: { ...defaults.tms, ...loaded.tms },
    };
  }

  /**
   * Reject path segments that could escape plain config data (prototype
   * pollution, traversal, separators). Shared by set() and delete().
   */
  private validateSegments(keys: string[]): void {
    if (keys.length === 0) {
      throw new ConfigError('Invalid path: empty');
    }

    for (const key of keys) {
      if (key.includes('\0')) {
        throw new ConfigError('Invalid path: contains null byte');
      }

      if (key.includes('/') || key.includes('\\')) {
        throw new ConfigError('Invalid path: contains path separator');
      }

      if (key === '..' || key.includes('..')) {
        throw new ConfigError('Invalid path: contains directory traversal');
      }

      if (key.startsWith('.')) {
        throw new ConfigError('Invalid path: segment starts with dot');
      }

      if (key === '') {
        throw new ConfigError('Invalid path: empty segment');
      }

      if (FORBIDDEN_KEY_SEGMENTS.has(key)) {
        throw new ConfigError(
          `Invalid path: "${key}" is a reserved segment and cannot be used`
        );
      }
    }
  }

  private validatePath(keys: string[], value: unknown): void {
    this.validateSegments(keys);

    const path = keys.join('.');

    // Validate specific paths
    if (path === 'defaults.sourceLang' && value !== undefined) {
      this.validateLanguage(value as string, path, true);
    }

    if (path === 'defaults.targetLangs') {
      if (!Array.isArray(value)) {
        throw new ConfigError('Target languages must be an array');
      }
      for (const lang of value) {
        this.validateLanguage(lang, path, true);
      }
    }

    if (path === 'defaults.formality') {
      this.validateFormality(value as string, path);
    }

    if (path === 'output.format') {
      this.validateOutputFormat(value as string, path);
    }

    if (path === 'cache.maxSize') {
      if (typeof value !== 'number' || value < 0) {
        throw new ConfigError('Cache size must be positive');
      }
    }

    if (path === ALLOWED_SERVERS_PATH) {
      parseAllowedServers(value);
    }

    if (path === 'api.baseUrl') {
      try {
        validateApiUrl(value as string);
      } catch {
        throw new ConfigError(
          'Invalid API base URL: must be HTTPS (or http://localhost for testing)'
        );
      }
    }

    // Validate boolean fields
    if (
      BOOLEAN_CONFIG_PATHS.includes(
        path as (typeof BOOLEAN_CONFIG_PATHS)[number]
      ) &&
      typeof value !== 'boolean'
    ) {
      throw new ConfigError(
        `Expected boolean for "${path}". Use true or false.`
      );
    }
  }

  /**
   * Validate language code. Codes the bundled snapshot does not list are
   * accepted when they are shaped like a language tag, because GET /v3/languages
   * is the authority on which languages exist and the snapshot can lag it.
   */
  /**
   * @param announceUnknown - warn when the code is well-formed but absent from
   *   the bundled snapshot. Only the write path announces: every command loads
   *   the config, and a note on each invocation is noise, not guidance.
   */
  private validateLanguage(
    lang: string,
    key?: string,
    announceUnknown = false
  ): void {
    // Lowercased first: the translate paths lowercase their flags before use, and
    // the tag pattern below is lowercase-only, so `DE` is as valid as `de` here.
    const normalized = typeof lang === 'string' ? lang.toLowerCase() : lang;
    if (!isValidLanguage(normalized) && !looksLikeLanguageTag(normalized)) {
      const context = key ? ` for "${key}"` : '';
      throw new ConfigError(
        `Invalid language code "${lang}"${context}. Run: deepl languages to see valid codes`
      );
    }
    if (announceUnknown && !isValidLanguage(normalized)) {
      // Stored anyway, since the snapshot can lag the API -- but flagged as it is
      // written, because a typo in config otherwise surfaces on every later
      // command with nothing pointing back at the value responsible.
      const context = key ? ` for "${key}"` : '';
      Logger.warn(
        `Note: "${lang}"${context} is not in the bundled language list; it will be sent to the API as-is.\n` +
          '      Run: deepl languages  to see the languages this build knows about.'
      );
    }
  }

  /**
   * Validate formality value
   */
  private validateFormality(formality: string, key?: string): void {
    if (!VALID_FORMALITY.includes(formality as Formality)) {
      const context = key ? ` for "${key}"` : '';
      throw new ConfigError(
        `Invalid formality "${formality}"${context}. Valid values: ${VALID_FORMALITY.join(', ')}`
      );
    }
  }

  /**
   * Validate output format
   */
  private validateOutputFormat(format: string, key?: string): void {
    if (!VALID_OUTPUT_FORMATS.includes(format as OutputFormat)) {
      const context = key ? ` for "${key}"` : '';
      throw new ConfigError(
        `Invalid output format "${format}"${context}. Valid values: ${VALID_OUTPUT_FORMATS.join(', ')}`
      );
    }
  }

  private validateKeyString(key: string): void {
    if (key.includes('..')) {
      throw new ConfigError('Invalid path: contains directory traversal');
    }

    if (key.startsWith('.')) {
      throw new ConfigError('Invalid path: segment starts with dot');
    }
  }
}
