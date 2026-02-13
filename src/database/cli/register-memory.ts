import type { Command } from 'commander';
import { withCliErrorHandling } from '../../core/index.js';
import { handoff } from '../commands/handoff.js';
import { checkpoint } from '../commands/checkpoint.js';
import { learn } from '../commands/learn.js';
import { history } from '../commands/history.js';

export function registerMemoryCommands(program: Command): void {
  program
    .command('handoff')
    .description('Multi-agent handoff management')
    .option('--record', 'Record current session state')
    .option('--resume <id>', 'Resume from previous session')
    .option('--list', 'List available sessions')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--status <status>', 'Session status', 'in_progress')
    .option('--agentId <id>', 'Agent identifier')
    .action(withCliErrorHandling('handoff', handoff));

  program
    .command('checkpoint')
    .description('Save or restore session checkpoint')
    .option('--restore', 'Restore latest checkpoint')
    .option('--list', 'List all checkpoints')
    .option('-m, --message <message>', 'Checkpoint message')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--json', 'Output as JSON')
    .action(withCliErrorHandling('checkpoint', checkpoint));

  program
    .command('learn [learning]')
    .description('Add a learning to accumulated knowledge')
    .option('--list', 'List all learnings')
    .option('--category <category>', 'Learning category (e.g., performance, security)')
    .option('--top <n>', 'Limit listed learnings (with --list)')
    .option('--contains <text>', 'Filter listed learnings by substring match')
    .option('--since <iso-date>', 'Filter listed learnings since ISO timestamp')
    .option('--compact', 'Use compact JSON items in list mode')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--json', 'Output as JSON')
    .action(withCliErrorHandling('learn', learn));

  program
    .command('history')
    .description('View session history and schema evolution')
    .option('--sessions', 'Show session history (default)')
    .option('--evolution', 'Show schema evolution')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--json', 'Output as JSON')
    .action(withCliErrorHandling('history', history));
}
