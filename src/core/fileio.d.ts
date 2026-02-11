/**
 * File I/O utilities with error handling
 */
export declare function ensureDir(dirPath: string): Promise<void>;
export declare function writeFileSafe(filePath: string, content: string): Promise<void>;
export declare function readFileSafe(filePath: string): Promise<string>;
export declare function fileExists(filePath: string): Promise<boolean>;
export declare function normalizePath(filePath: string): string;
export declare function writeJSON<T>(filePath: string, data: T): Promise<void>;
export declare function readJSON<T>(filePath: string): Promise<T>;
//# sourceMappingURL=fileio.d.ts.map
