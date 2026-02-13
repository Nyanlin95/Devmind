import type { Command } from 'commander';
import { withCliErrorHandling } from '../core/index.js';
import { runScanCommand } from './handlers.js';

export function registerCodebaseCommands(program: Command): void {
  program
    .command('scan')
    .description('Scan codebase and generate context')
    .option('-p, --path <path>', 'Path to scan', '.')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--json', 'Output as JSON')
    .option('--profile', 'Print command phase timings')
    .action(withCliErrorHandling('scan', runScanCommand));

  program
    .command('context')
    .description('Get focused context for a specific part of the codebase')
    .option('--focus <path>', 'Path to focus on')
    .option('--query <string>', 'Search query')
    .action(
      withCliErrorHandling('context', async (options) => {
        const { context } = await import('../commands/context.js');
        await context(options);
      }),
    );
}
