import type { Command } from 'commander';
import { Logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { describeProgram } from './describe.js';

const SUPPORTED_FORMATS = ['json'] as const;
type DescribeFormat = (typeof SUPPORTED_FORMATS)[number];

export function registerDescribe(
  program: Command,
  deps: {
    handleError: (error: unknown) => never;
  },
): void {
  const { handleError } = deps;

  program
    .command('_describe', { hidden: true })
    .description('Emit CLI subcommand tree and flag vocabulary (operator tooling)')
    .option('--format <format>', `Output format (${SUPPORTED_FORMATS.join(', ')})`, 'json')
    .action((opts: { format?: string }) => {
      try {
        const format = (opts.format ?? 'json').toLowerCase().trim();
        if (!SUPPORTED_FORMATS.includes(format as DescribeFormat)) {
          throw new ValidationError(
            `Unsupported --format: "${opts.format ?? ''}". Supported: ${SUPPORTED_FORMATS.join(', ')}`,
          );
        }
        const tree = describeProgram(program);
        Logger.output(JSON.stringify(tree, null, 2));
      } catch (error) {
        handleError(error);
      }
    });
}
