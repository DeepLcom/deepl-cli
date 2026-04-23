/**
 * CLI Exit Codes
 *
 * Canonical exit-code enum and error classifier. Lives in the utils/
 * namespace alongside the errors module so that E2E tests and the
 * `--format json` error-envelope schema can import these values without
 * pulling `commander` (or any other registrar-layer module) into test-land.
 */

import { DeepLCLIError } from './errors.js';
import { Logger } from './logger.js';

export const ExitCode = {
  Success: 0,
  GeneralError: 1,
  /** Partial sync failure: one or more locales failed while others succeeded. */
  PartialFailure: 1,
  AuthError: 2,
  RateLimitError: 3,
  QuotaError: 4,
  NetworkError: 5,
  InvalidInput: 6,
  /** Alias of {@link ExitCode.InvalidInput}; preferred spelling for typed
   *  `ValidationError` throws that reach the top-level handler. */
  ValidationError: 6,
  ConfigError: 7,
  CheckFailed: 8,
  VoiceError: 9,
  SyncDrift: 10,
  SyncConflict: 11,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export const EXIT_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Success',
  1: 'General error',
  2: 'Authentication error (invalid API key)',
  3: 'Rate limit exceeded',
  4: 'Quota exceeded',
  5: 'Network error (timeout, connection refused)',
  6: 'Invalid input (missing arguments, unsupported format)',
  7: 'Configuration error (invalid config file)',
  8: 'Check found issues (text needs improvement)',
  9: 'Voice API error (unsupported plan or session failure)',
  10: 'Sync drift detected (translations out of date)',
  11: 'Sync lockfile conflict (auto-resolution incomplete)',
};

/**
 * Determine exit code from an error.
 *
 * Typed `DeepLCLIError` instances carry their own `exitCode`; untyped
 * errors are classified by message against a curated substring list.
 */
export function exitCodeForError(error: unknown): ExitCode {
  if (error instanceof DeepLCLIError) {
    return error.exitCode as ExitCode;
  }
  if (error instanceof Error) {
    return classifyByMessage(error.message);
  }
  return ExitCode.GeneralError;
}

/**
 * Legacy alias kept for backwards compatibility with callers that import
 * the old name. Prefer `exitCodeForError`.
 */
export function getExitCodeFromError(error: Error): ExitCode {
  return exitCodeForError(error);
}

function classifyByMessage(rawMessage: string): ExitCode {
  Logger.verbose(`Untyped error reached fallback classifier: "${rawMessage.substring(0, 120)}"`);
  const message = rawMessage.toLowerCase();

  if (
    message.includes('authentication failed') ||
    message.includes('invalid api key') ||
    message.includes('api key not set') ||
    message.includes('api key is required')
  ) {
    return ExitCode.AuthError;
  }

  if (
    message.includes('rate limit exceeded') ||
    message.includes('too many requests') ||
    /\b429\b/.test(message)
  ) {
    return ExitCode.RateLimitError;
  }

  if (
    message.includes('quota exceeded') ||
    message.includes('character limit reached') ||
    /\b456\b/.test(message)
  ) {
    return ExitCode.QuotaError;
  }

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

  if (
    message.includes('voice api') ||
    message.includes('voice session')
  ) {
    return ExitCode.VoiceError;
  }

  // Config errors checked before InvalidInput because config messages
  // may contain words like "invalid".
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

  return ExitCode.GeneralError;
}

export function isRetryableError(exitCode: ExitCode): boolean {
  return (
    exitCode === ExitCode.RateLimitError ||
    exitCode === ExitCode.NetworkError
  );
}
