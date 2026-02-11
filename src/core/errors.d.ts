/**
 * Error handling helpers
 */
export declare class DevMindError extends Error {
  code?: string | undefined;
  constructor(message: string, code?: string | undefined);
}
export declare class DatabaseError extends DevMindError {
  constructor(message: string);
}
export declare class CodebaseError extends DevMindError {
  constructor(message: string);
}
export declare class ConfigError extends DevMindError {
  constructor(message: string);
}
export declare function handleError(error: Error, verbose?: boolean): never;
export declare function wrapAsync<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R>;
//# sourceMappingURL=errors.d.ts.map
