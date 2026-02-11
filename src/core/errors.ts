/**
 * Error handling helpers
 */

import { logger } from './logger.js';

export class DevMindError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'DevMindError';
  }
}

export class DatabaseError extends DevMindError {
  constructor(message: string) {
    super(message, 'DB_ERROR');
    this.name = 'DatabaseError';
  }
}

export class CodebaseError extends DevMindError {
  constructor(message: string) {
    super(message, 'CODEBASE_ERROR');
    this.name = 'CodebaseError';
  }
}

export class ConfigError extends DevMindError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export function handleError(error: Error, verbose: boolean = false): never {
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

export function wrapAsync<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error as Error);
    }
  };
}
