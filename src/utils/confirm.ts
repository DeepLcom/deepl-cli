import * as readline from 'readline';

let noInput = false;

export function setNoInput(enabled: boolean): void {
  noInput = enabled;
}

export function isNoInput(): boolean {
  return noInput;
}

/**
 * Can a question actually be put to someone?
 *
 * False in a git hook, cron job, container entrypoint, CI runner or under
 * `--no-input`, where `confirm()` answers no on the user's behalf. A caller
 * whose command is too destructive to decline silently checks this first and
 * refuses with an error naming its own `--yes` flag.
 */
export function canPrompt(): boolean {
  return !noInput && Boolean(process.stdin.isTTY);
}

export interface ConfirmOptions {
  message?: string;
  /** Injected for testing; defaults to readline.createInterface */
  _createInterface?: typeof readline.createInterface;
}

export async function confirm(options: ConfirmOptions = {}): Promise<boolean> {
  const message = options.message ?? 'Are you sure?';
  const prompt = `${message} [y/N] `;

  if (!canPrompt()) {
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
