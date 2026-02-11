/**
 * Error handling helpers
 */
import { logger } from './logger.js';
export class DevMindError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = 'DevMindError';
  }
}
export class DatabaseError extends DevMindError {
  constructor(message) {
    super(message, 'DB_ERROR');
    this.name = 'DatabaseError';
  }
}
export class CodebaseError extends DevMindError {
  constructor(message) {
    super(message, 'CODEBASE_ERROR');
    this.name = 'CodebaseError';
  }
}
export class ConfigError extends DevMindError {
  constructor(message) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}
export function handleError(error, verbose = false) {
  if (error instanceof DevMindError) {
    logger.error(error.message);
  } else {
    logger.error(`Unexpected error: ${error.message}`);
  }
  if (verbose) {
    console.error(error.stack);
  }
  process.exit(1);
}
export function wrapAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}
//# sourceMappingURL=errors.js.map
