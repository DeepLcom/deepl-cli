/**
 * Exit Codes for CLI
 * Provides granular exit codes for better CI/CD integration
 */

import { DeepLCLIError } from './errors.js';
import { Logger } from './logger.js';

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
  CheckFailed = 8,
  VoiceError = 9,
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
  [ExitCode.CheckFailed]: 'Check found issues (text needs improvement)',
  [ExitCode.VoiceError]: 'Voice API error (unsupported plan or session failure)',
};

/**
 * Determine exit code from error type or message.
 * Prefers instanceof checks on custom error classes; falls back to
 * string matching for errors thrown outside the HTTP client layer.
 */
export function getExitCodeFromError(error: Error): ExitCode {
  if (error instanceof DeepLCLIError) {
    return error.exitCode;
  }

  return classifyByMessage(error.message);
}

function classifyByMessage(rawMessage: string): ExitCode {
  Logger.verbose(`Untyped error reached fallback classifier: "${rawMessage.substring(0, 120)}"`);
  const message = rawMessage.toLowerCase();

  // Authentication errors - specific multi-word phrases
  if (
    message.includes('authentication failed') ||
    message.includes('invalid api key') ||
    message.includes('api key not set') ||
    message.includes('api key is required')
  ) {
    return ExitCode.AuthError;
  }

  // Rate limiting - specific phrases
  if (
    message.includes('rate limit exceeded') ||
    message.includes('too many requests') ||
    /\b429\b/.test(message)
  ) {
    return ExitCode.RateLimitError;
  }

  // Quota exceeded - specific phrases
  if (
    message.includes('quota exceeded') ||
    message.includes('character limit reached') ||
    /\b456\b/.test(message)
  ) {
    return ExitCode.QuotaError;
  }

  // Network errors - specific error codes and multi-word phrases
  if (
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('network error') ||
    message.includes('network timeout') ||
    message.includes('connection refused') ||
    message.includes('connection reset') ||
    message.includes('connection timed out') ||
    message.includes('service temporarily unavailable') ||
    /\b503\b/.test(message)
  ) {
    return ExitCode.NetworkError;
  }

  // Voice API errors - specific phrases
  if (
    message.includes('voice api') ||
    message.includes('voice session')
  ) {
    return ExitCode.VoiceError;
  }

  // Configuration errors - specific phrases (checked before InvalidInput
  // because config error messages may contain words like "invalid")
  if (
    message.includes('config file') ||
    message.includes('config directory') ||
    message.includes('configuration file') ||
    message.includes('configuration error') ||
    message.includes('failed to load config') ||
    message.includes('failed to save config') ||
    message.includes('failed to read config')
  ) {
    return ExitCode.ConfigError;
  }

  // Invalid input - specific phrases indicating user input problems
  if (
    message.includes('cannot be empty') ||
    message.includes('file not found') ||
    message.includes('path not found') ||
    message.includes('directory not found') ||
    message.includes('not found in glossary') ||
    message.includes('unsupported format') ||
    message.includes('unsupported language') ||
    message.includes('not supported for') ||
    message.includes('not supported in') ||
    message.includes('invalid target language') ||
    message.includes('invalid source language') ||
    message.includes('invalid language code') ||
    message.includes('invalid glossary') ||
    message.includes('invalid hook') ||
    message.includes('invalid url') ||
    message.includes('invalid size') ||
    message.includes('is required') ||
    message.includes('cannot specify both')
  ) {
    return ExitCode.InvalidInput;
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
