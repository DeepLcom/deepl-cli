/**
 * Write Service
 * Business logic for text improvement operations using DeepL Write API
 */

import * as crypto from 'crypto';
import { DeepLClient } from '../api/deepl-client.js';
import { ConfigService } from '../storage/config.js';
import { CacheService } from '../storage/cache.js';
import { WriteOptions, WriteImprovement } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export interface WriteServiceOptions {
  skipCache?: boolean;
}

export class WriteService {
  private client: DeepLClient;
  private config: ConfigService;
  private cache: CacheService;

  constructor(client: DeepLClient, config: ConfigService, cache?: CacheService) {
    if (!client) {
      throw new Error('DeepL client is required');
    }

    if (!config) {
      throw new Error('Config service is required');
    }

    this.client = client;
    this.config = config;
    this.cache = cache ?? CacheService.getInstance();
  }

  /**
   * Improve text using DeepL Write API
   */
  async improve(
    text: string,
    options: WriteOptions,
    serviceOptions: WriteServiceOptions = {}
  ): Promise<WriteImprovement[]> {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    if (options.writingStyle && options.tone) {
      throw new Error('Cannot specify both writing_style and tone in a single request');
    }

    const cacheEnabled = this.config.getValue<boolean>('cache.enabled') ?? true;
    const shouldUseCache = cacheEnabled && !serviceOptions.skipCache;

    if (!cacheEnabled) {
      Logger.info('ℹ️  Cache is disabled');
    } else if (serviceOptions.skipCache) {
      Logger.info('ℹ️  Cache bypassed for this request (--no-cache)');
    }

    const cacheKey = this.generateCacheKey(text, options);

    if (shouldUseCache) {
      const cachedResult = this.cache.get(cacheKey) as WriteImprovement[] | null;
      if (cachedResult) {
        Logger.verbose('[verbose] Cache hit');
        return cachedResult;
      }
      Logger.verbose('[verbose] Cache miss');
    }

    const improvements = await this.client.improveText(text, options);

    if (shouldUseCache) {
      this.cache.set(cacheKey, improvements);
    }

    return improvements;
  }

  /**
   * Get the best improvement (first one returned by API)
   */
  async getBestImprovement(
    text: string,
    options: WriteOptions,
    serviceOptions: WriteServiceOptions = {}
  ): Promise<WriteImprovement> {
    const improvements = await this.improve(text, options, serviceOptions);

    if (!improvements || improvements.length === 0) {
      throw new Error('No improvements available');
    }

    return improvements[0]!;
  }

  private generateCacheKey(text: string, options: WriteOptions): string {
    const cacheData = {
      text,
      targetLang: options.targetLang,
      writingStyle: options.writingStyle,
      tone: options.tone,
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return `write:${hash}`;
  }
}
