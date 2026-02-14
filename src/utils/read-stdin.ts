import { ValidationError } from './errors.js';

const MAX_STDIN_BYTES = 131072; // 128KB

export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let byteLength = 0;

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      byteLength += Buffer.byteLength(String(chunk), 'utf8');
      if (byteLength > MAX_STDIN_BYTES) {
        reject(new ValidationError('Input exceeds maximum size of 128KB'));
        return;
      }
      data += chunk;
    });

    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (error) => reject(error));
  });
}
