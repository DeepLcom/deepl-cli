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

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthError extends DeepLCLIError {
  readonly exitCode = 2;
}

export class RateLimitError extends DeepLCLIError {
  readonly exitCode = 3;
}

export class QuotaError extends DeepLCLIError {
  readonly exitCode = 4;
}

export class NetworkError extends DeepLCLIError {
  readonly exitCode = 5;
}

export class ValidationError extends DeepLCLIError {
  readonly exitCode = 6;
}

export class ConfigError extends DeepLCLIError {
  readonly exitCode = 7;
}
