/**
 * Tests for confirm utility
 */

import { confirm } from '../../src/utils/confirm';

describe('confirm()', () => {
  let originalIsTTY: boolean | undefined;
  let mockRl: {
    question: jest.Mock;
    close: jest.Mock;
  };
  let mockCreateInterface: jest.Mock;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    mockRl = {
      question: jest.fn(),
      close: jest.fn(),
    };
    mockCreateInterface = jest.fn().mockReturnValue(mockRl);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe('TTY mode', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
    });

    it('should return true when user answers "y"', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('y');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(true);
    });

    it('should return true when user answers "yes"', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('yes');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(true);
    });

    it('should return true when user answers "Y"', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('Y');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(true);
    });

    it('should return true when user answers "YES"', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('YES');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(true);
    });

    it('should return false when user answers "n"', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('n');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(false);
    });

    it('should return false when user answers "no"', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('no');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(false);
    });

    it('should return false when user presses enter (empty input)', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(false);
    });

    it('should return false for arbitrary text', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('maybe');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(false);
    });

    it('should trim whitespace from answer', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('  y  ');
      });

      const result = await confirm({ _createInterface: mockCreateInterface });
      expect(result).toBe(true);
    });

    it('should use default prompt message', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('n');
      });

      await confirm({ _createInterface: mockCreateInterface });

      expect(mockRl.question).toHaveBeenCalledWith(
        'Are you sure? [y/N] ',
        expect.any(Function),
      );
    });

    it('should use custom prompt message', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('n');
      });

      await confirm({ message: 'Delete everything?', _createInterface: mockCreateInterface });

      expect(mockRl.question).toHaveBeenCalledWith(
        'Delete everything? [y/N] ',
        expect.any(Function),
      );
    });

    it('should close readline interface after answer', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('y');
      });

      await confirm({ _createInterface: mockCreateInterface });

      expect(mockRl.close).toHaveBeenCalled();
    });

    it('should create readline with stdin and stderr', async () => {
      mockRl.question.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
        cb('n');
      });

      await confirm({ _createInterface: mockCreateInterface });

      expect(mockCreateInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stderr,
      });
    });
  });

  describe('non-TTY mode (piped input)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('should return false without prompting', async () => {
      const result = await confirm({ _createInterface: mockCreateInterface });

      expect(result).toBe(false);
      expect(mockCreateInterface).not.toHaveBeenCalled();
    });

    it('should return false regardless of message option', async () => {
      const result = await confirm({ message: 'Delete everything?', _createInterface: mockCreateInterface });

      expect(result).toBe(false);
      expect(mockCreateInterface).not.toHaveBeenCalled();
    });
  });
});
