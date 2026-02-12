/**
 * Generate Command
 * Generates CLAUDE.md and AGENTS.md from database schema
 */

import * as path from 'path';
import { logger, ensureDir, writeFileSafe, readFileSafe, handleError } from '../../core/index.js';
import {
  createExtractor,
  ExtractorType,
  UnifiedSchemaConverter,
  UnifiedSchemaInfo,
} from '../extractors/index.js';
import { TemplateGenerator } from '../generators/templates.js';
import { LearningGenerator } from '../generators/learning-generator.js';
import { MemoryInfrastructure } from './memory.js';
import { jsonSuccess, jsonError, outputJson, isJsonMode } from '../utils/json-output.js';
import * as fs from 'fs'; // Keep fs for existsSync checks
import { fileURLToPath } from 'url';
import { ensureWorkspaceAgentsBootstrap } from '../../generators/unified.js';
import { runAutosave } from '../../commands/autosave.js';

interface GenerateOptions {
  url?: string;
  orm?: string;
  output?: string;
  format?: 'markdown' | 'json';
  schema?: string;
  mysql?: boolean;
  sqlite?: string;
  prisma?: string;
  drizzle?: string;
  mongodb?: string;
  firebaseKey?: string;
  firebaseProject?: string;
  json?: boolean;
}

function resolveTemplatesDir(): string {
  const commandDir = path.dirname(fileURLToPath(import.meta.url));
  const packagedPath = path.resolve(commandDir, '..', 'templates');
  const sourcePath = path.resolve(commandDir, '..', '..', 'database', 'templates');

  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }
  return sourcePath;
}

/**
 * Get previous schema hash from evolution file
 */
