/**
 * Error handling helpers
 */

import { logger } from './logger.js';
import { persistCompactedToolOutput } from './tool-output.js';

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

  throw error;
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

export function failCommand(message: string, error?: unknown, exitCode: number = 1): void {
  logger.error(message);
  if (error) {
    if (error instanceof Error) {
      logger.error(error.message);
    } else {
      logger.error(String(error));
    }
  }
  process.exitCode = exitCode;
}

function extractJsonMode(args: unknown[]): boolean {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    const candidate = args[i];
    if (!candidate || typeof candidate !== 'object') continue;
    const maybe = candidate as { json?: unknown };
    if (typeof maybe.json === 'boolean') {
      return maybe.json === true;
    }
  }
  return false;
}

function emitCliJsonError(command: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.log(
    JSON.stringify(
      {
        success: false,
        error: message,
        command,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function extractOutputDir(args: unknown[]): string {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    const candidate = args[i];
    if (!candidate || typeof candidate !== 'object') continue;
    const maybe = candidate as { output?: unknown; dir?: unknown };
    if (typeof maybe.output === 'string' && maybe.output.trim()) return maybe.output;
    if (typeof maybe.dir === 'string' && maybe.dir.trim()) return maybe.dir;
  }
  return '.devmind';
}

function errorToText(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack || '';
    return [error.message, stack].filter(Boolean).join('\n');
  }
  return String(error);
}

export function withCliErrorHandling<TArgs extends unknown[]>(
  command: string,
  handler: (...args: TArgs) => Promise<void> | void,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    try {
      await handler(...args);
    } catch (error) {
      try {
        await persistCompactedToolOutput({
          outputDir: extractOutputDir(args),
          command,
          stage: 'error',
          rawText: errorToText(error),
        });
      } catch {
        // Avoid masking original command failure.
      }
      if (extractJsonMode(args)) {
        emitCliJsonError(command, error);
        process.exitCode = 1;
        return;
      }
      failCommand(`Command "${command}" failed`, error);
    }
  };
}
