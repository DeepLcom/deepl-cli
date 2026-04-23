/**
 * Integration test: asserts that the `--file-format` choices registered on
 * `deepl sync init` match the canonical format keys exposed by the default
 * {@link FormatRegistry}. Prevents silent divergence between parser
 * registration and CLI help.
 */

import { Command } from 'commander';
import { registerSync } from '../../src/cli/commands/register-sync';
import {
  SUPPORTED_FORMAT_KEYS,
  createDefaultRegistry,
} from '../../src/formats';
import type { ServiceDeps } from '../../src/cli/commands/service-factory';

function makeDeps(): ServiceDeps {
  const handleError = jest.fn();
  return {
    createDeepLClient: jest.fn() as unknown as ServiceDeps['createDeepLClient'],
    getApiKeyAndOptions: jest.fn() as unknown as ServiceDeps['getApiKeyAndOptions'],
    getConfigService: jest.fn() as unknown as ServiceDeps['getConfigService'],
    getCacheService: jest.fn() as unknown as ServiceDeps['getCacheService'],
    handleError: handleError as unknown as ServiceDeps['handleError'],
  };
}

function findFileFormatChoices(program: Command): readonly string[] | undefined {
  const syncCmd = program.commands.find((c) => c.name() === 'sync');
  const initCmd = syncCmd?.commands.find((c) => c.name() === 'init');
  const fileFormatOpt = initCmd?.options.find((o) => o.long === '--file-format');
  return fileFormatOpt?.argChoices;
}

describe('deepl sync init --file-format choices mirror the format registry', () => {
  it('exposes exactly the canonical SUPPORTED_FORMAT_KEYS', () => {
    const program = new Command();
    registerSync(program, makeDeps());
    const choices = findFileFormatChoices(program);
    expect(choices).toBeDefined();
    expect([...choices!].sort()).toEqual([...SUPPORTED_FORMAT_KEYS].sort());
  });

  it('matches the config keys of every parser the registry loads', async () => {
    const program = new Command();
    registerSync(program, makeDeps());
    const choices = findFileFormatChoices(program);
    const registry = await createDefaultRegistry();
    expect([...choices!].sort()).toEqual(registry.getFormatKeys().sort());
  });
});
