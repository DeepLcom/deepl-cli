/**
 * Tests for Logger utility
 * Following TDD approach - RED phase
 */

import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    // Reset logger state
    Logger.setQuiet(false);
    Logger.setVerbose(false);
  });

  describe('setQuiet()', () => {
    it('should enable quiet mode', () => {
      Logger.setQuiet(true);
      expect(Logger.isQuiet()).toBe(true);
    });

    it('should disable quiet mode', () => {
      Logger.setQuiet(true);
      Logger.setQuiet(false);
      expect(Logger.isQuiet()).toBe(false);
    });
  });

  describe('info()', () => {
    it('should log info messages to stderr in normal mode', () => {
      Logger.info('Test message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Test message');
    });

    it('should suppress info messages in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.info('Test message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.info('Message', 'with', 'args');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Message', 'with', 'args');
    });
  });

  describe('success()', () => {
    it('should log success messages to stderr in normal mode', () => {
      Logger.success('Success message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Success message');
    });

    it('should suppress success messages in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.success('Success message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn()', () => {
    it('should log warnings in normal mode', () => {
      Logger.warn('Warning message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Warning message');
    });

    it('should suppress warnings in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.warn('Warning message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('error()', () => {
    it('should log errors in normal mode', () => {
      Logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');
    });

    it('should always log errors even in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');
    });

    it('should handle multiple arguments', () => {
      Logger.setQuiet(true);
      Logger.error('Error:', 'details');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'details');
    });
  });

  describe('output()', () => {
    it('should log output in normal mode', () => {
      Logger.output('Result');
      expect(consoleLogSpy).toHaveBeenCalledWith('Result');
    });

    it('should always log output even in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.output('Result');
      expect(consoleLogSpy).toHaveBeenCalledWith('Result');
    });

    it('should handle objects', () => {
      const obj = { text: 'Hello' };
      Logger.output(obj);
      expect(consoleLogSpy).toHaveBeenCalledWith(obj);
    });
  });

  describe('setVerbose()', () => {
    it('should enable verbose mode', () => {
      Logger.setVerbose(true);
      expect(Logger.isVerbose()).toBe(true);
    });

    it('should disable verbose mode', () => {
      Logger.setVerbose(true);
      Logger.setVerbose(false);
      expect(Logger.isVerbose()).toBe(false);
    });

    it('should default to disabled', () => {
      expect(Logger.isVerbose()).toBe(false);
    });
  });

  describe('verbose()', () => {
    it('should not log when verbose mode is disabled', () => {
      Logger.verbose('Verbose message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log to stderr when verbose mode is enabled', () => {
      Logger.setVerbose(true);
      Logger.verbose('Verbose message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Verbose message');
    });

    it('should suppress verbose messages in quiet mode even when verbose is enabled', () => {
      Logger.setVerbose(true);
      Logger.setQuiet(true);
      Logger.verbose('Verbose message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.setVerbose(true);
      Logger.verbose('Key:', 'value', 123);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Key:', 'value', 123);
    });
  });

  describe('verbose() sanitization', () => {
    beforeEach(() => {
      Logger.setVerbose(true);
    });

    it('should redact ?token= query parameter from URLs', () => {
      Logger.verbose('wss://api.deepl.com/ws?token=abc123-secret');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'wss://api.deepl.com/ws?token=[REDACTED]'
      );
    });

    it('should redact &token= query parameter from URLs', () => {
      Logger.verbose('https://api.deepl.com/ws?lang=en&token=abc123-secret&format=text');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'https://api.deepl.com/ws?lang=en&token=[REDACTED]&format=text'
      );
    });

    it('should redact DeepL-Auth-Key header values', () => {
      Logger.verbose('Authorization: DeepL-Auth-Key abc123-secret:fx');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Authorization: DeepL-Auth-Key [REDACTED]'
      );
    });

    it('should redact DeepL-Auth-Key case-insensitively', () => {
      Logger.verbose('deepl-auth-key MY-KEY:fx');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'DeepL-Auth-Key [REDACTED]'
      );
    });

    it('should redact DEEPL_API_KEY env var value from strings', () => {
      const originalKey = process.env['DEEPL_API_KEY'];
      process.env['DEEPL_API_KEY'] = 'test-secret-key-123:fx';
      try {
        Logger.verbose('Using key test-secret-key-123:fx for request');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Using key [REDACTED] for request'
        );
      } finally {
        if (originalKey === undefined) {
          delete process.env['DEEPL_API_KEY'];
        } else {
          process.env['DEEPL_API_KEY'] = originalKey;
        }
      }
    });

    it('should not redact when DEEPL_API_KEY is not set', () => {
      const originalKey = process.env['DEEPL_API_KEY'];
      delete process.env['DEEPL_API_KEY'];
      try {
        Logger.verbose('Some message with no key to redact');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Some message with no key to redact'
        );
      } finally {
        if (originalKey !== undefined) {
          process.env['DEEPL_API_KEY'] = originalKey;
        }
      }
    });

    it('should pass non-string args through unchanged', () => {
      const obj = { url: 'wss://api.deepl.com/ws?token=secret' };
      Logger.verbose(obj, 42, null);
      expect(consoleErrorSpy).toHaveBeenCalledWith(obj, 42, null);
    });

    it('should sanitize multiple string args independently', () => {
      Logger.verbose('wss://host?token=secret', 'DeepL-Auth-Key my-key');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'wss://host?token=[REDACTED]',
        'DeepL-Auth-Key [REDACTED]'
      );
    });

    it('should apply all sanitization patterns to a single string', () => {
      const originalKey = process.env['DEEPL_API_KEY'];
      process.env['DEEPL_API_KEY'] = 'combo-key:fx';
      try {
        Logger.verbose('url?token=tok1 header DeepL-Auth-Key combo-key:fx end');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'url?token=[REDACTED] header DeepL-Auth-Key [REDACTED] end'
        );
      } finally {
        if (originalKey === undefined) {
          delete process.env['DEEPL_API_KEY'];
        } else {
          process.env['DEEPL_API_KEY'] = originalKey;
        }
      }
    });
  });

  describe('spinner control', () => {
    it('should return true for shouldShowSpinner in normal mode', () => {
      expect(Logger.shouldShowSpinner()).toBe(true);
    });

    it('should return false for shouldShowSpinner in quiet mode', () => {
      Logger.setQuiet(true);
      expect(Logger.shouldShowSpinner()).toBe(false);
    });
  });
});
