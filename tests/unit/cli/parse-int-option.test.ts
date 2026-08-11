/**
 * Unit tests for the bounded positive-integer option parser.
 *
 * Number.parseInt is lenient — it truncates decimals and stops at the first
 * non-digit — so some inputs that look invalid still yield a usable integer.
 * Those are pinned here alongside the rejections, since the difference is what
 * reaches the option value downstream.
 */

import { InvalidArgumentError } from 'commander';
import { parsePositiveIntOption } from '../../../src/cli/commands/parse-int-option';

describe('parsePositiveIntOption', () => {
  describe('accepted values', () => {
    it('returns the parsed integer', () => {
      expect(parsePositiveIntOption('7', 'concurrency', 100)).toBe(7);
    });

    it('accepts the lower bound of 1', () => {
      expect(parsePositiveIntOption('1', 'concurrency', 100)).toBe(1);
    });

    it('accepts the maximum inclusively', () => {
      expect(parsePositiveIntOption('100', 'concurrency', 100)).toBe(100);
    });

    it('tolerates surrounding whitespace', () => {
      expect(parsePositiveIntOption(' 5 ', 'concurrency', 100)).toBe(5);
      expect(parsePositiveIntOption('\t7', 'concurrency', 100)).toBe(7);
    });

    it('accepts an explicit plus sign', () => {
      expect(parsePositiveIntOption('+5', 'concurrency', 100)).toBe(5);
    });
  });

  describe('rejected values', () => {
    it.each([
      '0',
      '-1',
      '-0',
      '101',
      '99999',
      'abc',
      '',
      '  ',
      '0x10',
      'Infinity',
    ])('rejects %p with an InvalidArgumentError', (value) => {
      expect(() => parsePositiveIntOption(value, 'concurrency', 100)).toThrow(
        InvalidArgumentError
      );
    });
  });

  describe('error message', () => {
    it('names the option, the bounds, and the offending value', () => {
      expect(() => parsePositiveIntOption('0', 'concurrency', 100)).toThrow(
        "--concurrency must be an integer between 1 and 100, got '0'"
      );
    });

    it('uses the caller-supplied name and maximum', () => {
      expect(() => parsePositiveIntOption('0', 'debounce', 600_000)).toThrow(
        "--debounce must be an integer between 1 and 600000, got '0'"
      );
    });
  });

  describe('lenient integer parsing', () => {
    it('truncates a decimal rather than rejecting it', () => {
      expect(parsePositiveIntOption('4.7', 'concurrency', 100)).toBe(4);
      expect(parsePositiveIntOption('1.9', 'concurrency', 100)).toBe(1);
    });

    it('stops at the first non-digit rather than rejecting', () => {
      expect(parsePositiveIntOption('4abc', 'concurrency', 100)).toBe(4);
    });

    it('reads scientific notation as its leading digits', () => {
      expect(parsePositiveIntOption('1e3', 'concurrency', 100)).toBe(1);
    });
  });
});
