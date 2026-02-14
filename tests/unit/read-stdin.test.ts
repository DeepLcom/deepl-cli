import { PassThrough } from 'stream';
import { ValidationError } from '../../src/utils/errors';

describe('readStdin', () => {
  let originalStdin: typeof process.stdin;

  beforeEach(() => {
    originalStdin = process.stdin;
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
  });

  function mockStdin(): PassThrough {
    const stream = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: stream, writable: true });
    return stream;
  }

  // Dynamic import to get a fresh module per test (avoids shared stdin listeners)
  async function loadReadStdin() {
    const mod = await import('../../src/utils/read-stdin');
    return mod.readStdin;
  }

  it('should resolve with accumulated text', async () => {
    const stream = mockStdin();
    const readStdin = await loadReadStdin();

    const promise = readStdin();
    stream.write('Hello ');
    stream.write('World');
    stream.end();

    const result = await promise;
    expect(result).toBe('Hello World');
  });

  it('should resolve with empty string when stdin is empty', async () => {
    const stream = mockStdin();
    const readStdin = await loadReadStdin();

    const promise = readStdin();
    stream.end();

    const result = await promise;
    expect(result).toBe('');
  });

  it('should reject when input exceeds 128KB', async () => {
    const stream = mockStdin();
    const readStdin = await loadReadStdin();

    const promise = readStdin();
    // Write more than 128KB (131072 bytes)
    const largeChunk = 'x'.repeat(132000);
    stream.write(largeChunk);
    stream.end();

    await expect(promise).rejects.toThrow(ValidationError);
    await expect(promise).rejects.toThrow('Input exceeds maximum size of 128KB');
  });

  it('should reject on stdin error', async () => {
    const stream = mockStdin();
    const readStdin = await loadReadStdin();

    const promise = readStdin();
    stream.destroy(new Error('stdin broken'));

    await expect(promise).rejects.toThrow('stdin broken');
  });
});
