/**
 * Logger utilities using chalk for colored output
 */
export declare class Logger {
  private verbose;
  constructor(verbose?: boolean);
  error(message: string, error?: Error): void;
  success(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
  log(message: string): void;
}
export declare const logger: Logger;
export declare function createLogger(verbose?: boolean): Logger;
//# sourceMappingURL=logger.d.ts.map
