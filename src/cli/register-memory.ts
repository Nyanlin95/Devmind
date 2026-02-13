import type { Command } from 'commander';
import { handoff, checkpoint, learn, history } from '../database/index.js';
import { withCliErrorHandling } from '../core/index.js';

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
    .option('--category <category>', 'Learning category')
    .option('--top <n>', 'Limit listed learnings (with --list)')
    .option('--contains <text>', 'Filter listed learnings by substring match')
    .option('--since <iso-date>', 'Filter listed learnings since ISO timestamp')
    .option('--compact', 'Use compact JSON items in list mode')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--json', 'Output as JSON')
    .action(
      withCliErrorHandling('learn', async (learning, options) => {
        await learn(learning, options);
        if (!options.list && learning) {
          const { runAutosave } = await import('../commands/autosave.js');
          await runAutosave({
            output: options.output || '.devmind',
            path: '.',
            source: 'learn',
            note: `Added learning (${options.category || 'general'})`,
            silent: true,
          });
        }
      }),
    );

  program
    .command('history')
    .description('View session history')
    .option('--sessions', 'Show session history (default)')
    .option('--evolution', 'Show schema evolution')
    .option('--codebase-evolution', 'Show codebase evolution')
    .option('--unified', 'Show unified project timeline')
    .option('-o, --output <dir>', 'Output directory', '.devmind')
    .option('--json', 'Output as JSON')
    .action(withCliErrorHandling('history', history));
}
