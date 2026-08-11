/**
 * Unit tests for the `deepl sync` parent command handler.
 *
 * Bare --context and --no-context on `sync` hard-error (exit 6,
 * ValidationError) with a did-you-mean hint pointing at --scan-context.
 */

import { Command } from 'commander';
import { registerSync } from '../../../src/cli/commands/register-sync';
import { ValidationError } from '../../../src/utils/errors';
import type { ServiceDeps } from '../../../src/cli/commands/service-factory';

jest.mock('../../../src/cli/commands/service-factory', () => {
  const actual = jest.requireActual(
    '../../../src/cli/commands/service-factory'
  );
  return {
    ...(actual as object),
    createSyncCommand: jest.fn(),
  };
});

const { createSyncCommand: mockCreateSyncCommand } =
  require('../../../src/cli/commands/service-factory') as {
    createSyncCommand: jest.Mock;
  };

function makeDeps(handleError: jest.Mock): ServiceDeps {
  return {
    createDeepLClient: jest.fn(),
    getApiKeyAndOptions: jest.fn(),
    getConfigService: jest.fn(),
    getCacheService: jest.fn(),
    handleError: handleError as unknown as ServiceDeps['handleError'],
  };
}

const EMPTY_SYNC_RESULT = {
  success: true,
  totalKeys: 0,
  newKeys: 0,
  staleKeys: 0,
  deletedKeys: 0,
  currentKeys: 0,
  totalCharactersBilled: 0,
  fileResults: [],
  validationWarnings: 0,
  validationErrors: 0,
  estimatedCharacters: 0,
  targetLocaleCount: 0,
  dryRun: false,
  frozen: false,
  driftDetected: false,
  lockUpdated: false,
};

async function runSync(argv: string[], deps: ServiceDeps): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSync(program, deps);
  await program.parseAsync(['node', 'deepl', 'sync', ...argv]);
}

describe('deepl sync --context hard-error', () => {
  let handleError: jest.Mock;
  let capturedSyncOptions: Record<string, unknown> | undefined;

  beforeEach(() => {
    handleError = jest.fn();
    capturedSyncOptions = undefined;
    mockCreateSyncCommand.mockReset();
    mockCreateSyncCommand.mockImplementation(() =>
      Promise.resolve({
        run: jest.fn((opts: Record<string, unknown>) => {
          capturedSyncOptions = opts;
          return Promise.resolve(EMPTY_SYNC_RESULT);
        }),
      })
    );
  });

  it('rejects bare --context with a ValidationError that names --scan-context', async () => {
    const deps = makeDeps(handleError);
    await runSync(['--context'], deps);
    expect(handleError).toHaveBeenCalledTimes(1);
    const err = handleError.mock.calls[0]![0] as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.exitCode).toBe(6);
    expect(err.message).toMatch(/--context is not a `deepl sync` flag/);
    expect(err.message).toMatch(
      /`deepl translate --context "<text>"` takes a string/
    );
    expect(err.suggestion).toMatch(/--scan-context \/ --no-scan-context/);
    expect(mockCreateSyncCommand).not.toHaveBeenCalled();
  });

  it('rejects --no-context with the same error', async () => {
    const deps = makeDeps(handleError);
    await runSync(['--no-context'], deps);
    expect(handleError).toHaveBeenCalledTimes(1);
    const err = handleError.mock.calls[0]![0] as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.exitCode).toBe(6);
    expect(err.suggestion).toMatch(/--scan-context/);
    expect(mockCreateSyncCommand).not.toHaveBeenCalled();
  });

  it('accepts --scan-context and dispatches with scanContext=true', async () => {
    const deps = makeDeps(handleError);
    await runSync(['--scan-context'], deps);
    expect(handleError).not.toHaveBeenCalled();
    expect(mockCreateSyncCommand).toHaveBeenCalledTimes(1);
    expect(capturedSyncOptions).toBeDefined();
    expect(capturedSyncOptions?.['scanContext']).toBe(true);
  });

  it('accepts --no-scan-context and dispatches with scanContext=false', async () => {
    const deps = makeDeps(handleError);
    await runSync(['--no-scan-context'], deps);
    expect(handleError).not.toHaveBeenCalled();
    expect(mockCreateSyncCommand).toHaveBeenCalledTimes(1);
    expect(capturedSyncOptions).toBeDefined();
    expect(capturedSyncOptions?.['scanContext']).toBe(false);
  });

  it('leaves scanContext undefined when neither flag is passed (config default wins)', async () => {
    const deps = makeDeps(handleError);
    await runSync([], deps);
    expect(handleError).not.toHaveBeenCalled();
    expect(mockCreateSyncCommand).toHaveBeenCalledTimes(1);
    expect(capturedSyncOptions).toBeDefined();
    expect(capturedSyncOptions?.['scanContext']).toBeUndefined();
    expect(capturedSyncOptions?.['context']).toBeUndefined();
  });
});

describe('deepl sync bounded integer options', () => {
  let handleError: jest.Mock;
  let capturedSyncOptions: Record<string, unknown> | undefined;

  beforeEach(() => {
    handleError = jest.fn();
    capturedSyncOptions = undefined;
    mockCreateSyncCommand.mockReset();
    mockCreateSyncCommand.mockImplementation(() =>
      Promise.resolve({
        run: jest.fn((opts: Record<string, unknown>) => {
          capturedSyncOptions = opts;
          return Promise.resolve(EMPTY_SYNC_RESULT);
        }),
      })
    );
  });

  // Commander converts an InvalidArgumentError thrown by an option parser into
  // a CommanderError before any action runs, so the rejection surfaces out of
  // parseAsync rather than through handleError.
  async function parseExpectingRejection(argv: string[]): Promise<Error> {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {} });
    registerSync(program, makeDeps(handleError));
    try {
      await program.parseAsync(['node', 'deepl', 'sync', ...argv]);
    } catch (error) {
      return error as Error;
    }
    throw new Error(`expected 'sync ${argv.join(' ')}' to be rejected`);
  }

  describe('--concurrency', () => {
    it.each(['0', '-1', '101', 'abc'])(
      'rejects %p without starting a sync',
      async (value) => {
        const error = await parseExpectingRejection(['--concurrency', value]);

        expect(error.message).toContain(
          '--concurrency must be an integer between 1 and 100'
        );
        expect(mockCreateSyncCommand).not.toHaveBeenCalled();
      }
    );

    it('passes an in-range value through as a number', async () => {
      await runSync(['--concurrency', '7'], makeDeps(handleError));

      expect(handleError).not.toHaveBeenCalled();
      expect(capturedSyncOptions?.['concurrency']).toBe(7);
    });
  });

  describe('--debounce', () => {
    it.each(['0', '600001', 'abc'])(
      'rejects %p without starting a sync',
      async (value) => {
        const error = await parseExpectingRejection(['--debounce', value]);

        expect(error.message).toContain(
          '--debounce must be an integer between 1 and 600000'
        );
        expect(mockCreateSyncCommand).not.toHaveBeenCalled();
      }
    );

    it('passes an in-range value through as a number', async () => {
      await runSync(['--debounce', '250'], makeDeps(handleError));

      expect(handleError).not.toHaveBeenCalled();
      expect(capturedSyncOptions?.['debounce']).toBe(250);
    });
  });
});
