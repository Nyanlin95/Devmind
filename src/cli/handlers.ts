import * as path from 'path';
import { logger, ensureDir, writeJSON, createProfiler, failCommand } from '../core/index.js';
import { generate as generateDatabase, MemoryInfrastructure } from '../database/index.js';
import {
  scanCodebase,
  saveScanResult,
  calculateCodebaseHash,
  getCodebaseStats,
} from '../codebase/index.js';
import { generateUnifiedDocs } from '../generators/unified.js';

async function updateCodebaseMemory(
  outputDir: string,
  structure: unknown,
  profiler: ReturnType<typeof createProfiler>,
) {
  try {
    const memory = new MemoryInfrastructure();
    const codebaseHash = calculateCodebaseHash(structure as never);
    const codebaseStats = getCodebaseStats(structure as never);

    await profiler.section('memory.updateSessionContext', async () =>
      memory.updateSessionContext(outputDir, {
        codebaseHash,
        codebaseStats,
      }),
    );
    logger.info('Updated session context with codebase stats');

    await profiler.section('memory.updateCodebaseEvolution', async () =>
      memory.updateCodebaseEvolution(outputDir, codebaseHash, codebaseStats),
    );
  } catch (error) {
    logger.warn(`Failed to update session context: ${(error as Error).message}`);
  }
}

export async function runGenerateCommand(options: Record<string, unknown>): Promise<void> {
  try {
    const profiler = createProfiler(!!options.profile);
    const { loadConfig } = await import('../utils/config-loader.js');
    const { detectDatabaseConfig } = await import('../utils/config-detector.js');

    let savedConfig = await profiler.section('config.load', async () => loadConfig(process.cwd()));
    const mergedOptions = { ...savedConfig, ...options } as Record<string, unknown>;

    let connectionString =
      (options.url as string | undefined) || process.env.DATABASE_URL || savedConfig.databaseUrl;
    let configModified = false;

    if (
      !connectionString &&
      (options.db === true || options.all === true || (!options.code && !options.db))
    ) {
      const detectedUrl = await profiler.section('config.detect', async () =>
        detectDatabaseConfig(process.cwd()),
      );
      if (detectedUrl) {
        logger.info(`Auto-detected database URL: ${detectedUrl.replace(/:[^:@]*@/, ':****@')}`);
        connectionString = detectedUrl;
        savedConfig = { ...savedConfig, databaseUrl: detectedUrl };
        configModified = true;
      }
    }

    if (connectionString) {
      mergedOptions.url = connectionString;
    }

    if (configModified) {
      const configPath = path.join(process.cwd(), '.devmind', 'devmind.config.json');
      await profiler.section('config.persist', async () => {
        await ensureDir(path.dirname(configPath));
        await writeJSON(configPath, savedConfig);
      });
      logger.info(`Saved configuration to ${configPath}`);
    }

    const outputDir = (mergedOptions.output as string) || '.devmind';
    const runAll = mergedOptions.all === true;
    const runCode = mergedOptions.code === true || runAll;
    const runDb = mergedOptions.db === true || runAll || (!runCode && mergedOptions.db !== true);

    if (runDb) {
      logger.info('Starting Database Generation...');
      const dbOutputDir = path.join(outputDir, 'database');
      await profiler.section('db.ensureDir', async () => ensureDir(dbOutputDir));
      await profiler.section('db.generate', async () =>
        generateDatabase({ ...mergedOptions, output: dbOutputDir }),
      );
    }

    if (runCode) {
      logger.info('Starting Codebase Generation...');
      const rootPath = path.resolve((mergedOptions.path as string) || '.');
      const codebaseOutputDir = path.join(outputDir, 'codebase');
      await profiler.section('code.ensureDir', async () => ensureDir(codebaseOutputDir));
      const result = await profiler.section('code.scan', async () =>
        scanCodebase(rootPath, codebaseOutputDir),
      );
      await profiler.section('code.save', async () => saveScanResult(result, codebaseOutputDir));

      await updateCodebaseMemory(outputDir, result.structure, profiler);
      await profiler.section('docs.unified', async () => generateUnifiedDocs(outputDir));
      logger.success('Codebase context generated!');
    }

    if (runAll) {
      logger.success('Unified Generation Complete!');
      logger.info(`Context available in ${outputDir}`);
      logger.info('Session startup context:');
      logger.info(`   1. Read ${outputDir}/AGENTS.md`);
      logger.info(`   2. Read ${outputDir}/index.json`);
      logger.info('Tip: run `devmind status` to verify freshness.');
    }

    const { runAutosave } = await import('../commands/autosave.js');
    await profiler.section('autosave.run', async () =>
      runAutosave({
        output: outputDir,
        path: (mergedOptions.path as string) || '.',
        source: 'generate',
        note: runAll ? 'Completed unified generation' : 'Completed generation',
        silent: true,
      }),
    );

    const profile = profiler.report();
    if (profile) {
      logger.info('Performance Profile');
      logger.info(`Total: ${profile.totalMs.toFixed(1)}ms`);
      for (const step of profile.steps) {
        logger.info(`- ${step.name}: ${step.ms.toFixed(1)}ms`);
      }
    }
  } catch (error) {
    failCommand('Generation failed', error);
  }
}

export async function runScanCommand(options: Record<string, unknown>): Promise<void> {
  try {
    const profiler = createProfiler(!!options.profile);
    const rootPath = path.resolve((options.path as string) || '.');
    const outputDir = (options.output as string) || '.devmind';

    logger.info(`Scanning codebase: ${rootPath}`);
    const codebaseOutputDir = path.join(outputDir, 'codebase');
    await profiler.section('code.ensureDir', async () => ensureDir(codebaseOutputDir));
    const result = await profiler.section('code.scan', async () =>
      scanCodebase(rootPath, codebaseOutputDir),
    );
    await profiler.section('code.save', async () => saveScanResult(result, codebaseOutputDir));

    await updateCodebaseMemory(outputDir, result.structure, profiler);
    await profiler.section('docs.unified', async () => generateUnifiedDocs(outputDir));

    logger.success('Scan complete!');
    logger.info('Session startup context:');
    logger.info(`   1. Read ${outputDir}/AGENTS.md`);
    logger.info(`   2. Read ${outputDir}/index.json`);
    logger.info('Tip: run `devmind status` to verify freshness.');

    const { runAutosave } = await import('../commands/autosave.js');
    await profiler.section('autosave.run', async () =>
      runAutosave({
        output: outputDir,
        path: (options.path as string) || '.',
        source: 'scan',
        note: 'Completed codebase scan',
        silent: true,
      }),
    );

    const profile = profiler.report();
    if (profile) {
      logger.info('Performance Profile');
      logger.info(`Total: ${profile.totalMs.toFixed(1)}ms`);
      for (const step of profile.steps) {
        logger.info(`- ${step.name}: ${step.ms.toFixed(1)}ms`);
      }
    }
  } catch (error) {
    failCommand('Failed to scan codebase', error);
  }
}
