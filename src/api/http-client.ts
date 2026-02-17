import axios, { AxiosInstance, AxiosError } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { Language } from '../types/index.js';
import { AuthError, RateLimitError, QuotaError, NetworkError, ConfigError, ValidationError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';
import { errorMessage } from '../utils/error-message.js';

export interface ProxyConfig {
  protocol?: 'http' | 'https';
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

export interface DeepLClientOptions {
  usePro?: boolean;
  timeout?: number;
  maxRetries?: number;
  baseUrl?: string;
  proxy?: ProxyConfig;
}

export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid URL]';
  }
}

const FREE_API_URL = 'https://api-free.deepl.com';
const PRO_API_URL = 'https://api.deepl.com';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_SOCKETS = 10;
const MAX_FREE_SOCKETS = 10;
const KEEP_ALIVE_MSECS = 1000;
const RETRY_INITIAL_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 10000;
const RETRY_AFTER_MAX_SECONDS = 60;

export class HttpClient {
  protected client: AxiosInstance;
  protected maxRetries: number;
  protected _lastTraceId?: string;

  private static parseProxyFromEnv(): ProxyConfig | undefined {
    const httpProxy = process.env['HTTP_PROXY'] ?? process.env['http_proxy'];
    const httpsProxy = process.env['HTTPS_PROXY'] ?? process.env['https_proxy'];
    const proxyUrl = httpsProxy ?? httpProxy;

    if (!proxyUrl) return undefined;

    try {
      const url = new URL(proxyUrl);
      const config: ProxyConfig = {
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        host: url.hostname,
        port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
      };

      if (url.username && url.password) {
        config.auth = {
          username: url.username,
          password: url.password,
        };
      }

      return config;
    } catch (error) {
      throw new ConfigError(`Invalid proxy URL "${sanitizeUrl(proxyUrl)}": ${errorMessage(error)}`);
    }
  }

  static validateConfig(apiKey: string, options: DeepLClientOptions = {}): void {
    if (!apiKey || apiKey.trim() === '') {
      throw new AuthError('API key is required');
    }

    if (!options.proxy) {
      HttpClient.parseProxyFromEnv();
    }
  }

  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    if (!apiKey || apiKey.trim() === '') {
      throw new AuthError('API key is required');
    }

