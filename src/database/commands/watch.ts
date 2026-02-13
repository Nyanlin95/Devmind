/**
 * Watch Command
 * Watch for schema changes and regenerate context
 */

import * as fs from 'fs';
import * as path from 'path';
import { generate } from './generate.js';
import { logger } from '../../core/index.js';

interface WatchOptions {
  debounce?: string;
}

export async function watch(options: WatchOptions): Promise<void> {
  const debounce = parseInt(options.debounce || '2000', 10);

  logger.info('Watch mode enabled...');
  logger.info(`   Debounce: ${debounce}ms`);

  // Detect schema files to watch
  const watchPaths: string[] = [];

  if (fs.existsSync('prisma/schema.prisma')) {
    watchPaths.push('prisma/schema.prisma');
    logger.info('   Watching: prisma/schema.prisma');
  }

  if (fs.existsSync('src/db/schema.ts')) {
    watchPaths.push('src/db/schema.ts');
    logger.info('   Watching: src/db/schema.ts');
  }

  if (fs.existsSync('drizzle.config.ts')) {
    watchPaths.push('drizzle.config.ts');
    logger.info('   Watching: drizzle.config.ts');
  }

  if (watchPaths.length === 0) {
    logger.warn('No schema files detected.');
    logger.info('   Looking for:');
    logger.info('   - prisma/schema.prisma');
    logger.info('   - src/db/schema.ts');
    logger.info('   - drizzle.config.ts');
    return;
  }

  logger.info('');
  logger.info('Watching for changes... (Press Ctrl+C to stop)');

  let debounceTimer: NodeJS.Timeout | null = null;
  let generating = false;

  const regenerate = async () => {
    if (generating) return;

    generating = true;
    logger.info(`Schema change detected, regenerating...`);

    try {
      await generate({ throwOnError: true });
      logger.success('Regeneration complete');
    } catch (error) {
      logger.error('Regeneration failed:', error as Error);
    } finally {
      generating = false;
    }
  };

  const handleChange = (filename: string) => {
    logger.info(`Change detected: ${filename}`);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(regenerate, debounce);
  };

  // Watch each file
  const watchers = watchPaths.map((filePath) => {
    return fs.watch(filePath, (eventType, filename) => {
      if (eventType === 'change') {
        handleChange(filePath);
      }
    });
  });

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('');
    logger.info('Stopping watch mode...');
    watchers.forEach((watcher) => watcher.close());
    process.exitCode = 0;
  });
}
