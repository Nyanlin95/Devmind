import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock logger before import
jest.unstable_mockModule('../../src/core/logger.js', () => ({
  logger: {
    error: jest.fn(),
  },
}));

let handleError: typeof import('../../src/core/errors.js').handleError;
let wrapAsync: typeof import('../../src/core/errors.js').wrapAsync;
let DevMindError: typeof import('../../src/core/errors.js').DevMindError;
let DatabaseError: typeof import('../../src/core/errors.js').DatabaseError;
let logger: typeof import('../../src/core/logger.js').logger;

describe('Errors', () => {
  let processExitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    ({ handleError, wrapAsync, DevMindError, DatabaseError } =
      await import('../../src/core/errors.js'));
    ({ logger } = await import('../../src/core/logger.js'));

    processExitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null | undefined) => {
        throw new Error(`Process.exit called with ${code}`);
      });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle known DevMindError', () => {
    const err = new DevMindError('oops');

    expect(() => handleError(err)).toThrow('Process.exit called with 1');

    expect(logger.error).toHaveBeenCalledWith('oops');
  });

  it('should handle unexpected errors', () => {
    const err = new Error('boom');

    expect(() => handleError(err)).toThrow('Process.exit called with 1');

    expect(logger.error).toHaveBeenCalledWith('Unexpected error: boom');
  });

  it('should print stack trace if verbose is true', () => {
    const err = new Error('boom');
    err.stack = 'stack trace';

    expect(() => handleError(err, true)).toThrow('Process.exit called with 1');

    expect(consoleErrorSpy).toHaveBeenCalledWith('stack trace');
  });

  it('should wrap async functions and catch errors', async () => {
    const fn = async () => {
      throw new DatabaseError('db failed');
    };
    const wrapped = wrapAsync(fn);

    await expect(wrapped()).rejects.toThrow('Process.exit called with 1');
    expect(logger.error).toHaveBeenCalledWith('db failed');
  });

  it('should return result from wrapped function if no error', async () => {
    const fn = async () => 'success';
    const wrapped = wrapAsync(fn);

    await expect(wrapped()).resolves.toBe('success');
  });
});
