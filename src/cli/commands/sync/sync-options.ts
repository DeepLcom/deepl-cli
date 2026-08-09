import type { Command } from 'commander';
import { ExitCode } from '../../../utils/exit-codes.js';

/**
 * Commander routes an invocation-line --format to the nearest command that
 * declares it. When both the parent `sync` command and a subcommand declare
 * --format, the parent wins if --format appears before the subcommand name
 * (e.g. `deepl sync --format json status`). Subcommand handlers should prefer
 * the parent's value when it is stronger than their own default ("text").
 */
export function resolveFormat(
  opts: { format?: string },
  command: Command
): string | undefined {
  const parentFormat = command.parent?.opts()['format'] as string | undefined;
  if (parentFormat && parentFormat !== 'text' && opts.format === 'text') {
    return parentFormat;
  }
  return opts.format;
}

/**
 * Resolve --locale across parent (`sync`) and subcommand scopes so a
 * subcommand narrows regardless of where the flag sits on the invocation
 * line. Subcommand value wins; otherwise fall back to the parent's.
 *
 * Without positional options, commander keeps matching the parent's flags
 * after the subcommand name, so `deepl sync status --locale de` binds `de` to
 * the parent `sync` command and leaves the subcommand's own store undefined.
 */
export function resolveLocale(
  opts: { locale?: string },
  command: Command
): string | undefined {
  if (opts.locale !== undefined) return opts.locale;
  return command.parent?.opts()['locale'] as string | undefined;
}

/**
 * Resolve --sync-config across parent (`sync`) and subcommand scopes. Same
 * parent/child binding rule as {@link resolveLocale}: a subcommand that reads
 * only its own store silently falls back to the auto-detected config.
 */
export function resolveSyncConfig(
  opts: { syncConfig?: string },
  command: Command
): string | undefined {
  if (opts.syncConfig !== undefined) return opts.syncConfig;
  return command.parent?.opts()['syncConfig'] as string | undefined;
}

/**
 * Resolve --break-lock across parent (`sync`) and subcommand scopes. Same
 * parent/child binding rule as {@link resolveLocale}: the parent `sync`
 * command also declares the flag, so a subcommand that reads only its own
 * store would silently keep respecting a lock the operator asked it to break.
 */
export function resolveBreakLock(
  opts: { breakLock?: boolean },
  command: Command
): boolean {
  if (opts.breakLock !== undefined) return opts.breakLock;
  return (command.parent?.opts()['breakLock'] as boolean | undefined) ?? false;
}

/**
 * Split a resolved --locale value into the comma-separated filter list that
 * `loadSyncConfig` validates against `target_locales`.
 */
export function parseLocaleFilter(
  locale: string | undefined
): string[] | undefined {
  if (!locale) return undefined;
  return locale.split(',').map((l) => l.trim());
}

/**
 * JSON error envelope shape emitted on stdout when --format json is set and a
 * command fails. Shared across every command that has a JSON mode so script
 * consumers can parse failures with one schema.
 *
 * @see tests/helpers/assert-error-envelope.ts for the canonical validator.
 */
export type { JsonErrorEnvelope as SyncJsonErrorEnvelope } from '../../json-error-envelope.js';

/**
 * Canonical success envelope for `sync init --format json`. Other subcommands
 * emit their own typed success payloads; init ships a minimal `ok:true` +
 * `created:{...}` so bootstrap scripts can confirm the config was written.
 */
export interface SyncInitJsonSuccessEnvelope {
  ok: true;
  created: {
    configPath: string;
    sourceLocale: string;
    targetLocales: string[];
    keys?: number;
  };
}

/**
 * The sync surface's name for the shared envelope emitter, kept so every sync
 * subcommand imports its machine-readable failure path from one place.
 */
export { emitJsonErrorAndExit } from '../../json-error-envelope.js';

/**
 * Serialize the canonical success envelope for `sync init --format json` to
 * stdout and exit 0. Only `init` uses this helper today; other subcommands
 * have richer payloads and write them directly.
 */
export function emitJsonInitSuccessAndExit(
  payload: SyncInitJsonSuccessEnvelope['created']
): never {
  const envelope: SyncInitJsonSuccessEnvelope = {
    ok: true,
    created: payload,
  };
  process.stdout.write(JSON.stringify(envelope) + '\n');
  process.exit(ExitCode.Success);
}
