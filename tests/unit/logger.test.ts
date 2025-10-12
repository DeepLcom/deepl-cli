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
    it('should log info messages in normal mode', () => {
      Logger.info('Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Test message');
    });

    it('should suppress info messages in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.info('Test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      Logger.info('Message', 'with', 'args');
      expect(consoleLogSpy).toHaveBeenCalledWith('Message', 'with', 'args');
    });
  });

  describe('success()', () => {
    it('should log success messages in normal mode', () => {
      Logger.success('Success message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Success message');
    });

    it('should suppress success messages in quiet mode', () => {
      Logger.setQuiet(true);
      Logger.success('Success message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
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
