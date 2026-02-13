import type { Command } from 'commander';
import { registerDatabaseCommands } from './register-database.js';
import { registerMemoryCommands } from './register-memory.js';
import { registerAnalysisCommands } from './register-analysis.js';
import { registerCodebaseCommands } from './register-codebase.js';

export function registerAllCommands(program: Command): void {
  registerDatabaseCommands(program);
  registerMemoryCommands(program);
  registerAnalysisCommands(program);
  registerCodebaseCommands(program);
}
