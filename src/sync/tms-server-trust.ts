/**
 * Destination trust for the TMS integration.
 *
 * `tms.server` is chosen by `.deepl-sync.yaml`, which lives in the checkout
 * rather than under the user's control, while TMS_API_KEY/TMS_TOKEN come from
 * the user's environment. Attaching the second to a host named by the first
 * hands the credential -- and every translated string -- to whoever wrote the
 * YAML, so an env-sourced credential only reaches a hostname the user has
 * approved, either up front in `tms.allowedServers` or at a prompt whose answer
 * is recorded in user config, outside the repo.
 */

import { ConfigError } from '../utils/errors.js';
import { sanitizeForTerminal } from '../utils/control-chars.js';
import { confirm, isNoInput } from '../utils/confirm.js';
import { ConfigService } from '../storage/config.js';

export const ALLOWED_SERVERS_CONFIG_KEY = 'tms.allowedServers';

export type TmsCredentialSource = 'env' | 'config' | 'none';

export interface TmsServerTrustDeps {
  readAllowedServers?: () => string[];
  approveServer?: (hostname: string) => void;
  promptForApproval?: (message: string) => Promise<boolean>;
  canPrompt?: () => boolean;
}

function parseServerUrl(serverUrl: string): URL | undefined {
  try {
    return new URL(serverUrl);
  } catch {
    return undefined;
  }
}

/**
 * The origin alone, so the message names the destination without echoing a
 * repo-controlled path or query back to the terminal.
 */
export function tmsServerOrigin(serverUrl: string): string {
  const parsed = parseServerUrl(serverUrl);
  return sanitizeForTerminal(parsed ? parsed.origin : serverUrl);
}

function readStringArray(service: ConfigService): string[] {
  const value = service.getValue<unknown>(ALLOWED_SERVERS_CONFIG_KEY);
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function defaultReadAllowedServers(): string[] {
  return readStringArray(new ConfigService());
}

function defaultApproveServer(hostname: string): void {
  const service = new ConfigService();
  const existing = readStringArray(service);
  if (existing.some((entry) => entry.trim().toLowerCase() === hostname)) return;
  service.set(ALLOWED_SERVERS_CONFIG_KEY, [...existing, hostname]);
}

function approvalCommand(existing: string[], hostname: string): string {
  const hosts = [...existing.map((entry) => entry.toLowerCase()), hostname];
  return `deepl config set ${ALLOWED_SERVERS_CONFIG_KEY} ${[...new Set(hosts)].join(',')}`;
}

function refuse(
  reason: string,
  existing: string[],
  hostname: string
): ConfigError {
  return new ConfigError(
    reason,
    `Approve it once with:\n  ${approvalCommand(existing, hostname)}\n` +
      `Or remove the tms.server value from .deepl-sync.yaml if you did not expect this checkout to name a TMS.`
  );
}

export async function ensureTmsServerApproved(
  serverUrl: string,
  credentialSource: TmsCredentialSource,
  deps: TmsServerTrustDeps = {}
): Promise<void> {
  if (credentialSource !== 'env') return;

  // An unparseable URL never reaches the network: TmsClient.buildUrl rejects it
  // with a message that names the malformed value.
  const parsed = parseServerUrl(serverUrl);
  if (!parsed) return;

  const hostname = sanitizeForTerminal(parsed.hostname.toLowerCase());
  const readAllowedServers =
    deps.readAllowedServers ?? defaultReadAllowedServers;
  const existing = readAllowedServers();
  if (existing.some((entry) => entry.trim().toLowerCase() === hostname)) return;

  const canPrompt =
    deps.canPrompt ?? (() => !isNoInput() && !!process.stdin.isTTY);
  if (!canPrompt()) {
    throw refuse(
      `Refusing to send an environment-supplied TMS credential to "${hostname}", which is not in ${ALLOWED_SERVERS_CONFIG_KEY}. ` +
        `The destination was chosen by .deepl-sync.yaml in this checkout, and there is no terminal to confirm it on.`,
      existing,
      hostname
    );
  }

  const promptForApproval =
    deps.promptForApproval ?? ((message: string) => confirm({ message }));
  const approved = await promptForApproval(
    `.deepl-sync.yaml in this checkout points TMS sync at "${hostname}".\n` +
      `  Continuing sends your TMS_API_KEY/TMS_TOKEN and every translated string to that host.\n` +
      `  Trust "${hostname}" as a TMS destination from now on?`
  );

  if (!approved) {
    throw refuse(
      `TMS sync to "${hostname}" was not approved, so no credential or translation was sent.`,
      existing,
      hostname
    );
  }

  const approveServer = deps.approveServer ?? defaultApproveServer;
  approveServer(hostname);
}
