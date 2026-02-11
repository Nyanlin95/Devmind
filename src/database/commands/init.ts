/**
 * Init Command
 * Initialize DevMind Database in a project
 */

import * as path from 'path';
import { logger, ensureDir, writeJSON } from '../../core/index.js';

interface InitOptions {
  url?: string;
  dir?: string;
}

export async function init(options: InitOptions): Promise<void> {
  const outputDir = options.dir || '.devmind';
  logger.info(`Initializing DevMind Database...`);
  logger.info(`   Output directory: ${outputDir}`);

  // Create output directory
  const fullPath = path.resolve(outputDir);
  await ensureDir(fullPath);

  // Create config file
  const config = {
    databaseUrl: options.url || process.env.DATABASE_URL || '',
    outputDir,
    schema: 'public',
    format: 'markdown',
  };

  await writeJSON(path.join(fullPath, 'devmind.config.json'), config);

  logger.success(`Initialized!`);
  logger.success(`Created: ${path.join(fullPath, 'devmind.config.json')}`);
  logger.info(`Next steps:`);
  logger.info(`   1. Run 'devmind generate' to create context files`);
  logger.info(`   2. Or 'devmind generate --url "postgresql://..." if URL not set`);
}
