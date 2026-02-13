/**
 * Validate Command
 * Validates generated context against database
 */

import * as path from 'path';
import { logger, readFileSafe, failCommand } from '../../core/index.js';
import {
  createExtractor,
  ExtractorType,
  UnifiedSchemaConverter,
  UnifiedSchemaInfo,
} from '../extractors/index.js';
import * as fs from 'fs'; // Keep fs for existsSync checks

interface ValidateOptions {
  strict?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

async function extractDocumentedTablesFromFile(filePath: string): Promise<Set<string>> {
  const tables = new Set<string>();
  const content = await readFileSafe(filePath);
  const tableMatches = content.matchAll(/###\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
  for (const match of tableMatches) {
    tables.add(match[1]);
  }
  return tables;
}

export async function validate(options: ValidateOptions): Promise<void> {
  logger.info('Validating database context...');
  if (options.strict) {
    logger.info('Strict mode: enabled');
  }

  const outputDir = '.devmind'; // In future use config
  const configPath = path.join(outputDir, 'devmind.config.json');
  // Fallback to legacy
  const legacyConfigPath = '.ai/cohere-config.json';

  let config: any;

  // Check if context exists
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(await readFileSafe(configPath));
    } catch (e) {
      logger.error('Failed to parse devmind.config.json');
      return;
    }
  } else if (fs.existsSync('cohere-config.json')) {
    try {
      config = JSON.parse(await readFileSafe('cohere-config.json'));
    } catch (e) {
      logger.error('Failed to parse cohere-config.json');
      return;
    }
  } else if (fs.existsSync(legacyConfigPath)) {
    try {
      config = JSON.parse(await readFileSafe(legacyConfigPath));
    } catch (e) {
      logger.error('Failed to parse legacy config');
      return;
    }
  } else {
    logger.error('No configuration found.');
    logger.info('Run: devmind init --url "your-database-url"');
    return;
  }

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  try {
    let extractorType: ExtractorType = 'postgresql';
    let connectionString = config.databaseUrl || process.env.DATABASE_URL;
    let schemaPath: string | undefined;

    // Auto-detect extractor type
    if (fs.existsSync('prisma/schema.prisma')) {
      extractorType = 'prisma';
      schemaPath = 'prisma/schema.prisma';
      logger.info('Detected: Prisma');
    } else if (fs.existsSync('src/db/schema.ts')) {
      extractorType = 'drizzle';
      schemaPath = 'src/db/schema.ts';
      logger.info('Detected: Drizzle');
    } else if (
      connectionString &&
      (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://'))
    ) {
      extractorType = 'mongodb';
      logger.info('Detected: MongoDB');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      extractorType = 'firebase';
      logger.info('Detected: Firebase');
    } else if (connectionString) {
      if (connectionString.startsWith('mysql')) {
        extractorType = 'mysql';
        logger.info('Detected: MySQL');
      } else if (connectionString.includes('.db') || connectionString.includes('.sqlite')) {
        extractorType = 'sqlite';
        logger.info('Detected: SQLite');
      } else {
        logger.info('Detected: PostgreSQL');
      }
    }

    if (!connectionString && !schemaPath) {
      logger.error('No database connection or schema file found.');
      logger.info('Run: devmind generate');
      return;
    }

    // Extract current schema
    logger.info('Extracting current schema...');

    // We need to handle the dummy connection string case if schemaPath is present
    const extractor = await createExtractor(extractorType, connectionString || 'dummy', {
      schemaPath,
      projectId: config.firebaseProject,
      serviceAccountPath: config.firebaseKey,
    });

    let currentSchema: UnifiedSchemaInfo;
    try {
      const rawSchema = await extractor.extract();
      currentSchema = UnifiedSchemaConverter.convert(rawSchema);
    } finally {
      if (extractor.close) {
        await extractor.close();
      }
    }

    logger.info(`   Tables found: ${currentSchema.tables.length}`);

    // Check if generated context files exist
    const claudeFile = path.join(config.outputDir || outputDir, 'CLAUDE.md');
    const agentsFile = path.join(config.outputDir || outputDir, 'AGENTS.md');

    if (!fs.existsSync(claudeFile) && !fs.existsSync(agentsFile)) {
      result.valid = false;
      result.errors.push('Generated context files not found');
      logger.error('No generated context files found in output directory');
      logger.info('Run: devmind generate');
      return;
    }

    // Parse generated context to extract table names
    logger.info('Parsing generated context...');
    const generatedTables = new Set<string>();

    if (fs.existsSync(claudeFile)) {
      const claudeTables = await extractDocumentedTablesFromFile(claudeFile);
      claudeTables.forEach((table) => generatedTables.add(table));
    }

    if (fs.existsSync(agentsFile)) {
      const agentsTables = await extractDocumentedTablesFromFile(agentsFile);
      agentsTables.forEach((table) => generatedTables.add(table));
    }

    logger.info(`   Tables documented: ${generatedTables.size}`);

    // Validate tables
    logger.info('Validating tables...');
    const currentTableNames = new Set(currentSchema.tables.map((t) => t.name));

    // Check for missing tables in generated context
    for (const table of currentSchema.tables) {
      if (!generatedTables.has(table.name)) {
        result.warnings.push(`Table '${table.name}' exists in schema but not in generated context`);
      }
    }

    // Check for extra tables in generated context
    for (const tableName of generatedTables) {
      if (!currentTableNames.has(tableName)) {
        result.warnings.push(`Table '${tableName}' in generated context but not in current schema`);
      }
    }

    // Validate column counts
    for (const table of currentSchema.tables) {
      if (generatedTables.has(table.name)) {
        const columnCount = table.columns.length;
        if (columnCount === 0) {
          result.warnings.push(`Table '${table.name}' has no columns`);
        }
      }
    }

    // Display results
    if (result.errors.length === 0 && result.warnings.length === 0) {
      logger.success('Validation passed!');
      logger.info('   All tables match between schema and generated context.');
    } else {
      if (result.errors.length > 0) {
        logger.error('Validation errors:');
        result.errors.forEach((err) => logger.error(`   - ${err}`));
      }

      if (result.warnings.length > 0) {
        logger.warn('Validation warnings:');
        result.warnings.forEach((warn) => logger.warn(`   - ${warn}`));
      }

      if (result.warnings.length > 0 && result.errors.length === 0) {
        logger.info('Recommendation: Run "devmind generate" to update context');
      }

      if (options.strict && (result.errors.length > 0 || result.warnings.length > 0)) {
        logger.error('Validation failed in strict mode');
        process.exitCode = 1;
        return;
      }
    }

    // Summary
    logger.info('Summary:');
    logger.info(`   Current tables: ${currentSchema.tables.length}`);
    logger.info(`   Documented tables: ${generatedTables.size}`);
    logger.info(`   Errors: ${result.errors.length}`);
    logger.info(`   Warnings: ${result.warnings.length}`);
  } catch (error) {
    if (options.strict) {
      failCommand('Validation failed:', error);
      return;
    }
    logger.error('Validation failed:', error as Error);
  }
}
