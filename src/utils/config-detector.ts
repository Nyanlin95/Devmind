import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../core/index.js';

export async function detectDatabaseConfig(rootPath: string): Promise<string | null> {
  // 1. Check .env file
  const envPath = path.join(rootPath, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^(?:DATABASE_URL|DB_URL|POSTGRES_URL|MYSQL_URL)=(.*)$/m);
    if (match && match[1]) {
      const url = match[1].trim().replace(/^["']|["']$/g, ''); // Remove quotes
      logger.info(`Detected database URL in .env: ${url.replace(/:[^:@]*@/, ':****@')}`); // Log masked
      return url;
    }
  }

  // 2. Check Prisma
  const prismaPath = path.join(rootPath, 'prisma', 'schema.prisma');
  if (fs.existsSync(prismaPath)) {
    const content = fs.readFileSync(prismaPath, 'utf-8');
    // Look for url = env("DATABASE_URL")
    const match = content.match(/url\s*=\s*env\("([^"]+)"\)/);
    if (match && match[1]) {
      // Found the env var name, now look for it in .env
      const envVarName = match[1];
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envMatch = envContent.match(new RegExp(`^${envVarName}=(.*)$`, 'm'));
        if (envMatch && envMatch[1]) {
          const url = envMatch[1].trim().replace(/^["']|["']$/g, '');
          logger.info(
            `Detected Prisma database URL (${envVarName}): ${url.replace(/:[^:@]*@/, ':****@')}`,
          );
          return url;
        }
      }
    }
  }

  // 3. Check Drizzle (drizzle.config.ts) - Harder to parse TS, but maybe simple regex
  // ... skipping for now as it usually requires executing the config

  return null;
}
