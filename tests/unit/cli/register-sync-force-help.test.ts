/**
 * Help-text test for --force cost-cap warning.
 *
 * `--force` does two things that users conflate:
 *   1. Retranslates all strings (ignores the lockfile delta).
 *   2. Bypasses the `sync.max_characters` cost-cap preflight.
 *
 * The second effect is what surprises people — a CI run with --force can blow
 * through the spend cap silently. The help surface should say so up front.
 */

import { Command } from 'commander';
import { registerSync } from '../../../src/cli/commands/register-sync';
import type { ServiceDeps } from '../../../src/cli/commands/service-factory';

function makeDeps(): ServiceDeps {
  return {
    createDeepLClient: jest.fn() as unknown as ServiceDeps['createDeepLClient'],
    getApiKeyAndOptions: jest.fn() as unknown as ServiceDeps['getApiKeyAndOptions'],
    getConfigService: jest.fn() as unknown as ServiceDeps['getConfigService'],
    getCacheService: jest.fn() as unknown as ServiceDeps['getCacheService'],
    handleError: jest.fn() as unknown as ServiceDeps['handleError'],
  };
}

function getForceOption() {
  const program = new Command();
  registerSync(program, makeDeps());
  const sync = program.commands.find((c) => c.name() === 'sync');
  if (!sync) throw new Error('sync command not registered');
  const opts = (sync as unknown as { options: Array<{ flags: string; description: string }> })
    .options;
  const opt = opts.find((o) => o.flags === '--force');
  if (!opt) throw new Error('--force option not found');
  return opt;
}

describe('deepl sync --force help', () => {
  it('mentions bypassing the sync.max_characters cost-cap', () => {
    const opt = getForceOption();
    expect(opt.description).toMatch(/max_characters|cost.cap/i);
  });

  it('warns about API costs / billing', () => {
    const opt = getForceOption();
    expect(opt.description).toMatch(/bill|cost|charge/i);
  });

  it('still describes the lockfile-ignoring behavior', () => {
    const opt = getForceOption();
    expect(opt.description).toMatch(/retranslate|lock/i);
  });
});
