import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../core/index.js';

export interface DevMindConfig {
  databaseUrl?: string;
  outputDir?: string;
  schema?: string;
  format?: string;
  orm?: string;
  mysql?: boolean;
  sqlite?: string;
  prisma?: string;
  drizzle?: string;
  mongodb?: string;
  firebaseProject?: string;
  firebaseKey?: string;
  json?: boolean;
}

export async function loadConfig(rootPath: string): Promise<DevMindConfig> {
  const configPath = path.join(rootPath, '.devmind', 'devmind.config.json');

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      logger.debug(`Loaded config from ${configPath}`);
      return config;
    } catch (error) {
      logger.warn(`Failed to parse config file: ${configPath}`);
      return {};
    }
  }

  return {};
}
