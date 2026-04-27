/**
 * Help-text test for --no-scan-context.
 *
 * `--no-scan-context` only overrides `context.enabled` in .deepl-sync.yaml;
 * other `context.*` settings (patterns, exclude, etc.) stay applied. The help
 * text should say so up front — a terse "Disable source-code context scanning"
 * invites the wrong mental model (that the whole context: block is ignored).
 */

import { Command } from 'commander';
import { registerSync } from '../../../src/cli/commands/register-sync';
import type { ServiceDeps } from '../../../src/cli/commands/service-factory';

function makeDeps(): ServiceDeps {
  return {
    createDeepLClient: jest.fn(),
    getApiKeyAndOptions: jest.fn(),
    getConfigService: jest.fn(),
    getCacheService: jest.fn(),
    handleError: jest.fn() as unknown as ServiceDeps['handleError'],
  };
}

function getSyncCommand(): Command {
  const program = new Command();
  registerSync(program, makeDeps());
  const sync = program.commands.find((c) => c.name() === 'sync');
  if (!sync) throw new Error('sync command not registered');
  return sync;
}

function findOption(cmd: Command, flag: string) {
  const opts = (cmd as unknown as { options: Array<{ flags: string; description: string }> })
    .options;
  return opts.find((o) => o.flags === flag);
}

describe('deepl sync --no-scan-context help', () => {
  it('notes that only context.enabled is overridden', () => {
    const sync = getSyncCommand();
    const opt = findOption(sync, '--no-scan-context');
    if (!opt) throw new Error('--no-scan-context option not found');
    expect(opt.description).toMatch(/context\.enabled/);
  });

  it('notes that other context.* settings are preserved', () => {
    const sync = getSyncCommand();
    const opt = findOption(sync, '--no-scan-context');
    if (!opt) throw new Error('--no-scan-context option not found');
    expect(opt.description).toMatch(/preserv|other context\.\*|kept/i);
  });
});
