import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock logger before import
jest.unstable_mockModule('../../src/core/logger.js', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const persistCompactedToolOutput = jest.fn();
jest.unstable_mockModule('../../src/core/tool-output.js', () => ({
  persistCompactedToolOutput,
}));

let handleError: typeof import('../../src/core/errors.js').handleError;
let wrapAsync: typeof import('../../src/core/errors.js').wrapAsync;
let DevMindError: typeof import('../../src/core/errors.js').DevMindError;
let DatabaseError: typeof import('../../src/core/errors.js').DatabaseError;
let withCliErrorHandling: typeof import('../../src/core/errors.js').withCliErrorHandling;
let logger: typeof import('../../src/core/logger.js').logger;

describe('Errors', () => {
  let consoleErrorSpy: any;
  let consoleLogSpy: any;

  beforeEach(async () => {
    ({ handleError, wrapAsync, DevMindError, DatabaseError, withCliErrorHandling } =
      await import('../../src/core/errors.js'));
    ({ logger } = await import('../../src/core/logger.js'));

    process.exitCode = undefined;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
  });

  it('should handle known DevMindError', () => {
    const err = new DevMindError('oops');

    expect(() => handleError(err)).toThrow('oops');

    expect(logger.error).toHaveBeenCalledWith('oops');
  });

  it('should handle unexpected errors', () => {
    const err = new Error('boom');

    expect(() => handleError(err)).toThrow('boom');

    expect(logger.error).toHaveBeenCalledWith('Unexpected error: boom');
  });

  it('should print stack trace if verbose is true', () => {
    const err = new Error('boom');
    err.stack = 'stack trace';

    expect(() => handleError(err, true)).toThrow('boom');

    expect(consoleErrorSpy).toHaveBeenCalledWith('stack trace');
  });

  it('should wrap async functions and catch errors', async () => {
    const fn = async () => {
      throw new DatabaseError('db failed');
    };
    const wrapped = wrapAsync(fn);

    await expect(wrapped()).rejects.toThrow('db failed');
    expect(logger.error).toHaveBeenCalledWith('db failed');
  });

  it('should return result from wrapped function if no error', async () => {
    const fn = async () => 'success';
    const wrapped = wrapAsync(fn);

    await expect(wrapped()).resolves.toBe('success');
  });

  it('should output JSON error for wrapped CLI command when json option is true', async () => {
    const wrapped = withCliErrorHandling('test-cmd', async (..._args: any[]) => {
      throw new Error('json failure');
    });

    await wrapped('arg', { json: true } as any);

    expect(process.exitCode).toBe(1);
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('json failure');
    expect(payload.command).toBe('test-cmd');
    expect(persistCompactedToolOutput).toHaveBeenCalledTimes(1);
  });

  it('should log human-readable failure for wrapped CLI command when json option is false', async () => {
    const wrapped = withCliErrorHandling('test-cmd', async (..._args: any[]) => {
      throw new Error('human failure');
    });

    await wrapped('arg', { json: false } as any);

    expect(process.exitCode).toBe(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Command "test-cmd" failed');
    expect(logger.error).toHaveBeenCalledWith('human failure');
    expect(persistCompactedToolOutput).toHaveBeenCalledTimes(1);
  });

  it('should forward output dir to compacted tool output persistence', async () => {
    const wrapped = withCliErrorHandling('test-cmd', async (..._args: any[]) => {
      throw new Error('dir failure');
    });

    await wrapped('arg', { json: false, output: 'custom-output' } as any);

    expect(persistCompactedToolOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        outputDir: 'custom-output',
        command: 'test-cmd',
        stage: 'error',
      }),
    );
  });
});
