import * as readline from 'readline';

export interface ConfirmOptions {
  message?: string;
  /** Injected for testing; defaults to readline.createInterface */
  _createInterface?: typeof readline.createInterface;
}

export async function confirm(options: ConfirmOptions = {}): Promise<boolean> {
  const message = options.message ?? 'Are you sure?';
  const prompt = `${message} [y/N] `;

  if (!process.stdin.isTTY) {
    return false;
  }

  const factory = options._createInterface ?? readline.createInterface;

  return new Promise<boolean>((resolve) => {
    const rl = factory({
      input: process.stdin,
      output: process.stderr,
    });

    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}
