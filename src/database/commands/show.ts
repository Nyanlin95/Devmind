/**
 * Show Command
 * Show current database schema in a readable format
 */

import * as fs from 'fs';
import * as path from 'path';
import { createExtractor, ExtractorType, UnifiedSchemaConverter } from '../extractors/index.js';
import { logger, readFileSafe, fileExists } from '../../core/index.js';

interface ShowOptions {
  format?: string;
}

export async function show(options: ShowOptions): Promise<void> {
  const format = options.format || 'markdown';

  logger.info('Loading database schema...');

  // Try to load from existing .devmind directory first
  let outputDir = '.devmind';
  if (
    !(await fileExists(path.join(outputDir, 'CLAUDE.md'))) &&
    (await fileExists('.ai/CLAUDE.md'))
  ) {
    outputDir = '.ai';
  }

  const claudeFile = path.join(outputDir, 'CLAUDE.md');

  if (await fileExists(claudeFile)) {
    logger.info(`Found existing context in ${outputDir} directory`);
    const content = await readFileSafe(claudeFile);

    // Extract and display just the schema section
    const schemaMatch = content.match(/## Database Schema([\s\S]*?)(?=\n##|$)/);
    if (schemaMatch) {
      logger.info('## Database Schema');
      console.log(schemaMatch[1].trim());
    } else {
      console.log(content);
    }
    return;
  }

  // If no existing context, try to generate from config
  const configPath = path.join(outputDir, 'devmind.config.json');
  const legacyConfigPath = path.join(outputDir, 'cohere-config.json');
  const legacyRootConfigPath = 'cohere-config.json';

  let activeConfigPath = configPath;
  if (await fileExists(legacyConfigPath)) activeConfigPath = legacyConfigPath;
  else if (await fileExists(legacyRootConfigPath)) activeConfigPath = legacyRootConfigPath;

  if (!(await fileExists(activeConfigPath))) {
    logger.warn('No schema found.');
    logger.info('Run one of the following:');
    logger.info('  1. devmind init --url "your-database-url"');
    logger.info('  2. devmind generate');
    logger.info('  3. devmind generate --prisma');
    logger.info('  4. devmind generate --drizzle');
    return;
  }

  // Load config and extract schema
  try {
    const config = JSON.parse(await readFileSafe(activeConfigPath));
    let extractorType: ExtractorType = 'postgresql';
    let connectionString = config.databaseUrl || process.env.DATABASE_URL;
    let schemaPath: string | undefined;

    // Auto-detect extractor type
    if (fs.existsSync('prisma/schema.prisma')) {
      extractorType = 'prisma';
      schemaPath = 'prisma/schema.prisma';
    } else if (fs.existsSync('src/db/schema.ts')) {
      extractorType = 'drizzle';
      schemaPath = 'src/db/schema.ts';
    } else if (
      connectionString &&
      (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://'))
    ) {
      extractorType = 'mongodb';
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      extractorType = 'firebase';
    } else if (connectionString) {
      if (connectionString.startsWith('mysql')) {
        extractorType = 'mysql';
      } else if (connectionString.includes('.db') || connectionString.includes('.sqlite')) {
        extractorType = 'sqlite';
      }
    }

    if (!connectionString && !schemaPath) {
      logger.warn('No database connection or schema file found.');
      logger.info('Run: devmind generate');
      return;
    }

    const extractor = await createExtractor(extractorType, connectionString || 'dummy', {
      schemaPath,
    });

    try {
      const rawSchema = await extractor.extract();
      const unifiedSchema = UnifiedSchemaConverter.convert(rawSchema);

      logger.info(`Database: ${unifiedSchema.databaseType || 'Unknown'}`);
      logger.info(`Tables: ${unifiedSchema.tables.length}`);

      logger.info('## Tables');

      for (const table of unifiedSchema.tables) {
        logger.info(`### ${table.name}`);
        if (table.description) {
          logger.info(`  ${table.description}`);
        }
        logger.info(`  Columns: ${table.columns.length}`);

        // Show primary keys
        const pkColumns = table.columns.filter((c) => c.isPrimaryKey);
        if (pkColumns.length > 0) {
          logger.info(`  Primary Key: ${pkColumns.map((c) => c.name).join(', ')}`);
        }

        // Show relations
        if (table.relations && table.relations.length > 0) {
          logger.info(`  Relations: ${table.relations.length}`);
        }

        logger.info('');
      }

      // Show relationships
      const relationships = unifiedSchema.tables.flatMap((t) =>
        (t.relations || []).map((rel) => ({
          from: rel.fromTable,
          to: rel.toTable,
          cardinality: rel.cardinality,
        })),
      );

      if (relationships.length > 0) {
        logger.info('## Relationships');
        for (const rel of relationships) {
          logger.info(`  ${rel.from} [${rel.cardinality}] ${rel.to}`);
        }
      }
    } finally {
      if (extractor.close) {
        await extractor.close();
      }
    }
  } catch (error) {
    logger.error('Failed to load schema:', error as Error);
    logger.info('Try running: devmind generate');
  }
}
