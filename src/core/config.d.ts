/**
 * Configuration loading and management
 */
export interface DevMindConfig {
  outputDir?: string;
  databases?: Record<string, string>;
  codebase?: {
    ignore?: string[];
    maxDepth?: number;
    include?: string[];
    exclude?: string[];
  };
  watch?: {
    enabled?: boolean;
    paths?: string[];
  };
}
export declare function loadConfig(configPath?: string): Promise<DevMindConfig>;
export declare function getOutputDir(config: DevMindConfig): string;
export declare function resolveOutputPath(config: DevMindConfig, ...parts: string[]): string;
//# sourceMappingURL=config.d.ts.map
