/**
 * Exit Codes Tests
 * Tests for exit code classification and retry logic
 */

import { ExitCode, getExitCodeFromError, isRetryableError } from '../../src/utils/exit-codes';

describe('ExitCode', () => {
  describe('enum values', () => {
    it('should have correct exit code values', () => {
      expect(ExitCode.Success).toBe(0);
      expect(ExitCode.GeneralError).toBe(1);
      expect(ExitCode.AuthError).toBe(2);
      expect(ExitCode.RateLimitError).toBe(3);
      expect(ExitCode.QuotaError).toBe(4);
      expect(ExitCode.NetworkError).toBe(5);
      expect(ExitCode.InvalidInput).toBe(6);
      expect(ExitCode.ConfigError).toBe(7);
      expect(ExitCode.CheckFailed).toBe(8);
    });
  });

  describe('getExitCodeFromError', () => {
    describe('AuthError classification', () => {
      it('should classify authentication failed error', () => {
        const error = new Error('Authentication failed');
        expect(getExitCodeFromError(error)).toBe(ExitCode.AuthError);
      });

      it('should classify invalid api key error', () => {
        const error = new Error('Invalid API key provided');
        expect(getExitCodeFromError(error)).toBe(ExitCode.AuthError);
      });

      it('should classify api key not set error', () => {
        const error = new Error('API key not set');
        expect(getExitCodeFromError(error)).toBe(ExitCode.AuthError);
      });

      it('should classify api key required error', () => {
        const error = new Error('API key is required');
        expect(getExitCodeFromError(error)).toBe(ExitCode.AuthError);
      });

      it('should be case insensitive', () => {
        const error = new Error('AUTHENTICATION FAILED');
        expect(getExitCodeFromError(error)).toBe(ExitCode.AuthError);
      });
    });

    describe('RateLimitError classification', () => {
      it('should classify rate limit exceeded error', () => {
        const error = new Error('Rate limit exceeded');
        expect(getExitCodeFromError(error)).toBe(ExitCode.RateLimitError);
      });

      it('should classify too many requests error', () => {
        const error = new Error('Too many requests');
        expect(getExitCodeFromError(error)).toBe(ExitCode.RateLimitError);
      });

      it('should classify HTTP 429 error', () => {
        const error = new Error('HTTP 429 error');
        expect(getExitCodeFromError(error)).toBe(ExitCode.RateLimitError);
      });
    });

    describe('QuotaError classification', () => {
      it('should classify quota exceeded error', () => {
        const error = new Error('Quota exceeded');
        expect(getExitCodeFromError(error)).toBe(ExitCode.QuotaError);
      });

      it('should classify character limit reached error', () => {
        const error = new Error('Character limit reached');
        expect(getExitCodeFromError(error)).toBe(ExitCode.QuotaError);
      });

      it('should classify HTTP 456 error', () => {
        const error = new Error('HTTP 456 error');
        expect(getExitCodeFromError(error)).toBe(ExitCode.QuotaError);
      });
    });

    describe('NetworkError classification', () => {
      it('should classify ECONNREFUSED error', () => {
        const error = new Error('connect ECONNREFUSED');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify ENOTFOUND error', () => {
        const error = new Error('getaddrinfo ENOTFOUND');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify ECONNRESET error', () => {
        const error = new Error('read ECONNRESET');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify ETIMEDOUT error', () => {
        const error = new Error('connect ETIMEDOUT');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify socket hang up error', () => {
        const error = new Error('socket hang up');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify network error phrase', () => {
        const error = new Error('Network error occurred');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify connection refused phrase', () => {
        const error = new Error('Connection refused');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify connection reset phrase', () => {
        const error = new Error('Connection reset by peer');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify connection timed out phrase', () => {
        const error = new Error('Connection timed out');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify network timeout phrase', () => {
        const error = new Error('Network timeout');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify service unavailable error', () => {
        const error = new Error('Service temporarily unavailable');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should classify HTTP 503 error', () => {
        const error = new Error('HTTP 503 error');
        expect(getExitCodeFromError(error)).toBe(ExitCode.NetworkError);
      });

      it('should not match bare "connection" without qualifying phrase', () => {
        const error = new Error('Database connection pool exhausted');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should not match bare "timeout" without qualifying phrase', () => {
        const error = new Error('Lock acquisition timeout');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });
    });

    describe('InvalidInput classification', () => {
      it('should classify cannot be empty error', () => {
        const error = new Error('Text cannot be empty');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should classify not found error', () => {
        const error = new Error('File not found');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should classify unsupported error', () => {
        const error = new Error('Unsupported format');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should classify invalid error', () => {
        const error = new Error('Invalid target language');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should classify "is required" error', () => {
        const error = new Error('Target language is required');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should classify expected error', () => {
        const error = new Error('Expected 2 columns');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should classify cannot specify both error', () => {
        const error = new Error('Cannot specify both --source and --auto-detect');
        expect(getExitCodeFromError(error)).toBe(ExitCode.InvalidInput);
      });

      it('should not match bare "required" without "is required"', () => {
        const error = new Error('All fields required by the API');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });
    });

    describe('ConfigError classification', () => {
      it('should classify failed to load config error', () => {
        const error = new Error('Failed to load config');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });

      it('should classify config file error', () => {
        const error = new Error('Config file corrupted');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });

      it('should classify config directory error', () => {
        const error = new Error('Config directory not writable');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });

      it('should classify configuration file error', () => {
        const error = new Error('Configuration file missing');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });

      it('should classify configuration error phrase', () => {
        const error = new Error('Configuration error: invalid JSON');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });

      it('should classify failed to save config error', () => {
        const error = new Error('Failed to save config');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });

      it('should not match bare "config" in unrelated context', () => {
        const error = new Error('The config value was updated');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });
    });

    describe('GeneralError classification', () => {
      it('should default to general error for unknown messages', () => {
        const error = new Error('Something went wrong');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should handle empty error message', () => {
        const error = new Error('');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should handle truly generic errors', () => {
        const error = new Error('Something broke');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });
    });

    describe('priority ordering', () => {
      it('should prioritize specific auth patterns over generic invalid pattern', () => {
        const error = new Error('invalid api key');
        expect(getExitCodeFromError(error)).toBe(ExitCode.AuthError);
      });

      it('should classify pure config file errors correctly', () => {
        const error = new Error('Config file corrupted');
        expect(getExitCodeFromError(error)).toBe(ExitCode.ConfigError);
      });
    });

    describe('ambiguous messages should not cross-match', () => {
      it('should not classify "Database connection required for config" as NetworkError', () => {
        const error = new Error('Database connection required for config');
        // Previously this would match 'connection' -> NetworkError, 'required' -> InvalidInput, 'config' -> ConfigError
        // With tightened patterns, none of these broad tokens match
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should not classify "timeout waiting for required resource" as NetworkError', () => {
        const error = new Error('timeout waiting for required resource');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should not classify "connection pool required" as NetworkError', () => {
        const error = new Error('connection pool required');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should not match 429 embedded in other numbers', () => {
        const error = new Error('Error code 14291');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should not match 503 embedded in other numbers', () => {
        const error = new Error('Reference ID: 50312');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });

      it('should not match 456 embedded in other numbers', () => {
        const error = new Error('Transaction 45678 failed');
        expect(getExitCodeFromError(error)).toBe(ExitCode.GeneralError);
      });
    });
  });

  describe('isRetryableError', () => {
    it('should mark rate limit errors as retryable', () => {
      expect(isRetryableError(ExitCode.RateLimitError)).toBe(true);
    });

    it('should mark network errors as retryable', () => {
      expect(isRetryableError(ExitCode.NetworkError)).toBe(true);
    });

    it('should mark auth errors as not retryable', () => {
      expect(isRetryableError(ExitCode.AuthError)).toBe(false);
    });

    it('should mark quota errors as not retryable', () => {
      expect(isRetryableError(ExitCode.QuotaError)).toBe(false);
    });

    it('should mark invalid input errors as not retryable', () => {
      expect(isRetryableError(ExitCode.InvalidInput)).toBe(false);
    });

    it('should mark config errors as not retryable', () => {
      expect(isRetryableError(ExitCode.ConfigError)).toBe(false);
    });

    it('should mark general errors as not retryable', () => {
      expect(isRetryableError(ExitCode.GeneralError)).toBe(false);
    });

    it('should mark check failed as not retryable', () => {
      expect(isRetryableError(ExitCode.CheckFailed)).toBe(false);
    });

    it('should mark success as not retryable', () => {
      expect(isRetryableError(ExitCode.Success)).toBe(false);
    });
  });
});
