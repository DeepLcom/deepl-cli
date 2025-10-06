/**
 * Configuration management service
 * Handles loading, saving, and accessing configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DeepLConfig, Language, Formality, OutputFormat } from '../types';

const VALID_LANGUAGES: readonly Language[] = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi',
  'fr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl',
  'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'zh',
] as const;

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
  'yaml',
  'table',
] as const;

const BOOLEAN_CONFIG_PATHS = [
  'cache.enabled',
  'output.verbose',
  'output.color',
  'watch.autoCommit',
  'defaults.preserveFormatting',
] as const;

const DEFAULT_CACHE_SIZE = 1024 * 1024 * 1024; // 1GB
const DEFAULT_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const DEFAULT_DEBOUNCE_MS = 500;

export class ConfigService {
  private config: DeepLConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath =
      configPath ?? path.join(os.homedir(), '.deepl-cli', 'config.json');
    this.config = this.load();
  }

  /**
   * Get the entire configuration
   */
  get(): DeepLConfig {
    // Return deep copy to prevent mutations
    return JSON.parse(JSON.stringify(this.config)) as DeepLConfig;
  }

  /**
   * Set a configuration value by path
   */
  set(key: string, value: unknown): void {
    const keys = key.split('.');
    this.validatePath(keys, value);

    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    let current: any = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!k || !(k in current)) {
        throw new Error(`Invalid path: ${key}`);
      }
      current = current[k];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey && !(lastKey in current)) {
      throw new Error(`Invalid path: ${key}`);
    }

    if (lastKey) {
      current[lastKey] = value;
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    this.save();
  }

  /**
   * Get a specific configuration value by path
   */
  getValue<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const keys = key.split('.');
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    let current: any = this.config;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return defaultValue;
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

    return current as T;
  }

  /**
   * Check if a configuration key exists
   */
  has(key: string): boolean {
    const keys = key.split('.');
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    let current: any = this.config;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return false;
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

    return current !== undefined;
  }

  /**
   * Delete a configuration value
   */
  delete(key: string): void {
    const keys = key.split('.');
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!k || !(k in current)) {
        return;
      }
      current = current[k];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey && lastKey in current) {
      delete current[lastKey];
      this.save();
    }
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Clear all configuration and reset to defaults
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
      team: {
        org: undefined,
        workspace: undefined,
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
        // Merge with defaults to ensure all fields exist
        return this.mergeWithDefaults(loaded);
      }
    } catch (error) {
      // If load fails, use defaults
      console.error('Failed to load config, using defaults:', error);
    }

    return ConfigService.getDefaults();
  }

  /**
   * Save configuration to disk
   */
  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(`Failed to save config: ${String(error)}`);
    }
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   */
  private mergeWithDefaults(loaded: Partial<DeepLConfig>): DeepLConfig {
    const defaults = ConfigService.getDefaults();
    return {
      auth: { ...defaults.auth, ...loaded.auth },
      defaults: { ...defaults.defaults, ...loaded.defaults },
      cache: { ...defaults.cache, ...loaded.cache },
      output: { ...defaults.output, ...loaded.output },
      watch: { ...defaults.watch, ...loaded.watch },
      team: { ...defaults.team, ...loaded.team },
    };
  }

  /**
   * Validate configuration path and value
   */
  private validatePath(keys: string[], value: unknown): void {
    if (keys.length === 0) {
      throw new Error('Invalid path: empty');
    }

    const path = keys.join('.');

    // Validate specific paths
    if (path === 'defaults.sourceLang' && value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      this.validateLanguage(value as string);
    }

    if (path === 'defaults.targetLangs') {
      if (!Array.isArray(value)) {
        throw new Error('Target languages must be an array');
      }
      for (const lang of value) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.validateLanguage(lang);
      }
    }

    if (path === 'defaults.formality') {
      this.validateFormality(value as string);
    }

    if (path === 'output.format') {
      this.validateOutputFormat(value as string);
    }

    if (path === 'cache.maxSize') {
      if (typeof value !== 'number' || value < 0) {
        throw new Error('Cache size must be positive');
      }
    }

    // Validate boolean fields
    if (BOOLEAN_CONFIG_PATHS.includes(path as typeof BOOLEAN_CONFIG_PATHS[number]) && typeof value !== 'boolean') {
      throw new Error('Expected boolean');
    }
  }

  /**
   * Validate language code
   */
  private validateLanguage(lang: string): void {
    if (!VALID_LANGUAGES.includes(lang as Language)) {
      throw new Error('Invalid language code');
    }
  }

  /**
   * Validate formality value
   */
  private validateFormality(formality: string): void {
    if (!VALID_FORMALITY.includes(formality as Formality)) {
      throw new Error('Invalid formality');
    }
  }

  /**
   * Validate output format
   */
  private validateOutputFormat(format: string): void {
    if (!VALID_OUTPUT_FORMATS.includes(format as OutputFormat)) {
      throw new Error('Invalid output format');
    }
  }
}
