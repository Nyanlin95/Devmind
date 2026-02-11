import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock core logger
jest.unstable_mockModule('../../src/core', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

let detectDatabaseConfig: typeof import('../../src/utils/config-detector.js').detectDatabaseConfig;
let loadConfig: typeof import('../../src/utils/config-loader.js').loadConfig;

describe('CLI Utilities', () => {
  let tempDir: string;

  beforeAll(async () => {
    ({ detectDatabaseConfig } = await import('../../src/utils/config-detector.js'));
    ({ loadConfig } = await import('../../src/utils/config-loader.js'));
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'devmind-cli-'));
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('ConfigDetector', () => {
    it('should detect DATABASE_URL in .env', async () => {
      const projectDir = path.join(tempDir, 'env-proj');
      await fs.promises.mkdir(projectDir);
      await fs.promises.writeFile(
        path.join(projectDir, '.env'),
        'DATABASE_URL="postgres://user:pass@localhost:5432/db"',
      );

      const url = await detectDatabaseConfig(projectDir);
      expect(url).toBe('postgres://user:pass@localhost:5432/db');
    });

    it('should detect complex .env values', async () => {
      const projectDir = path.join(tempDir, 'env-complex');
      await fs.promises.mkdir(projectDir);
      await fs.promises.writeFile(
        path.join(projectDir, '.env'),
        "POSTGRES_URL='postgres://user:p@ss#word@host:5432/db?ssl=true'",
      );

      const url = await detectDatabaseConfig(projectDir);
      expect(url).toBe('postgres://user:p@ss#word@host:5432/db?ssl=true');
    });

    it('should return null if no .env', async () => {
      const projectDir = path.join(tempDir, 'empty');
      await fs.promises.mkdir(projectDir);
      const url = await detectDatabaseConfig(projectDir);
      expect(url).toBeNull();
    });

    it('should detect Prisma env var mapping', async () => {
      const projectDir = path.join(tempDir, 'prisma-proj');
      await fs.promises.mkdir(projectDir);
      await fs.promises.mkdir(path.join(projectDir, 'prisma'));

      await fs.promises.writeFile(path.join(projectDir, '.env'), 'MY_DB_URL="sqlite://file.db"');
      await fs.promises.writeFile(
        path.join(projectDir, 'prisma', 'schema.prisma'),
        `
                 datasource db {
                   provider = "sqlite"
                   url      = env("MY_DB_URL")
                 }
             `,
      );

      const url = await detectDatabaseConfig(projectDir);
      expect(url).toBe('sqlite://file.db');
    });
  });

  describe('ConfigLoader', () => {
    it('should load config from .devmind/devmind.config.json', async () => {
      const projectDir = path.join(tempDir, 'config-proj');
      await fs.promises.mkdir(projectDir);
      const configDir = path.join(projectDir, '.devmind');
      await fs.promises.mkdir(configDir);

      const configData = { databaseUrl: 'postgres://localhost/mydb', outputDir: 'custom-out' };
      await fs.promises.writeFile(
        path.join(configDir, 'devmind.config.json'),
        JSON.stringify(configData),
      );

      const config = await loadConfig(projectDir);
      expect(config.databaseUrl).toBe('postgres://localhost/mydb');
      expect(config.outputDir).toBe('custom-out');
    });

    it('should return empty object if config missing', async () => {
      const projectDir = path.join(tempDir, 'no-config');
      await fs.promises.mkdir(projectDir);
      const config = await loadConfig(projectDir);
      expect(config).toEqual({});
    });

    it('should handle invalid JSON gracefully', async () => {
      const projectDir = path.join(tempDir, 'bad-json');
      await fs.promises.mkdir(projectDir);
      const configDir = path.join(projectDir, '.devmind');
      await fs.promises.mkdir(configDir);
      await fs.promises.writeFile(path.join(configDir, 'devmind.config.json'), '{ invalid json');

      const config = await loadConfig(projectDir);
      expect(config).toEqual({});
    });
  });
});
