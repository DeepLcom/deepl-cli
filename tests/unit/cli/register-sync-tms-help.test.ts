/**
 * Help-text tests for sync push/pull TMS onboarding.
 *
 * Users discovering push/pull via --help see only --locale and --sync-config.
 * Runtime throws ConfigError ("TMS integration not configured") when the
 * tms: block is absent, which is correct but happens too late — the help
 * surface should document the required YAML block and env vars up front.
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

function renderHelp(name: 'push' | 'pull'): string {
  const program = new Command();
  registerSync(program, makeDeps());
  const sync = program.commands.find((c) => c.name() === 'sync');
  if (!sync) throw new Error('sync command not registered');
  const sub = sync.commands.find((c) => c.name() === name);
  if (!sub) throw new Error(`sync ${name} command not registered`);
  let captured = '';
  sub.configureOutput({ writeOut: (s: string) => { captured += s; } });
  sub.outputHelp();
  return captured;
}

describe('deepl sync push --help (TMS onboarding hint)', () => {
  const help = renderHelp('push');

  it('mentions the required tms: YAML block', () => {
    expect(help).toMatch(/tms:/);
  });

  it('mentions TMS_API_KEY and TMS_TOKEN env vars', () => {
    expect(help).toMatch(/TMS_API_KEY/);
    expect(help).toMatch(/TMS_TOKEN/);
  });

  it('points users to docs/SYNC.md for the full REST contract', () => {
    expect(help).toMatch(/docs\/SYNC\.md/);
  });
});

describe('deepl sync pull --help (TMS onboarding hint)', () => {
  const help = renderHelp('pull');

  it('mentions the required tms: YAML block', () => {
    expect(help).toMatch(/tms:/);
  });

  it('mentions TMS_API_KEY and TMS_TOKEN env vars', () => {
    expect(help).toMatch(/TMS_API_KEY/);
    expect(help).toMatch(/TMS_TOKEN/);
  });

  it('points users to docs/SYNC.md for the full REST contract', () => {
    expect(help).toMatch(/docs\/SYNC\.md/);
  });
});
