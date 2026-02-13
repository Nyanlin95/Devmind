import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { logger, readFileSafe, createProfiler, getSourceFilesWithCache } from '../core/index.js';

interface StatusOptions {
  output?: string;
  path?: string;
  json?: boolean;
  profile?: boolean;
}

interface ContextStatus {
  outputDir: string;
  rootPath: string;
  files: {
    agents: boolean;
    index: boolean;
    schema: boolean;
    overview: boolean;
  };
  lastGeneratedAt: string | null;
  stale: boolean;
  sourceLastModifiedAt: string | null;
  sourceListCacheHit: boolean;
  recommendedCommand: string;
}

function latestMtimeMs(paths: string[]): number | null {
  let latest: number | null = null;
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    const mtime = fs.statSync(filePath).mtimeMs;
    if (latest === null || mtime > latest) {
      latest = mtime;
    }
  }
  return latest;
}

async function getSourceLastModifiedMs(
  outputDir: string,
  rootPath: string,
  newerThanMs?: number,
): Promise<{ latest: number | null; sourceListCacheHit: boolean }> {
  const sourceList = await getSourceFilesWithCache({
    outputDir,
    rootPath,
    includeGlob: '**/*.{ts,tsx,js,jsx,py,go,java,rb,php,rs}',
    ignore: ['node_modules/**', '.git/**', '.devmind/**', 'dist/**', 'build/**'],
  });
  const files = sourceList.files;

  if (files.length === 0) return { latest: null, sourceListCacheHit: sourceList.cacheHit };

  const maxConcurrency = 64;
  const batches: string[][] = [];
  for (let i = 0; i < files.length; i += maxConcurrency) {
    batches.push(files.slice(i, i + maxConcurrency));
  }

  let latest: number | null = null;
  for (const batch of batches) {
    const stats = await Promise.all(
      batch.map(async (relPath) => {
        try {
          const stat = await fsPromises.stat(path.join(rootPath, relPath));
          return stat.mtimeMs;
        } catch {
          return null;
        }
      }),
    );
    let batchMax: number | null = null;
    for (const mtime of stats) {
      if (mtime === null) continue;
      if (batchMax === null || mtime > batchMax) batchMax = mtime;
      if (latest === null || mtime > latest) latest = mtime;
    }
    if (newerThanMs !== undefined && batchMax !== null && batchMax > newerThanMs) {
      return { latest: batchMax, sourceListCacheHit: sourceList.cacheHit };
    }
  }

  return { latest, sourceListCacheHit: sourceList.cacheHit };
}

async function getLastGeneratedTimestamp(
  contextIndexPath: string,
  contextFiles: string[],
): Promise<number | null> {
  if (fs.existsSync(contextIndexPath)) {
    try {
      const indexContent = await readFileSafe(contextIndexPath);
      const parsed = JSON.parse(indexContent) as { timestamp?: string };
      if (parsed.timestamp) {
        const ts = new Date(parsed.timestamp).getTime();
        if (!Number.isNaN(ts)) return ts;
      }
    } catch {
      // Fall back to file mtime.
    }
  }
  return latestMtimeMs(contextFiles);
}

function chooseRecommendation(files: ContextStatus['files'], stale: boolean): string {
  if (!files.agents || !files.index) return 'devmind generate --all';
  if (!files.schema) return 'devmind generate --db';
  if (!files.overview) return 'devmind scan';
  if (stale) return 'devmind generate --all';
  return 'None (context is up to date)';
}

export async function status(options: StatusOptions): Promise<void> {
  const profiler = createProfiler(!!options.profile);
  const outputDir = options.output || '.devmind';
  const rootPath = path.resolve(options.path || '.');

  const agentsPath = path.join(outputDir, 'AGENTS.md');
  const indexPath = path.join(outputDir, 'index.json');
  const schemaPath = path.join(outputDir, 'database', 'schema.json');
  const overviewPath = path.join(outputDir, 'codebase', 'codebase-overview.md');

  const files = {
    agents: fs.existsSync(agentsPath),
    index: fs.existsSync(indexPath),
    schema: fs.existsSync(schemaPath),
    overview: fs.existsSync(overviewPath),
  };

  const contextFiles = [agentsPath, indexPath, schemaPath, overviewPath];
  const generatedMs = await profiler.section('status.loadContextTimestamp', async () =>
    getLastGeneratedTimestamp(indexPath, contextFiles),
  );
  const needsSourceScan = files.agents && files.index && generatedMs !== null;
  const sourceScan = needsSourceScan
    ? await profiler.section('status.scanSourceMtime', async () =>
        getSourceLastModifiedMs(outputDir, rootPath, generatedMs || undefined),
      )
    : { latest: null, sourceListCacheHit: false };
  const sourceMs = sourceScan.latest;

  const stale =
    !files.agents ||
    !files.index ||
    generatedMs === null ||
    (sourceMs !== null && sourceMs > generatedMs);

  const result: ContextStatus = {
    outputDir,
    rootPath,
    files,
    lastGeneratedAt: generatedMs ? new Date(generatedMs).toISOString() : null,
    stale,
    sourceLastModifiedAt: sourceMs ? new Date(sourceMs).toISOString() : null,
    sourceListCacheHit: sourceScan.sourceListCacheHit,
    recommendedCommand: chooseRecommendation(files, stale),
  };

  if (options.json) {
    const profile = profiler.report();
    console.log(JSON.stringify(profile ? { ...result, profile } : result, null, 2));
    return;
  }

  logger.info('DevMind Status');
  logger.info(`Output directory: ${result.outputDir}`);
  logger.info(`Root path: ${result.rootPath}`);
  logger.info(`Context detected: ${result.files.agents && result.files.index ? 'yes' : 'no'}`);
  logger.info(`- AGENTS.md: ${result.files.agents ? 'found' : 'missing'}`);
  logger.info(`- index.json: ${result.files.index ? 'found' : 'missing'}`);
  logger.info(`- schema.json: ${result.files.schema ? 'found' : 'missing'}`);
  logger.info(`- codebase-overview.md: ${result.files.overview ? 'found' : 'missing'}`);
  logger.info(`Last generated: ${result.lastGeneratedAt || 'unknown'}`);
  logger.info(`Last source change: ${result.sourceLastModifiedAt || 'unknown'}`);
  logger.info(`Context freshness: ${result.stale ? 'stale' : 'fresh'}`);
  logger.info(`Recommended command: ${result.recommendedCommand}`);
  logger.info(`Source list cache: ${sourceScan.sourceListCacheHit ? 'hit' : 'miss'}`);
  const profile = profiler.report();
  if (profile) {
    logger.info('Performance Profile');
    logger.info(`Total: ${profile.totalMs.toFixed(1)}ms`);
    for (const step of profile.steps) {
      logger.info(`- ${step.name}: ${step.ms.toFixed(1)}ms`);
    }
  }
}
