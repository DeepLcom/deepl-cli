/**
 * Write Service
 * Business logic for text improvement operations using DeepL Write API
 */

import { DeepLClient } from '../api/deepl-client.js';
import { WriteOptions, WriteImprovement } from '../types/index.js';

export class WriteService {
  private client: DeepLClient;

  constructor(client: DeepLClient) {
    if (!client) {
      throw new Error('DeepL client is required');
    }

    this.client = client;
  }

  /**
   * Improve text using DeepL Write API
   */
  async improve(
    text: string,
    options: WriteOptions
  ): Promise<WriteImprovement[]> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (options.writingStyle && options.tone) {
      throw new Error('Cannot specify both writing_style and tone in a single request');
    }

    const improvements = await this.client.improveText(text, options);

    return improvements;
  }

  /**
   * Get the best improvement (first one returned by API)
   */
  async getBestImprovement(
    text: string,
    options: WriteOptions
  ): Promise<WriteImprovement> {
    const improvements = await this.improve(text, options);

    if (!improvements || improvements.length === 0) {
      throw new Error('No improvements available');
    }

    return improvements[0]!;
  }
}
