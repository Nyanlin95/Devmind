import type { Command } from 'commander';
import inquirer from 'inquirer';
import { withCliErrorHandling } from '../../core/index.js';

export function registerInteractiveCommand(program: Command): void {
  program
    .command('interactive')
    .alias('i')
    .description('Interactive mode for quick operations')
    .action(
      withCliErrorHandling('interactive', async () => {
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
      }),
    );
}
