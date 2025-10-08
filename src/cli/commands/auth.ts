/**
 * Auth Command
 * Handles API key management
 */

import { ConfigService } from '../../storage/config.js';
import { DeepLClient } from '../../api/deepl-client.js';

export class AuthCommand {
  private config: ConfigService;

  constructor(config: ConfigService) {
    this.config = config;
  }

  /**
   * Set API key and validate it
   */
  async setKey(apiKey: string): Promise<void> {
    // Validate input
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key cannot be empty');
    }

    // Validate with DeepL API by making a test request
    // Note: No format validation - let the API determine if the key is valid
    // This supports production keys (:fx suffix), free keys, and test keys
    try {
      // Use configured API endpoint for validation
      const baseUrl = this.config.getValue('api.baseUrl') as string | undefined;
      const usePro = this.config.getValue('api.usePro') as boolean | undefined;

      const client = new DeepLClient(apiKey, { baseUrl, usePro });
      await client.getUsage(); // Test API key validity
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Authentication failed')) {
          throw new Error('Invalid API key: Authentication failed with DeepL API');
        }
        throw error;
      }
      throw new Error('Failed to validate API key');
    }

    // Save to config
    await this.config.set('auth.apiKey', apiKey);
  }

  /**
   * Get API key from config or environment
   */
  async getKey(): Promise<string | undefined> {
    // Check environment variable first (for CI/CD)
    const envKey = process.env['DEEPL_API_KEY'];

    // Check config
    const configKey = this.config.getValue('auth.apiKey') as string | undefined;

    // Prefer config over environment
    return configKey ?? envKey;
  }

  /**
   * Remove API key from config
   */
  async clearKey(): Promise<void> {
    await this.config.delete('auth.apiKey');
  }
}
