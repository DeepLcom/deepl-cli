import axios, { AxiosInstance, AxiosError } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { Language } from '../types';
import { AuthError, RateLimitError, QuotaError, NetworkError } from '../utils/errors.js';

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

export class HttpClient {
  protected client: AxiosInstance;
  protected maxRetries: number;
  protected _lastTraceId?: string;

  constructor(apiKey: string, options: DeepLClientOptions = {}) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API key is required');
    }

    const baseURL = options.baseUrl ?? (options.usePro ? PRO_API_URL : FREE_API_URL);

    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    const axiosConfig: Record<string, unknown> = {
      baseURL,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Connection': 'keep-alive',
      },
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 10,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 10,
        timeout: options.timeout ?? DEFAULT_TIMEOUT,
      }),
    };

    let proxyConfig = options.proxy;

    if (!proxyConfig) {
      const httpProxy = process.env['HTTP_PROXY'] ?? process.env['http_proxy'];
      const httpsProxy = process.env['HTTPS_PROXY'] ?? process.env['https_proxy'];
      const proxyUrl = httpsProxy ?? httpProxy;

      if (proxyUrl) {
        try {
          const url = new URL(proxyUrl);
          proxyConfig = {
            protocol: url.protocol.replace(':', '') as 'http' | 'https',
            host: url.hostname,
            port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
          };

          if (url.username && url.password) {
            proxyConfig.auth = {
              username: url.username,
              password: url.password,
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Invalid proxy URL "${sanitizeUrl(proxyUrl)}": ${errorMessage}`);
        }
      }
    }

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

  protected async makeJsonRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: Record<string, unknown>,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const buildConfig = (): Record<string, unknown> => {
      const config: Record<string, unknown> = {};

      if (params) {
        config['params'] = params;
      }

      if (method === 'GET') {
        if (data) {
          config['params'] = { ...params as Record<string, unknown>, ...data };
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

        const response = await this.client.request<T>({
          method,
          url: path,
          ...config,
        });

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
          if (status && status >= 400 && status < 500) {
            throw error;
          }
        }

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
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
          return new Error(`API error: ${message}${traceIdSuffix}`);
      }
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error('Unknown error occurred');
  }

  protected normalizeLanguage(lang: string): Language {
    return lang.toLowerCase() as Language;
  }

  protected isAxiosError(error: unknown): error is AxiosError {
    return axios.isAxiosError(error);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
