/**
 * Exit Codes for CLI
 * Provides granular exit codes for better CI/CD integration
 */

/**
 * Exit codes for different error types
 * Allows scripts to implement intelligent retry logic
 */
export enum ExitCode {
  Success = 0,
  GeneralError = 1,
  AuthError = 2,
  RateLimitError = 3,
  QuotaError = 4,
  NetworkError = 5,
  InvalidInput = 6,
  ConfigError = 7,
}

/**
 * Exit code descriptions for help text
 */
export const EXIT_CODE_DESCRIPTIONS: Record<ExitCode, string> = {
  [ExitCode.Success]: 'Success',
  [ExitCode.GeneralError]: 'General error',
  [ExitCode.AuthError]: 'Authentication error (invalid API key)',
  [ExitCode.RateLimitError]: 'Rate limit exceeded',
  [ExitCode.QuotaError]: 'Quota exceeded',
  [ExitCode.NetworkError]: 'Network error (timeout, connection refused)',
  [ExitCode.InvalidInput]: 'Invalid input (missing arguments, unsupported format)',
  [ExitCode.ConfigError]: 'Configuration error (invalid config file)',
};

/**
 * Determine exit code from error message
 */
export function getExitCodeFromError(error: Error): ExitCode {
  const message = error.message.toLowerCase();

  // Authentication errors
  if (
    message.includes('authentication failed') ||
    message.includes('invalid api key') ||
    message.includes('api key not set') ||
    message.includes('api key is required')
  ) {
    return ExitCode.AuthError;
  }

  // Rate limiting
  if (
    message.includes('rate limit exceeded') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return ExitCode.RateLimitError;
  }

  // Quota exceeded
  if (
    message.includes('quota exceeded') ||
    message.includes('character limit reached') ||
    message.includes('456')
  ) {
    return ExitCode.QuotaError;
  }

  // Network errors
  if (
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('service temporarily unavailable') ||
    message.includes('503')
  ) {
    return ExitCode.NetworkError;
  }

  // Invalid input
  if (
    message.includes('cannot be empty') ||
    message.includes('not found') ||
    message.includes('unsupported') ||
    message.includes('not supported') ||
    message.includes('invalid') ||
    message.includes('required') ||
    message.includes('expected') ||
    message.includes('cannot specify both')
  ) {
    return ExitCode.InvalidInput;
  }

  // Configuration errors
  if (
    message.includes('config') ||
    message.includes('configuration')
  ) {
    return ExitCode.ConfigError;
  }

  // Default to general error
  return ExitCode.GeneralError;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(exitCode: ExitCode): boolean {
  return (
    exitCode === ExitCode.RateLimitError ||
    exitCode === ExitCode.NetworkError
  );
}
