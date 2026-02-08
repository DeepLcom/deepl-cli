#!/usr/bin/env node

/**
 * DeepL CLI Entry Point
 * Main command-line interface
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, isAbsolute, extname } from 'path';
import { ConfigService } from '../storage/config.js';
import type { CacheService } from '../storage/cache.js';
import type { DeepLClient } from '../api/deepl-client.js';
import { Logger } from '../utils/logger.js';
import { DeepLCLIError } from '../utils/errors.js';
import { ExitCode, getExitCodeFromError } from '../utils/exit-codes.js';
import { isSymlink } from '../utils/safe-read-file.js';
import { registerAuth } from './commands/register-auth.js';
import { registerUsage } from './commands/register-usage.js';
import { registerLanguages } from './commands/register-languages.js';
import { registerTranslate } from './commands/register-translate.js';
import { registerWatch } from './commands/register-watch.js';
import { registerWrite } from './commands/register-write.js';
import { registerConfig } from './commands/register-config.js';
import { registerCache } from './commands/register-cache.js';
import { registerGlossary } from './commands/register-glossary.js';
import { registerHooks } from './commands/register-hooks.js';
import { registerStyleRules } from './commands/register-style-rules.js';
import { registerAdmin } from './commands/register-admin.js';
import { registerCompletion } from './commands/register-completion.js';
import { registerVoice } from './commands/register-voice.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
const { version } = packageJson;

// Initialize services
// Support custom config directory for testing via DEEPL_CONFIG_DIR env var
const defaultConfigPath = process.env['DEEPL_CONFIG_DIR']
  ? join(process.env['DEEPL_CONFIG_DIR'], 'config.json')
  : undefined;

// Create config service - can be overridden by --config flag
let configService = new ConfigService(defaultConfigPath);
let cacheService: CacheService | null = null;

async function getCacheService(): Promise<CacheService> {
  if (!cacheService) {
    const { CacheService: CacheSvc } = await import('../storage/cache.js');
    cacheService = CacheSvc.getInstance();
  }
  return cacheService;
}

/**
 * Handle error and exit with appropriate exit code
 */
function handleError(error: unknown): never {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const exitCode = error instanceof Error ? getExitCodeFromError(error) : ExitCode.GeneralError;

  Logger.error(chalk.red('Error:'), errorMessage);

  if (error instanceof DeepLCLIError && error.suggestion) {
    Logger.error(chalk.yellow('Suggestion:'), error.suggestion);
  }

  process.exit(exitCode);
}

/**
 * Create DeepL client with API key from config or env
 */
async function createDeepLClient(overrideBaseUrl?: string): Promise<DeepLClient> {
  const apiKey = configService.getValue<string>('auth.apiKey');
  const envKey = process.env['DEEPL_API_KEY'];

  const key = apiKey ?? envKey;

  if (!key) {
    Logger.error(chalk.red('Error: API key not set'));
    Logger.warn(chalk.yellow('Run: deepl auth set-key <your-api-key>'));
    process.exit(ExitCode.AuthError);
  }

  const baseUrl = overrideBaseUrl ?? configService.getValue<string>('api.baseUrl');
  const usePro = configService.getValue<boolean>('api.usePro');

  if (baseUrl) {
    const { validateApiUrl } = await import('../utils/validate-url.js');
    validateApiUrl(baseUrl);
  }

  const { DeepLClient: Client } = await import('../api/deepl-client.js');
  return new Client(key, { baseUrl, usePro });
}

// Create program
const program = new Command();
program.showSuggestionAfterError(true);

program
  .name('deepl')
  .description('DeepL CLI - Next-generation translation tool powered by DeepL API')
  .version(version)
  .option('-q, --quiet', 'Suppress all non-essential output (errors and results only)')
  .option('-v, --verbose', 'Show extra information (source language, timing, cache status)')
  .option('-c, --config <file>', 'Use alternate configuration file')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();

    // Handle --config flag - reinitialize config service with custom path
    // SECURITY: Validate path to prevent traversal attacks
    if (options['config']) {
      const customConfigPath = options['config'] as string;

      // Resolve to absolute path (handles both relative and absolute paths)
      // resolve() automatically normalizes and resolves '..' sequences safely
      const safePath = isAbsolute(customConfigPath)
        ? resolve(customConfigPath)
        : resolve(process.cwd(), customConfigPath);

      // SECURITY: Require .json extension to prevent overwriting arbitrary files
      if (extname(safePath).toLowerCase() !== '.json') {
        Logger.error(chalk.red('Error: --config path must have a .json extension'));
        process.exit(ExitCode.InvalidInput);
      }

      // SECURITY: Reject symlinks to prevent path traversal
      if (isSymlink(safePath)) {
        Logger.error(chalk.red('Error: --config path must not be a symlink'));
        process.exit(ExitCode.InvalidInput);
      }

      configService = new ConfigService(safePath);
    }

    // Set quiet mode before any command runs
    if (options['quiet']) {
      Logger.setQuiet(true);
    }

    // Set verbose mode: --verbose flag takes precedence over config
    if (options['verbose']) {
      Logger.setVerbose(true);
    } else {
      const configVerbose = configService.getValue<boolean>('output.verbose');
      if (configVerbose === true) {
        Logger.setVerbose(true);
      }
    }

    // Disable colors if output.color is false in config
    const colorEnabled = configService.getValue<boolean>('output.color');
    if (colorEnabled === false) {
      chalk.level = 0;
    }
  });

/**
 * Get raw API key and client options without constructing a client.
 * Used by VoiceClient which needs direct access to create its own client.
 */
function getApiKeyAndOptions(): { apiKey: string; options: import('../api/http-client.js').DeepLClientOptions } {
  const apiKey = configService.getValue<string>('auth.apiKey');
  const envKey = process.env['DEEPL_API_KEY'];
  const key = apiKey ?? envKey;

  if (!key) {
    Logger.error(chalk.red('Error: API key not set'));
    Logger.warn(chalk.yellow('Run: deepl auth set-key <your-api-key>'));
    process.exit(ExitCode.AuthError);
  }

  const baseUrl = configService.getValue<string>('api.baseUrl');
  const usePro = configService.getValue<boolean>('api.usePro');

  return { apiKey: key, options: { baseUrl, usePro } };
}

// Shared dependencies passed to register functions
// Use a getter for configService because the preAction hook may reassign it
const deps = {
  getConfigService: () => configService,
  getCacheService,
  createDeepLClient,
  getApiKeyAndOptions,
  handleError,
};

// Register all command groups, organized by help category
program.commandsGroup('Core Commands:');
registerTranslate(program, deps);
registerWrite(program, deps);
registerVoice(program, deps);

program.commandsGroup('Resources:');
registerGlossary(program, deps);

program.commandsGroup('Workflow:');
registerWatch(program, deps);
registerHooks(program, deps);

program.commandsGroup('Configuration:');
registerAuth(program, deps);
registerConfig(program, deps);
registerCache(program, deps);
registerStyleRules(program, deps);

program.commandsGroup('Information:');
registerUsage(program, deps);
registerLanguages(program, deps);
registerCompletion(program, deps);

program.commandsGroup('Administration:');
registerAdmin(program, deps);

// Parse arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
