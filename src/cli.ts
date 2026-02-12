#!/usr/bin/env node

/**
 * DevMind CLI
 * Unified tool for database and codebase analysis
 */

import { Command } from 'commander';
import {
  init,
  generate as generateDatabase,
  validate,
  watch,
  show,
  handoff,
  checkpoint,
  learn,
  history,
  MemoryInfrastructure,
  SessionContext,
} from './database/index.js';
import { generateUnifiedDocs } from './generators/unified.js';
import {
  scanCodebase,
  saveScanResult,
  calculateCodebaseHash,
  getCodebaseStats,
} from './codebase/index.js';
import { logger, ensureDir, writeJSON } from './core/index.js';
import * as path from 'path';

const program = new Command();

program
  .name('devmind')
  .description('Unified developer assistant for database and codebase context')
  .version('1.0.1');

// Database Commands
program
  .command('init')
  .description('Initialize DevMind in your project')
  .option('-u, --url <url>', 'Database connection URL')
  .option('-d, --dir <dir>', 'Output directory', '.devmind')
  .action(init);

program
  .command('generate')
  .description('Generate context from database and/or codebase')
  .option('-u, --url <url>', 'Database connection URL')
  .option('--orm <orm>', 'ORM type (prisma, drizzle)')
  .option('--mysql', 'Use MySQL extractor')
  .option('--sqlite <path>', 'Use SQLite extractor with file path')
  .option('--prisma [path]', 'Use Prisma extractor (optional path)')
  .option('--drizzle [path]', 'Use Drizzle extractor (optional path)')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--format <format>', 'Output format (markdown, json)', 'markdown')
  .option('--all', 'Generate all contexts (database and codebase)')
  .option('--code', 'Generate codebase context only')
  .option('--db', 'Generate database context only (default)')
  .option('-p, --path <path>', 'Path to scan (for codebase)', '.')
  .action(async (options) => {
    try {
      // Smart Config Loading & Detection
      const { loadConfig } = await import('./utils/config-loader.js');
      const { detectDatabaseConfig } = await import('./utils/config-detector.js');

      let savedConfig = await loadConfig(process.cwd());

      // Merge options: CLI flags > Saved Config > Auto Detection
      const mergedOptions = { ...savedConfig, ...options };

      // Prioritize explicit URL > Env > Saved > Detected
      let connectionString = options.url || process.env.DATABASE_URL || savedConfig.databaseUrl;
      let configModified = false;

      if (!connectionString && (options.db || options.all || (!options.code && !options.db))) {
        const detectedUrl = await detectDatabaseConfig(process.cwd());
        if (detectedUrl) {
          logger.info(`Auto-detected database URL: ${detectedUrl.replace(/:[^:@]*@/, ':****@')}`);
          connectionString = detectedUrl;

          // Save for future runs
          savedConfig = { ...savedConfig, databaseUrl: detectedUrl };
          configModified = true;
        }
      }

      // Apply merged connection string
      if (connectionString) {
        mergedOptions.url = connectionString;
      }

      if (configModified) {
        const configPath = path.join(process.cwd(), '.devmind', 'devmind.config.json');
        await ensureDir(path.dirname(configPath));
        await writeJSON(configPath, savedConfig);
        logger.info(`Saved configuration to ${configPath}`);
      }

      const runAll = mergedOptions.all;
      const runCode = mergedOptions.code || runAll;
      const runDb = mergedOptions.db || runAll || (!runCode && !mergedOptions.db);

      if (runDb) {
        logger.info('Starting Database Generation...');
        const dbOutputDir = path.join(mergedOptions.output || '.devmind', 'database');
        await ensureDir(dbOutputDir);
        const dbOptions = { ...mergedOptions, output: dbOutputDir };
        await generateDatabase(dbOptions);
      }

      if (runCode) {
        logger.info('Starting Codebase Generation...');
        const rootPath = path.resolve(mergedOptions.path || '.');
        const outputDir = mergedOptions.output || '.devmind';

        const codebaseOutputDir = path.join(outputDir, 'codebase');
        await ensureDir(codebaseOutputDir);
        const result = await scanCodebase(rootPath, codebaseOutputDir);
        await saveScanResult(result, codebaseOutputDir);

        // Update memory with codebase stats
        try {
          const memory = new MemoryInfrastructure();
          const codebaseHash = calculateCodebaseHash(result.structure);
          const codebaseStats = getCodebaseStats(result.structure);

          await memory.updateSessionContext(outputDir, {
            codebaseHash,
            codebaseStats,
          });
          logger.info('Updated session context with codebase stats');

          await memory.updateCodebaseEvolution(outputDir, codebaseHash, codebaseStats);
        } catch (error) {
          logger.warn(`Failed to update session context: ${(error as Error).message}`);
        }

        // Generate unified docs
        await generateUnifiedDocs(outputDir);

        logger.success('Codebase context generated!');
      }

      if (runAll) {
        logger.success('Unified Generation Complete!');
        logger.info(`Context available in ${mergedOptions.output || '.devmind'}`);
      }
    } catch (error) {
      logger.error('Generation failed', error as Error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate generated context against database')
  .option('--strict', 'Fail on any mismatches')
  .action(validate);

program
  .command('watch')
  .description('Watch for database schema changes')
  .option('-d, --debounce <ms>', 'Debounce time in ms', '2000')
  .action(watch);

program
  .command('show')
  .description('Show current database schema')
  .option('-f, --format <format>', 'Output format', 'markdown')
  .action(show);

// Memory Commands
program
  .command('handoff')
  .description('Multi-agent handoff management')
  .option('--record', 'Record current session state')
  .option('--resume <id>', 'Resume from previous session')
  .option('--list', 'List available sessions')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--status <status>', 'Session status', 'in_progress')
  .option('--agentId <id>', 'Agent identifier')
  .action(handoff);

program
  .command('checkpoint')
  .description('Save or restore session checkpoint')
  .option('--restore', 'Restore latest checkpoint')
  .option('--list', 'List all checkpoints')
  .option('-m, --message <message>', 'Checkpoint message')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(checkpoint);

program
  .command('learn [learning]')
  .description('Add a learning to accumulated knowledge')
  .option('--list', 'List all learnings')
  .option('--category <category>', 'Learning category')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(learn);

program
  .command('history')
  .description('View session history')
  .option('--sessions', 'Show session history (default)')
  .option('--evolution', 'Show schema evolution')
  .option('--codebase-evolution', 'Show codebase evolution')
  .option('--unified', 'Show unified project timeline')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(history);

// Analysis Commands
program
  .command('analyze')
  .description('Analyze code-to-database usage')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('-p, --path <path>', 'Codebase path to scan', '.')
  .action(async (options) => {
    const { analyze } = await import('./commands/analyze.js');
    await analyze(options);
  });

// Codebase Commands
program
  .command('scan')
  .description('Scan codebase and generate context')
  .option('-p, --path <path>', 'Path to scan', '.')
  .option('-o, --output <dir>', 'Output directory', '.devmind')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const rootPath = path.resolve(options.path || '.');
      const outputDir = options.output || '.devmind';

      logger.info(`Scanning codebase: ${rootPath}`);
      const codebaseOutputDir = path.join(outputDir, 'codebase');
      // Ensure directory is created by saveScanResult but we might need it for scanCodebase if it writes logs?
      // scanCodebase doesn't write files, saveScanResult does.
      await ensureDir(codebaseOutputDir);
      const result = await scanCodebase(rootPath, codebaseOutputDir);
      await saveScanResult(result, codebaseOutputDir);

      // Update memory with codebase stats
      try {
        const memory = new MemoryInfrastructure();
        const codebaseHash = calculateCodebaseHash(result.structure);
        const codebaseStats = getCodebaseStats(result.structure);

        await memory.updateSessionContext(outputDir, {
          codebaseHash,
          codebaseStats,
        });
        logger.info('Updated session context with codebase stats');

        await memory.updateCodebaseEvolution(outputDir, codebaseHash, codebaseStats);
      } catch (error) {
        logger.warn(`Failed to update session context: ${(error as Error).message}`);
      }

      // Generate unified docs (CLAUDE.md, etc.)
      await generateUnifiedDocs(outputDir);

      logger.success('Scan complete!');
    } catch (error) {
      logger.error('Failed to scan codebase', error as Error);
      process.exit(1);
    }
  });

program
  .command('context')
  .description('Get focused context for a specific part of the codebase')
  .option('--focus <path>', 'Path to focus on')
  .option('--query <string>', 'Search query')
  .action(async (options) => {
    const { context } = await import('./commands/context.js');
    await context(options);
  });

program.parse();
