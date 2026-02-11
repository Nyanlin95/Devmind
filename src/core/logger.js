/**
 * Logger utilities using chalk for colored output
 */
import chalk from 'chalk';
export class Logger {
  verbose;
  constructor(verbose = false) {
    this.verbose = verbose;
  }
  error(message, error) {
    console.error(chalk.red(`✗ ${message}`));
    if (this.verbose && error) {
      console.error(chalk.gray(error.stack || error.message));
    }
  }
  success(message) {
    console.log(chalk.green(`✓ ${message}`));
  }
  info(message) {
    console.log(chalk.blue(`ℹ ${message}`));
  }
  warn(message) {
    console.log(chalk.yellow(`⚠ ${message}`));
  }
  debug(message) {
    if (this.verbose) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }
  log(message) {
    console.log(message);
  }
}
// Default logger instance
export const logger = new Logger();
// Create logger with verbose mode
export function createLogger(verbose = false) {
  return new Logger(verbose);
}
//# sourceMappingURL=logger.js.map
