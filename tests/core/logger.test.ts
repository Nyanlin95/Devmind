import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Logger } from '../../src/core/logger.js';
import chalk from 'chalk';

describe('Logger', () => {
  let logger: Logger;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    logger = new Logger(false);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log info messages in blue', () => {
    logger.info('test info');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test info'));
  });

  it('should log success messages in green', () => {
    logger.success('test success');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test success'));
  });

  it('should log warning messages in yellow', () => {
    logger.warn('test warn');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test warn'));
  });

  it('should log error messages in red', () => {
    logger.error('test error');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('test error'));
  });

  it('should not log debug messages if verbose is false', () => {
    logger.debug('test debug');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should log debug messages if verbose is true', () => {
    const verboseLogger = new Logger(true);
    verboseLogger.debug('test debug');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test debug'));
  });

  it('should log stack trace if verbose is true and error provided', () => {
    const verboseLogger = new Logger(true);
    const error = new Error('oops');
    verboseLogger.error('failed', error);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('oops'));
  });
});
