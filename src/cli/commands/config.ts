/**
 * Config Command
 * Handles configuration management
 */

import { ConfigService } from '../../storage/config.js';

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
      if (key === 'auth.apiKey' && typeof value === 'string' && value.length > 12) {
        return value.substring(0, 8) + '...' + value.substring(value.length - 4);
      }
      return value;
    }
    return this.config.get();
  }

  /**
   * Set config value
   */
  async set(key: string, value: string): Promise<void> {
    // Parse value based on type
    const parsedValue = this.parseValue(key, value);
    await this.config.set(key, parsedValue);
  }

  /**
   * List all config values
   */
  async list(): Promise<Record<string, unknown>> {
    const config = this.config.get();

    // Mask sensitive values
    return this.maskSensitiveValues(config as unknown as Record<string, unknown>);
  }

  /**
   * Reset config to defaults
   */
  async reset(): Promise<void> {
    await this.config.clear();
  }

  /**
   * Parse value based on key
   */
  private parseValue(key: string, value: string): unknown {
    // Handle array values (comma-separated)
    if (key.includes('targetLangs') || value.includes(',')) {
      return value.split(',').map(v => v.trim());
    }

    // Handle boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Handle number values
    if (key.includes('maxSize') || key.includes('ttl') || key.includes('debounceMs')) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num;
    }

    return value;
  }

  /**
   * Mask sensitive values like API keys
   */
  private maskSensitiveValues(config: Record<string, unknown>): Record<string, unknown> {
    const masked = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

    // Mask API key
    if (masked['auth'] && typeof masked['auth'] === 'object') {
      const auth = masked['auth'] as Record<string, unknown>;
      if (auth['apiKey'] && typeof auth['apiKey'] === 'string') {
        const apiKey = auth['apiKey'];
        auth['apiKey'] = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
      }
    }

    return masked;
  }
}
