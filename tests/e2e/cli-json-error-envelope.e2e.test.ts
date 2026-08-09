/**
 * E2E tests for the `--format json` error envelope on the non-sync commands.
 *
 * The sync subcommands have emitted a typed envelope on stdout since the
 * envelope was recognised as the command's result in the failure case. Every
 * other command that accepts `--format json` routed its failures through the
 * global handler instead, which printed prose on stderr and left stdout empty —
 * so a script that chose `--format json` had nothing to parse in exactly the
 * case it needed to. These tests hold the two surfaces to one contract.
 */

import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { assertErrorEnvelope } from '../helpers/assert-error-envelope';

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

/** A port nothing listens on, so every API call fails as a NetworkError. */
const DEAD_ENDPOINT = 'http://127.0.0.1:1';

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

describe('--format json error envelope (non-sync commands)', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepl-json-err-'));
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({
        auth: { apiKey: 'test-key:fx' },
        api: { baseUrl: DEAD_ENDPOINT, usePro: false },
        cache: { enabled: false, maxSize: 1048576, ttl: 2592000 },
        output: { format: 'text', verbose: false, color: false },
        defaults: {
          targetLangs: [],
          formality: 'default',
          preserveFormatting: true,
        },
      }),
      { mode: 0o600 }
    );
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  function run(args: string[]): RunResult {
    const result: SpawnSyncReturns<string> = spawnSync(
      'node',
      [CLI_PATH, ...args],
      {
        encoding: 'utf-8',
        env: {
          ...process.env,
          DEEPL_CONFIG_DIR: configDir,
          DEEPL_API_KEY: 'test-key:fx',
          NO_COLOR: '1',
        },
        timeout: 20000,
      }
    );
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  describe('an unreachable API', () => {
    // The whole point is that one contract covers every command with the flag,
    // so the cases are a table rather than a hand-written test each.
    const NETWORK_CASES: Array<[label: string, args: string[]]> = [
      ['translate', ['translate', 'Hello', '--to', 'de']],
      ['usage', ['usage']],
      ['languages', ['languages']],
      ['detect', ['detect', 'Bonjour tout le monde']],
      ['glossary list', ['glossary', 'list']],
      ['tm list', ['tm', 'list']],
      ['write', ['write', 'Hello there']],
      ['correct', ['correct', 'Helo there']],
    ];

    it.each(NETWORK_CASES)(
      '%s emits the envelope on stdout with the network exit code',
      (_label, args) => {
        const result = run([...args, '--format', 'json']);

        expect(result.status).toBe(5);
        const envelope = assertErrorEnvelope(result.stdout, 'NetworkError', 5);
        expect(envelope.error.message).toMatch(/ECONNREFUSED|Network error/);
      }
    );

    it.each(NETWORK_CASES)(
      '%s leaves text mode reporting on stderr, with stdout empty',
      (_label, args) => {
        const result = run(args);

        expect(result.status).toBe(5);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Error:');
      }
    );

    it('parses as one JSON document even when the CLI warns on stderr', () => {
      // The endpoint is not a DeepL one, so the key-destination warning fires on
      // stderr in the same run. That is what put the envelope on stdout in the
      // first place, and it must not reach the machine-readable stream.
      const result = run(['usage', '--format', 'json']);

      expect(result.stderr).toContain('not a DeepL API endpoint');
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('a local validation failure', () => {
    it('carries the typed code and the suggestion', () => {
      const result = run(['translate', 'Hello', '--format', 'json']);

      expect(result.status).toBe(6);
      const envelope = assertErrorEnvelope(result.stdout, 'ValidationError', 6);
      expect(envelope.error.suggestion).toMatch(/--to/);
    });

    it('reports a missing API key as an auth failure', () => {
      const result = spawnSync(
        'node',
        [CLI_PATH, 'usage', '--format', 'json'],
        {
          encoding: 'utf-8',
          env: (() => {
            const { DEEPL_API_KEY: _drop, ...rest } = process.env;
            return {
              ...rest,
              DEEPL_CONFIG_DIR: fs.mkdtempSync(
                path.join(os.tmpdir(), 'deepl-json-noauth-')
              ),
              NO_COLOR: '1',
            };
          })(),
          timeout: 20000,
        }
      );

      expect(result.status).toBe(2);
      assertErrorEnvelope(result.stdout ?? '', 'AuthError', 2);
    });
  });

  describe('healthy paths the envelope must not disturb', () => {
    it('leaves a successful text-mode command alone', () => {
      const result = run(['config', 'list', '--format', 'text']);

      expect(result.status).toBe(0);
      expect(() => JSON.parse(result.stdout)).toThrow();
      expect(result.stdout).toContain('api.baseUrl');
    });

    it('leaves a successful --format json payload alone', () => {
      const result = run(['config', 'list', '--format', 'json']);

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as { api?: unknown };
      expect(parsed.api).toBeDefined();
    });

    it('does not emit an envelope for --format table', () => {
      const result = run(['usage', '--format', 'table']);

      expect(result.status).toBe(5);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error:');
    });
  });
});
