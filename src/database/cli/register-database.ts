import type { Command } from 'commander';
import { withCliErrorHandling } from '../../core/index.js';
import { generate } from '../commands/generate.js';
import { init } from '../commands/init.js';
import { validate } from '../commands/validate.js';
import { watch } from '../commands/watch.js';

export function registerDatabaseCommands(program: Command): void {
  program
    .command('init')
    .description('Initialize SchemaWise in your project')
    .option('-u, --url <url>', 'Database connection URL')
    .option('-d, --dir <dir>', 'Output directory', '.devmind')
    .action(withCliErrorHandling('init', init));

  program
    .command('generate')
    .description('Generate context from database or ORM schema')
    .option('-u, --url <url>', 'Database connection URL')
    .option('--orm <orm>', 'ORM type (prisma, drizzle)')
    .option('--mysql', 'Use MySQL extractor')
    .option('--sqlite <path>', 'Use SQLite extractor with file path')
    .option('--prisma [path]', 'Use Prisma extractor (optional path)')
    .option('--drizzle [path]', 'Use Drizzle extractor (optional path)')
    .option('--mongodb <url>', 'Use MongoDB extractor with connection URL')
    .option('--firebase-project <id>', 'Use Firebase extractor with project ID')
    .option('--firebase-key <path>', 'Path to Firebase service account JSON key')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--format <format>', 'Output format (markdown, json)', 'markdown')
    .option('--json', 'Output as JSON')
    .action(withCliErrorHandling('generate', generate));

  program
    .command('validate')
    .description('Validate generated context against database')
    .option('--strict', 'Fail on any mismatches')
    .action(withCliErrorHandling('validate', validate));

  program
    .command('watch')
    .description('Watch for schema changes and regenerate')
    .option('-d, --debounce <ms>', 'Debounce time in ms', '2000')
    .action(withCliErrorHandling('watch', watch));

  program
    .command('show')
    .description('Show current database schema')
    .option('-f, --format <format>', 'Output format', 'markdown')
    .action(
      withCliErrorHandling('show', async (options) => {
        const { show } = await import('../commands/show.js');
        await show(options);
      }),
    );
}
