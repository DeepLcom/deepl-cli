import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CLIRunOptions {
  env?: Record<string, string | undefined>;
  apiKey?: string;
  excludeApiKey?: boolean;
  timeout?: number;
  noColor?: boolean;
  stdio?: string | string[];
}

export interface CLIErrorResult {
  status: number;
  output: string;
}

export interface TestConfigDir {
  path: string;
  cleanup: () => void;
}

const CLI_PATH = path.join(process.cwd(), 'dist/cli/index.js');

export function createTestConfigDir(label: string): TestConfigDir {
  const dirPath = path.join(os.tmpdir(), `.deepl-cli-test-${label}-${Date.now()}`);
  fs.mkdirSync(dirPath, { recursive: true });
  return {
    path: dirPath,
    cleanup: () => {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    },
  };
}

export function createTestDir(label: string): TestConfigDir {
  const dirPath = path.join(os.tmpdir(), `.deepl-cli-${label}-${Date.now()}`);
  fs.mkdirSync(dirPath, { recursive: true });
  return {
    path: dirPath,
    cleanup: () => {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    },
  };
}

function buildEnv(configDir: string, options: CLIRunOptions = {}): Record<string, string | undefined> {
  let baseEnv: Record<string, string | undefined> = { ...process.env };

  if (options.excludeApiKey) {
    const { DEEPL_API_KEY: _, ...rest } = baseEnv;
    baseEnv = rest;
  }

  return {
    ...baseEnv,
    DEEPL_CONFIG_DIR: configDir,
    ...(options.noColor && { NO_COLOR: '1' }),
    ...(options.apiKey !== undefined && { DEEPL_API_KEY: options.apiKey }),
    ...options.env,
  };
}

export function makeRunCLI(configDir: string, defaultOptions: CLIRunOptions = {}) {
  function mergeOptions(options: CLIRunOptions): CLIRunOptions {
    return { ...defaultOptions, ...options, env: { ...defaultOptions.env, ...options.env } };
  }

  /**
   * Run a CLI command capturing stdout only.
   * For integration tests, pass the full command (e.g., 'deepl translate --help').
   */
  function runCLI(command: string, options: CLIRunOptions = {}): string {
    const merged = mergeOptions(options);
    return execSync(command, {
      encoding: 'utf-8',
      env: buildEnv(configDir, merged),
      ...(merged.timeout ? { timeout: merged.timeout } : {}),
    });
  }

  /**
   * Run a CLI command capturing both stdout and stderr (merged via 2>&1).
   */
  function runCLIAll(command: string, options: CLIRunOptions = {}): string {
    const merged = mergeOptions(options);
    return execSync(`${command} 2>&1`, {
      encoding: 'utf-8',
      shell: '/bin/sh',
      env: buildEnv(configDir, merged),
      ...(merged.timeout ? { timeout: merged.timeout } : {}),
    });
  }

  /**
   * Run a CLI command expecting it to fail.
   * Returns the exit status and combined output instead of throwing.
   */
  function runCLIExpectError(command: string, options: CLIRunOptions = {}): CLIErrorResult {
    const merged = mergeOptions(options);
    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        env: buildEnv(configDir, merged),
        ...(merged.timeout ? { timeout: merged.timeout } : {}),
      });
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  }

  /**
   * Run a CLI command with piped stdin using bash.
   */
  function runCLIWithStdin(command: string, stdin: string, options: CLIRunOptions = {}): CLIErrorResult {
    const merged = mergeOptions(options);
    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        input: stdin,
        env: buildEnv(configDir, merged),
        ...(merged.timeout ? { timeout: merged.timeout } : {}),
      });
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  }

  return { runCLI, runCLIAll, runCLIExpectError, runCLIWithStdin };
}

export function makeNodeRunCLI(configDir: string, defaultOptions: CLIRunOptions = {}) {
  const cliPath = CLI_PATH;

  function mergeOptions(options: CLIRunOptions): CLIRunOptions {
    return { ...defaultOptions, ...options, env: { ...defaultOptions.env, ...options.env } };
  }

  function runCLI(args: string, options: CLIRunOptions = {}): string {
    const merged = mergeOptions(options);
    return execSync(`node ${cliPath} ${args}`, {
      encoding: 'utf-8',
      env: buildEnv(configDir, merged),
      ...(merged.timeout ? { timeout: merged.timeout } : {}),
    });
  }

  function runCLIAll(args: string, options: CLIRunOptions = {}): string {
    const merged = mergeOptions(options);
    return execSync(`node ${cliPath} ${args} 2>&1`, {
      encoding: 'utf-8',
      shell: '/bin/sh',
      env: buildEnv(configDir, merged),
      ...(merged.timeout ? { timeout: merged.timeout } : {}),
    });
  }

  function runCLIExpectError(args: string, options: CLIRunOptions = {}): CLIErrorResult {
    const merged = mergeOptions(options);
    try {
      const output = execSync(`node ${cliPath} ${args}`, {
        encoding: 'utf-8',
        env: buildEnv(configDir, merged),
        ...(merged.timeout ? { timeout: merged.timeout } : {}),
      });
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  }

  function runCLIPipe(stdin: string, args: string, options: CLIRunOptions = {}): string {
    const merged = mergeOptions(options);
    return execSync(`node ${cliPath} ${args}`, {
      encoding: 'utf-8',
      input: stdin,
      env: buildEnv(configDir, merged),
      ...(merged.timeout ? { timeout: merged.timeout } : {}),
    });
  }

  function runCLIWithStdin(args: string, stdin: string, options: CLIRunOptions = {}): CLIErrorResult {
    const merged = mergeOptions(options);
    try {
      const output = execSync(`node ${cliPath} ${args}`, {
        encoding: 'utf-8',
        input: stdin,
        env: buildEnv(configDir, merged),
        ...(merged.timeout ? { timeout: merged.timeout } : {}),
      });
      return { status: 0, output };
    } catch (error: any) {
      return {
        status: error.status || 1,
        output: error.stderr?.toString() || error.stdout?.toString() || '',
      };
    }
  }

  return { runCLI, runCLIAll, runCLIExpectError, runCLIPipe, runCLIWithStdin };
}
