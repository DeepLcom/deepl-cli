/**
 * Custom Error Classes for DeepL CLI
 * Typed errors with associated exit codes for robust classification.
 *
 * Exit code values mirror the ExitCode enum (see exit-codes.ts):
 *   2 = AuthError, 3 = RateLimitError, 4 = QuotaError,
 *   5 = NetworkError, 6 = InvalidInput, 7 = ConfigError
 */

export abstract class DeepLCLIError extends Error {
  abstract readonly exitCode: number;
  readonly suggestion?: string;

  constructor(message: string, suggestion?: string) {
    super(message);
    this.name = this.constructor.name;
    this.suggestion = suggestion;
  }
}

export class AuthError extends DeepLCLIError {
  readonly exitCode = 2;
  constructor(message: string, suggestion?: string) {
    super(message, suggestion ?? 'Run: deepl auth set-key <your-api-key>');
  }
}

export class RateLimitError extends DeepLCLIError {
  readonly exitCode = 3;
  constructor(message: string, suggestion?: string) {
    super(message, suggestion ?? 'Wait a moment and retry, or reduce concurrency with --concurrency flag');
  }
}

export class QuotaError extends DeepLCLIError {
  readonly exitCode = 4;
  constructor(message: string, suggestion?: string) {
    super(message, suggestion ?? 'Run: deepl usage  to check your limits, or upgrade your plan at https://www.deepl.com/pro');
  }
}

export class NetworkError extends DeepLCLIError {
  readonly exitCode = 5;
  constructor(message: string, suggestion?: string) {
    super(message, suggestion ?? 'Check your internet connection and proxy settings (deepl config set api.proxy <url>)');
  }
}

export class ValidationError extends DeepLCLIError {
  readonly exitCode = 6;
}

export class ConfigError extends DeepLCLIError {
  readonly exitCode = 7;
}

export class VoiceError extends DeepLCLIError {
  readonly exitCode = 9;
  constructor(message: string, suggestion?: string) {
    super(message, suggestion ?? 'The Voice API requires a DeepL Pro or Enterprise plan. Visit https://www.deepl.com/pro to upgrade.');
  }
}
