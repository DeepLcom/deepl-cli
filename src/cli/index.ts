#!/usr/bin/env node

/**
 * DeepL CLI Entry Point
 * Main command-line interface
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ConfigService } from '../storage/config.js';
import { CacheService } from '../storage/cache.js';
import { DeepLClient } from '../api/deepl-client.js';
import { TranslationService } from '../services/translation.js';
import { AuthCommand } from './commands/auth.js';
import { TranslateCommand } from './commands/translate.js';
import { ConfigCommand as ConfigCmd } from './commands/config.js';
import { CacheCommand } from './commands/cache.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
const { version } = packageJson;

// Initialize services
const configService = new ConfigService();
const cacheService = new CacheService();

/**
 * Create DeepL client with API key from config or env
 */
function createDeepLClient(overrideBaseUrl?: string): DeepLClient {
  const apiKey = configService.getValue<string>('auth.apiKey');
  const envKey = process.env['DEEPL_API_KEY'];

  const key = apiKey ?? envKey;

  if (!key) {
    console.error(chalk.red('Error: API key not set'));
    console.error(chalk.yellow('Run: deepl auth set-key <your-api-key>'));
    process.exit(1);
  }

  // Get API configuration
  const baseUrl = overrideBaseUrl ?? configService.getValue<string>('api.baseUrl');
  const usePro = configService.getValue<boolean>('api.usePro');

  return new DeepLClient(key, { baseUrl, usePro });
}

// Create program
const program = new Command();

program
  .name('deepl')
  .description('DeepL CLI - Next-generation translation tool powered by DeepL API')
  .version(version);

// Auth command
const authCommand = new AuthCommand(configService);

program
  .command('auth')
  .description('Manage DeepL API authentication')
  .addCommand(
    new Command('set-key')
      .description('Set your DeepL API key')
      .argument('<api-key>', 'Your DeepL API key')
      .action(async (apiKey: string) => {
        try {
          await authCommand.setKey(apiKey);
          console.log(chalk.green('✓ API key saved and validated successfully'));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show current API key (masked)')
      .action(async () => {
        try {
          const key = await authCommand.getKey();
          if (key) {
            const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
            console.log(chalk.blue('API Key:'), masked);
          } else {
            console.log(chalk.yellow('No API key set'));
          }
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('clear')
      .description('Remove stored API key')
      .action(async () => {
        try {
          await authCommand.clearKey();
          console.log(chalk.green('✓ API key removed'));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

// Translate command
program
  .command('translate')
  .description('Translate text using DeepL API')
  .argument('[text]', 'Text to translate (or read from stdin)')
  .requiredOption('-t, --to <language>', 'Target language(s), comma-separated for multiple')
  .option('-f, --from <language>', 'Source language (auto-detect if not specified)')
  .option('--formality <level>', 'Formality level: default, more, less, prefer_more, prefer_less')
  .option('--preserve-code', 'Preserve code blocks and variables during translation')
  .option('--api-url <url>', 'Custom API endpoint (e.g., https://api-free.deepl.com/v2 or internal test URLs)')
  .action(async (text: string | undefined, options: {
    to: string;
    from?: string;
    formality?: string;
    preserveCode?: boolean;
    apiUrl?: string;
  }) => {
    try {
      const client = createDeepLClient();
      const translationService = new TranslationService(client, configService);
      const translateCommand = new TranslateCommand(translationService, configService);

      let result: string;

      if (text) {
        // Translate provided text
        result = await translateCommand.translateText(text, options);
      } else {
        // Read from stdin
        result = await translateCommand.translateFromStdin(options);
      }

      console.log(result);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Config command
const configCommand = new ConfigCmd(configService);

program
  .command('config')
  .description('Manage configuration')
  .addCommand(
    new Command('get')
      .description('Get configuration value')
      .argument('[key]', 'Config key (dot notation) or empty for all')
      .action(async (key?: string) => {
        try {
          const value = await configCommand.get(key);
          console.log(JSON.stringify(value, null, 2));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('set')
      .description('Set configuration value')
      .argument('<key>', 'Config key (dot notation)')
      .argument('<value>', 'Value to set')
      .action(async (key: string, value: string) => {
        try {
          await configCommand.set(key, value);
          console.log(chalk.green(`✓ Set ${key} = ${value}`));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all configuration values')
      .action(async () => {
        try {
          const config = await configCommand.list();
          console.log(JSON.stringify(config, null, 2));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset configuration to defaults')
      .action(async () => {
        try {
          await configCommand.reset();
          console.log(chalk.green('✓ Configuration reset to defaults'));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

// Cache command
const cacheCommand = new CacheCommand(cacheService);

program
  .command('cache')
  .description('Manage translation cache')
  .addCommand(
    new Command('stats')
      .description('Show cache statistics')
      .action(async () => {
        try {
          const stats = await cacheCommand.stats();
          const formatted = cacheCommand.formatStats(stats);
          console.log(formatted);
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('clear')
      .description('Clear all cached translations')
      .action(async () => {
        try {
          await cacheCommand.clear();
          console.log(chalk.green('✓ Cache cleared successfully'));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('enable')
      .description('Enable translation cache')
      .action(async () => {
        try {
          await cacheCommand.enable();
          console.log(chalk.green('✓ Cache enabled'));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('disable')
      .description('Disable translation cache')
      .action(async () => {
        try {
          await cacheCommand.disable();
          console.log(chalk.green('✓ Cache disabled'));
        } catch (error) {
          console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

// Parse arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
