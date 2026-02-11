/**
 * Logger utilities using chalk for colored output
 */

import chalk from 'chalk';

export class Logger {
  constructor(private verbose: boolean = false) {}

  error(message: string, error?: Error): void {
    console.error(chalk.red(`✗ ${message}`));
    if (this.verbose && error) {
      console.error(chalk.gray(error.stack || error.message));
    }
  }

  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  info(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
  }

  warn(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  log(message: string): void {
    console.log(message);
  }
}

// Default logger instance
export const logger = new Logger();

// Create logger with verbose mode
export function createLogger(verbose: boolean = false): Logger {
  return new Logger(verbose);
}
