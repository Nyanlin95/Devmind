/**
 * Configuration loading and management
 */

import * as path from 'path';
import { fileExists, readJSON } from './fileio.js';
import { ConfigError } from './errors.js';

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

const DEFAULT_CONFIG: DevMindConfig = {
  outputDir: '.devmind',
  codebase: {
    ignore: ['node_modules', 'dist', '.git', 'coverage'],
    maxDepth: 10,
  },
};

export async function loadConfig(configPath?: string): Promise<DevMindConfig> {
  const paths = [
    configPath,
    '.devmindrc.json',
    '.cohererc.json', // Backward compatibility
    'devmind.config.json',
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (await fileExists(p)) {
      try {
        const config = await readJSON<DevMindConfig>(p);
        return { ...DEFAULT_CONFIG, ...config };
      } catch (error) {
        throw new ConfigError(`Invalid config file: ${p}`);
      }
    }
  }

  return DEFAULT_CONFIG;
}

export function getOutputDir(config: DevMindConfig): string {
  return config.outputDir || DEFAULT_CONFIG.outputDir!;
}

export function resolveOutputPath(config: DevMindConfig, ...parts: string[]): string {
  return path.join(process.cwd(), getOutputDir(config), ...parts);
}
