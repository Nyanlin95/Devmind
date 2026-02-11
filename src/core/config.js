/**
 * Configuration loading and management
 */
import * as path from 'path';
import { fileExists, readJSON } from './fileio.js';
import { ConfigError } from './errors.js';
const DEFAULT_CONFIG = {
  outputDir: '.devmind',
  codebase: {
    ignore: ['node_modules', 'dist', '.git', 'coverage'],
    maxDepth: 10,
  },
};
export async function loadConfig(configPath) {
  const paths = [
    configPath,
    '.devmindrc.json',
    '.cohererc.json', // Backward compatibility
    'devmind.config.json',
  ].filter(Boolean);
  for (const p of paths) {
    if (await fileExists(p)) {
      try {
        const config = await readJSON(p);
        return { ...DEFAULT_CONFIG, ...config };
      } catch (error) {
        throw new ConfigError(`Invalid config file: ${p}`);
      }
    }
  }
  return DEFAULT_CONFIG;
}
export function getOutputDir(config) {
  return config.outputDir || DEFAULT_CONFIG.outputDir;
}
export function resolveOutputPath(config, ...parts) {
  return path.join(process.cwd(), getOutputDir(config), ...parts);
}
//# sourceMappingURL=config.js.map