async function getPreviousSchemaHash(outputDir: string): Promise<string | null> {
  try {
    const evolutionPath = path.join(outputDir, 'memory', 'schema-evolution.md');
    const content = await readFileSafe(evolutionPath);
    const match = content.match(/Schema Hash:\*\* `([a-f0-9]+)`/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

/**
 * Log schema drift to evolution file
 */
async function logSchemaDrift(
  outputDir: string,
  schema: UnifiedSchemaInfo,
  previousHash: string,
  currentHash: string,
): Promise<void> {
  const evolutionPath = path.join(outputDir, 'memory', 'schema-evolution.md');
  const timestamp = new Date().toISOString().split('T')[0];

  const driftEntry = `\n## ${timestamp} - Schema Change\n\n**Previous Hash:** \`${previousHash}\`  \n**New Hash:** \`${currentHash}\`  \n**Tables:** ${schema.tables.length}\n\n### Changes Detected\n- Schema hash changed\n- Review table changes manually\n\n---\n`;

  try {
    const existing = await readFileSafe(evolutionPath);
    await writeFileSafe(evolutionPath, existing + driftEntry);
  } catch (error) {
    // File might not exist yet
    await writeFileSafe(evolutionPath, driftEntry);
  }
}

export async function generate(options: GenerateOptions): Promise<void> {
  try {
    const isJson = isJsonMode(options);
    const outputDir = options.output || '.devmind';
    const schemaName = options.schema || 'public';

    if (!isJson) {
      logger.info(`Generating database context...`);
      logger.info(`   Output directory: ${outputDir}`);
    }

    let extractorType: ExtractorType = 'postgresql';
    let connectionString = options.url || process.env.DATABASE_URL || '';
    let schemaPath: string | undefined;

    // Determine extractor type
    if (options.mysql) {
      extractorType = 'mysql';
      if (!connectionString) {
        throw new Error('MySQL connection URL required. Use --url or DATABASE_URL env var.');
      }
    } else if (options.sqlite) {
      extractorType = 'sqlite';
      connectionString = options.sqlite || '';
    } else if (options.prisma) {
      extractorType = 'prisma';
      schemaPath = typeof options.prisma === 'string' ? options.prisma : 'prisma/schema.prisma';
      connectionString = 'dummy'; // Not used for Prisma
    } else if (options.drizzle) {
      extractorType = 'drizzle';
      schemaPath = typeof options.drizzle === 'string' ? options.drizzle : 'src/db/schema.ts';
      connectionString = 'dummy'; // Not used for Drizzle
    } else if (options.orm === 'prisma') {
      extractorType = 'prisma';
      schemaPath = 'prisma/schema.prisma';
      connectionString = 'dummy';
    } else if (options.orm === 'drizzle') {
      extractorType = 'drizzle';
      schemaPath = 'src/db/schema.ts';
      connectionString = 'dummy';
    } else if (connectionString) {
      if (connectionString.startsWith('mysql')) {
        extractorType = 'mysql';
      } else if (
        connectionString.startsWith('file:') ||
        connectionString.endsWith('.db') ||
        connectionString.endsWith('.sqlite')
      ) {
        extractorType = 'sqlite';
      } else {
        extractorType = 'postgresql';
      }
    } else {
      // Try to auto-detect
      if (fs.existsSync('prisma/schema.prisma')) {
        if (!isJson) logger.info('Detected Prisma schema, using Prisma extractor...');
        extractorType = 'prisma';
        schemaPath = 'prisma/schema.prisma';
        connectionString = 'dummy';
      } else if (fs.existsSync('drizzle.config.ts') || fs.existsSync('src/db/schema.ts')) {
        if (!isJson) logger.info('Detected Drizzle project, using Drizzle extractor...');
        extractorType = 'drizzle';
        schemaPath = 'src/db/schema.ts';
        connectionString = 'dummy';
      } else if (
        options.mongodb ||
        (connectionString &&
          (connectionString.startsWith('mongodb://') ||
            connectionString.startsWith('mongodb+srv://')))
      ) {
        if (!isJson) logger.info('Detected MongoDB connection...');
        extractorType = 'mongodb';
        connectionString = options.mongodb || connectionString;
        if (!connectionString) {
          throw new Error('MongoDB connection URL required. Use --url or DATABASE_URL env var.');
        }
      } else if (options.firebaseProject || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        if (!isJson) logger.info('Detected Firebase project...');
        extractorType = 'firebase';
        connectionString = 'dummy'; // Not used for Firebase
      } else {
        throw new Error(
          'Database connection not found. Use --url, --sqlite, --prisma, --drizzle, or --mongodb.',
        );
      }
    }

    if (!isJson) {
      logger.info(`Using extractor: ${extractorType}`);
      if (schemaPath) logger.info(`   Schema path: ${schemaPath}`);
    }

    const extractor = await createExtractor(extractorType, connectionString, {
      schemaPath,
      projectId: options.firebaseProject,
      serviceAccountPath: options.firebaseKey,
    });
    let unifiedSchema: UnifiedSchemaInfo;

    try {
      const rawSchema = await extractor.extract();
      rawSchema.databaseType = extractorType;
      rawSchema.schemaName = rawSchema.schemaName || schemaName;
      rawSchema.source = rawSchema.source || schemaPath || connectionString;

      // Convert to unified format using generic convert
      unifiedSchema = UnifiedSchemaConverter.convert(rawSchema);

      // Add source info
      unifiedSchema.source = schemaPath || connectionString.replace(/:[^:]*@/, ':***@'); // Hide password
    } finally {
      if (extractor.close) {
        await extractor.close();
      }
    }

    // Generate and save templates
    if (!isJson) logger.info('Generating context files...');
    const templatesDir = resolveTemplatesDir();
    const generator = new TemplateGenerator(templatesDir, outputDir);
    await generator.save(outputDir, unifiedSchema);
    await ensureWorkspaceAgentsBootstrap(outputDir);

    // Save raw schema JSON for analysis
    await writeFileSafe(
      path.join(outputDir, 'schema.json'),
      JSON.stringify(unifiedSchema, null, 2),
    );

    // Detect schema drift
    const memory = new MemoryInfrastructure();
    const currentHash = memory.calculateSchemaHash(unifiedSchema);
    const previousHash = await getPreviousSchemaHash(outputDir);

    if (previousHash && previousHash !== currentHash) {
      if (!isJson) {
        logger.warn('Schema drift detected!');
        logger.warn(`   Previous hash: ${previousHash}`);
        logger.warn(`   Current hash: ${currentHash}`);
      }
      await logSchemaDrift(outputDir, unifiedSchema, previousHash, currentHash);
    }

    // Create memory infrastructure
    if (!isJson) logger.info('Creating AI memory infrastructure...');
    await memory.createMemoryStructure(outputDir);
    await memory.initializeMemoryFiles(outputDir, unifiedSchema);
    await memory.copyTemplateFiles(templatesDir, outputDir);

    // Generate learnings from schema
    if (!isJson) logger.info('Analyzing schema patterns...');
    const learningGen = new LearningGenerator();
    const patterns = learningGen.generateLearnings(unifiedSchema);
    const learningsMarkdown = learningGen.formatLearnings(patterns);

    const businessLogicPath = path.join(outputDir, 'context', 'BUSINESS_LOGIC.md');
    await writeFileSafe(businessLogicPath, learningsMarkdown);

    if (!isJson) logger.info(`   Detected ${patterns.length} business patterns`);

    // JSON output mode
    if (isJsonMode(options)) {
      outputJson(
        jsonSuccess({
          schema: {
            tables: unifiedSchema.tables.length,
            databaseType: unifiedSchema.databaseType,
            schemaName: unifiedSchema.schemaName,
          },
          patterns: patterns.map((p) => ({
            type: p.type,
            confidence: p.confidence,
            tables: p.tables?.length || 0,
            recommendation: p.recommendation,
          })),
          files: {
            claude_md: `${outputDir}/CLAUDE.md`,
            agents_md: `${outputDir}/AGENTS.md`,
            business_logic: `${outputDir}/context/BUSINESS_LOGIC.md`,
            session_context: `${outputDir}/context/SESSION_CONTEXT.json`,
            memory_dir: `${outputDir}/memory/`,
          },
          memory: {
            checkpoints_enabled: true,
            learnings_enabled: true,
            drift_detection: previousHash !== null,
          },
        }),
      );
      return;
    }

    // Human-readable output
    logger.success('Generation complete!');
    logger.info(`   Tables: ${unifiedSchema.tables.length}`);
    logger.info(`   Patterns: ${patterns.length}`);
    logger.info(`   Output: ${path.resolve(outputDir)}`);
    logger.info('Generated files:');
    logger.info(`   - ${outputDir}/CLAUDE.md`);
    logger.info(`   - ${outputDir}/AGENTS.md`);
    logger.info(`   - ${outputDir}/queries/`);
    logger.info(`   - ${outputDir}/context/BUSINESS_LOGIC.md`);
    logger.info(`   - ${outputDir}/context/SESSION_CONTEXT.json`);
    logger.info(`   - ${outputDir}/memory/ (learnings, checkpoints, history)`);

    logger.info('AI Memory Layer:');
    logger.success('   ✓ Business patterns detected');
    logger.success('   ✓ Session context initialized');
    logger.success('   ✓ Checkpoint system ready');
    logger.info('Next steps:');
    logger.info('   1. Review detected patterns in context/BUSINESS_LOGIC.md');
    logger.info('   2. Your AI now has persistent memory across sessions');
    logger.info('   3. Read AGENTS.md and index.json at session start');
    logger.info('   4. Run `devmind status` to verify context freshness');
    logger.info('   5. Commit to version control');

    await runAutosave({
      output: outputDir,
      path: '.',
      source: 'database-generate',
      note: 'Completed database context generation',
      silent: true,
    });
  } catch (error) {
    if (isJsonMode(options)) {
      outputJson(jsonError(error as Error));
      process.exit(1);
    } else {
      handleError(error as Error);
    }
  }
}
