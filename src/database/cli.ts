#!/usr/bin/env node

/**
 * SchemaWise CLI
 *
 * Generate AI-friendly database context documentation and validate SQL queries.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { Command } from 'commander';
import inquirer from 'inquirer';
import { generate } from './commands/generate.js';
import { init } from './commands/init.js';
import { validate } from './commands/validate.js';
import { watch } from './commands/watch.js';
import { handoff } from './commands/handoff.js';
import { checkpoint } from './commands/checkpoint.js';
import { learn } from './commands/learn.js';
import { history } from './commands/history.js';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const version = pkg.version;

const program = new Command();

program
  .name('devmind-db')
  .description('Database schema documentation and SQL query validation for AI coding assistants')
  .version(version);

// Commands
program
  .command('init')
  .description('Initialize SchemaWise in your project')
  .option('-u, --url <url>', 'Database connection URL')
  .option('-d, --dir <dir>', 'Output directory', '.devmind')
  .action(init);

program
  .command('generate')
  .description('Generate context from database or ORM schema')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--orm <orm>', 'ORM type (prisma, drizzle)')
  .option('--mysql', 'Use MySQL extractor')
  .option('--sqlite <path>', 'Use SQLite extractor with file path')
  .option('--prisma [path]', 'Use Prisma extractor (optional path)')
  .option('--drizzle [path]', 'Use Drizzle extractor (optional path)')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--format <format>', 'Output format (markdown, json)', 'markdown')
  .action(generate);

program
  .command('validate')
  .description('Validate generated context against database')
  .option('--strict', 'Fail on any mismatches')
  .action(validate);

program
  .command('watch')
  .description('Watch for schema changes and regenerate')
  .option('-d, --debounce <ms>', 'Debounce time in ms', '2000')
  .action(watch);

program
  .command('show')
  .description('Show current database schema')
  .option('-f, --format <format>', 'Output format', 'markdown')
  .action(async (options) => {
    const { show } = await import('./commands/show.js');
    await show(options);
  });

program
  .command('handoff')
  .description('Multi-agent handoff management')
  .option('--record', 'Record current session state')
  .option('--resume <id>', 'Resume from previous session')
  .option('--list', 'List available sessions')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--status <status>', 'Session status', 'in_progress')
  .option('--agentId <id>', 'Agent identifier')
  .action(handoff);

program
  .command('checkpoint')
  .description('Save or restore session checkpoint')
  .option('--restore', 'Restore latest checkpoint')
  .option('--list', 'List all checkpoints')
  .option('-m, --message <message>', 'Checkpoint message')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(checkpoint);

program
  .command('learn [learning]')
  .description('Add a learning to accumulated knowledge')
  .option('--list', 'List all learnings')
  .option('--category <category>', 'Learning category (e.g., performance, security)')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(learn);

program
  .command('history')
  .description('View session history and schema evolution')
  .option('--sessions', 'Show session history (default)')
  .option('--evolution', 'Show schema evolution')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(history);

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Interactive mode for quick operations')
  .action(async () => {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Generate context from database', value: 'generate' },
          { name: 'Validate existing context', value: 'validate' },
          { name: 'Watch for changes', value: 'watch' },
          { name: 'Show schema', value: 'show' },
        ],
      },
    ]);

    const command = program.commands.find((c) => c.name() === action);
    if (command) {
      const argv = [process.argv[0], program.name(), action];
      await command.parseAsync(argv);
    }
  });

// Parse arguments
program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
