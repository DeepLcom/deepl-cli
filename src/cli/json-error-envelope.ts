import { DeepLCLIError } from '../utils/errors.js';
import { exitCodeForError } from '../utils/exit-codes.js';

/**
 * JSON error envelope emitted on stdout when a command fails with
 * `--format json` in effect. Shared by every command that has a JSON mode so
 * script consumers can parse failures with one schema.
 *
 * @see tests/helpers/assert-error-envelope.ts for the canonical validator.
 */
export interface JsonErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    suggestion?: string;
  };
  exitCode: number;
}

// eslint-disable-next-line no-control-regex -- intentional: strip control chars from error messages before emitting envelope
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

function sanitizeMessage(message: string): string {
  return message.replace(CONTROL_CHAR_RE, '');
}

/**
 * Serialize an error to the canonical envelope on stdout and exit with the
 * error's typed exit code.
 *
 * stdout, not stderr: the envelope is the command's result in the failure
 * case, and stderr is where every warning — the CLI's own and the Node
 * runtime's — already goes, so an envelope there parses only when nothing else
 * happened to be said. The non-zero exit code remains the failure signal; a
 * consumer reads the reason off the same stream as the success payload.
 */
export function emitJsonErrorAndExit(
  error: unknown,
  overrideExitCode?: number
): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = err instanceof DeepLCLIError ? err.name : 'UnknownError';
  const exitCode =
    overrideExitCode ??
    (err instanceof DeepLCLIError ? err.exitCode : exitCodeForError(err));
  const envelope: JsonErrorEnvelope = {
    ok: false,
    error: {
      code,
      message: sanitizeMessage(err.message),
      ...(err instanceof DeepLCLIError && err.suggestion
        ? { suggestion: sanitizeMessage(err.suggestion) }
        : {}),
    },
    exitCode,
  };
  process.stdout.write(JSON.stringify(envelope) + '\n');
  process.exit(exitCode);
}