    const baseURL = options.baseUrl ?? (options.usePro ? PRO_API_URL : FREE_API_URL);

    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    const axiosConfig: Record<string, unknown> = {
      baseURL,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
      },
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: KEEP_ALIVE_MSECS,
        maxSockets: MAX_SOCKETS,
        maxFreeSockets: MAX_FREE_SOCKETS,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: KEEP_ALIVE_MSECS,
        maxSockets: MAX_SOCKETS,
        maxFreeSockets: MAX_FREE_SOCKETS,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      }),
    };

    const proxyConfig = options.proxy ?? HttpClient.parseProxyFromEnv();

    if (proxyConfig) {
      axiosConfig['proxy'] = {
        protocol: proxyConfig.protocol,
        host: proxyConfig.host,
        port: proxyConfig.port,
        ...(proxyConfig.auth && { auth: proxyConfig.auth }),
      };
    }

    this.client = axios.create(axiosConfig);
  }

  destroy(): void {
    const httpAgent = this.client.defaults?.httpAgent as http.Agent | undefined;
    const httpsAgent = this.client.defaults?.httpsAgent as https.Agent | undefined;
    httpAgent?.destroy();
    httpsAgent?.destroy();
  }

  get lastTraceId(): string | undefined {
    return this._lastTraceId;
  }

  protected async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    const buildConfig = (): Record<string, unknown> => {
      if (method === 'GET') {
        return { params: data };
      } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const formData = new URLSearchParams();
        if (data) {
          for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
              value.forEach(v => formData.append(key, String(v)));
            } else {
              formData.append(key, String(value));
            }
          }
        }
        return {
          data: formData.toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        };
      }
      return {};
    };

    return this.executeWithRetry<T>(method, path, buildConfig);
  }

  protected async makeJsonRequest<T, D = Record<string, unknown>>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: D,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const buildConfig = (): Record<string, unknown> => {
      const config: Record<string, unknown> = {};

      if (params) {
        config['params'] = params;
      }

      if (method === 'GET') {
        if (data) {
          config['params'] = { ...params as Record<string, unknown>, ...data as Record<string, unknown> };
        }
      } else if (data !== undefined) {
        config['data'] = data;
        config['headers'] = {
          'Content-Type': 'application/json',
        };
      }

      return config;
    };

    return this.executeWithRetry<T>(method, path, buildConfig);
  }

  protected async makeRawRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    buildConfig: () => Record<string, unknown>
  ): Promise<T> {
    return this.executeWithRetry<T>(method, path, buildConfig);
  }

  protected async executeWithRetry<T>(
    method: string,
    path: string,
    buildConfig: () => Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const config = buildConfig();

        const requestStart = Date.now();
        const response = await this.client.request<T>({
          method,
          url: path,
          ...config,
        });
        const requestElapsed = Date.now() - requestStart;
        Logger.verbose(`[verbose] HTTP ${method} ${path} completed in ${requestElapsed}ms (status ${response.status})`);

        const traceId = response.headers?.['x-trace-id'] as string | undefined;
        if (traceId) {
          this._lastTraceId = traceId;
        }

        return response.data;
      } catch (error) {
        lastError = error as Error;

        if (this.isAxiosError(error)) {
          const traceId = error.response?.headers?.['x-trace-id'] as string | undefined;
          if (traceId) {
            this._lastTraceId = traceId;
          }
        }

        if (this.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 429 && attempt < this.maxRetries) {
            const retryAfterDelay = this.parseRetryAfter(error.response?.headers?.['retry-after'] as string | undefined);
            const delay = retryAfterDelay ?? Math.min(RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt), RETRY_MAX_DELAY_MS);
            await this.sleep(delay);
            continue;
          }
          if (status && status >= 400 && status < 500) {
            throw this.handleError(error);
          }
        }

        if (attempt < this.maxRetries) {
          const delay = Math.min(RETRY_INITIAL_DELAY_MS * Math.pow(2, attempt), RETRY_MAX_DELAY_MS);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ? this.handleError(lastError) : new NetworkError('Request failed after retries');
  }

  protected handleError(error: unknown): Error {
    const traceIdSuffix = this._lastTraceId ? ` (Trace ID: ${this._lastTraceId})` : '';

    if (this.isAxiosError(error)) {
      const status = error.response?.status;
      const responseData = error.response?.data as { message?: string } | undefined;
      const message = responseData?.message ?? error.message;

      switch (status) {
        case 403:
          return new AuthError(`Authentication failed: Invalid API key${traceIdSuffix}`);
        case 456:
          return new QuotaError(`Quota exceeded: Character limit reached${traceIdSuffix}`);
        case 429:
          return new RateLimitError(`Rate limit exceeded: Too many requests${traceIdSuffix}`);
        case 503:
          return new NetworkError(`Service temporarily unavailable: Please try again later${traceIdSuffix}`);
        default:
          if (status && status >= 500) {
            return new NetworkError(`Server error (${status}): ${message}${traceIdSuffix}`);
          }
          if (!error.response && this.isNetworkLevelError(error)) {
            return new NetworkError(`Network error: ${error.message}`);
          }
          return new ValidationError(`API error: ${message}${traceIdSuffix}`);
      }
    }

    if (error instanceof Error) {
      if (this.isNetworkLevelError(error)) {
        return new NetworkError(`Network error: ${error.message}`);
      }
      return error;
    }

    return new NetworkError('Unknown error occurred');
  }

  private isNetworkLevelError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('socket hang up');
  }

  protected normalizeLanguage(lang: string): Language {
    return lang.toLowerCase() as Language;
  }

  protected isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }

  protected parseRetryAfter(headerValue: string | undefined): number | undefined {
    if (headerValue === undefined || headerValue === null) {
      return undefined;
    }

    const seconds = Number(headerValue);
    if (!isNaN(seconds) && isFinite(seconds)) {
      const clamped = Math.max(0, Math.min(seconds, RETRY_AFTER_MAX_SECONDS));
      return clamped * 1000;
    }

    const date = new Date(headerValue);
    if (!isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      const delaySec = Math.max(0, delayMs / 1000);
      const clamped = Math.min(delaySec, RETRY_AFTER_MAX_SECONDS);
      return clamped * 1000;
    }

    return undefined;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
