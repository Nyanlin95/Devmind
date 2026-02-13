import type { Command } from 'commander';
import { registerDatabaseCommands } from './register-database.js';
import { registerMemoryCommands } from './register-memory.js';
import { registerInteractiveCommand } from './register-interactive.js';

export function registerAllCommands(program: Command): void {
  registerDatabaseCommands(program);
  registerMemoryCommands(program);
  registerInteractiveCommand(program);
}
