/**
 * Config Command
 * Handles configuration management
 */

import { ConfigService } from '../../storage/config.js';

const BOOLEAN_KEYS = [
  'api.usePro',
  'cache.enabled',
  'output.verbose',
  'output.color',
  'watch.autoCommit',
  'defaults.preserveFormatting',
];

const NUMERIC_KEYS = ['cache.maxSize', 'cache.ttl', 'watch.debounceMs'];

// Keys whose value is always a list, so a single entry still arrives as an
// array rather than a bare string.
const ARRAY_KEYS = ['tms.allowedServers'];

export class ConfigCommand {
  private config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
  }

  /**
   * Get config value
   */
  async get(key?: string): Promise<unknown> {
    if (key) {
      const value = this.config.getValue(key);
      if (
        key === 'auth.apiKey' &&
        typeof value === 'string' &&
        value.length > 8
      ) {
        return (
          value.substring(0, 4) + '...' + value.substring(value.length - 4)
        );
      }
      return value;
    }
    return this.maskSensitiveValues(this.config.get());
  }

  /**
   * Set config value
   */
  async set(key: string, value: string): Promise<void> {
    const parsedValue = this.parseValue(key, value);
    this.config.set(key, parsedValue);
  }

  /**
   * List all config values
   */
  async list(): Promise<Record<string, unknown>> {
    const config = this.config.get();

    return this.maskSensitiveValues(config);
  }

  /**
   * Reset config to defaults
   */
  async reset(): Promise<void> {
    this.config.clear();
  }

  /**
   * Format a single config value for human-readable text output
   */
  formatValue(key: string | undefined, value: unknown): string {
    if (key) {
      const displayValue = value === undefined ? '(not set)' : String(value);
      return `${key} = ${displayValue}`;
    }
    return this.formatConfig(value as Record<string, unknown>);
  }

  /**
   * Format full config as human-readable text output
   */
  formatConfig(config: Record<string, unknown>): string {
    const lines: string[] = [];
    this.flattenConfig(config, '', lines);
    return lines.join('\n');
  }

  private flattenConfig(
    obj: Record<string, unknown>,
    prefix: string,
    lines: string[]
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        this.flattenConfig(value as Record<string, unknown>, fullKey, lines);
      } else {
        const display =
          value === undefined ? '(not set)' : JSON.stringify(value);
        lines.push(`${fullKey} = ${display}`);
      }
    }
  }

  private parseValue(key: string, value: string): unknown {
    if (
      ARRAY_KEYS.includes(key) ||
      key.includes('targetLangs') ||
      value.includes(',')
    ) {
      return value.split(',').map((v) => v.trim());
    }

    if (BOOLEAN_KEYS.includes(key)) {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }

    if (NUMERIC_KEYS.includes(key)) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num;
    }

    return value;
  }

  private maskSensitiveValues(
    config: Record<string, unknown>
  ): Record<string, unknown> {
    const masked = JSON.parse(JSON.stringify(config)) as Record<
      string,
      unknown
    >;

    if (masked['auth'] && typeof masked['auth'] === 'object') {
      const auth = masked['auth'] as Record<string, unknown>;
      if (auth['apiKey'] && typeof auth['apiKey'] === 'string') {
        const apiKey = auth['apiKey'];
        auth['apiKey'] =
          apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
      }
    }

    return masked;
  }
}
