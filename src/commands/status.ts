import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { logger, readFileSafe } from '../core/index.js';

interface StatusOptions {
  output?: string;
  path?: string;
  json?: boolean;
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

async function getSourceLastModifiedMs(rootPath: string): Promise<number | null> {
  const files = await glob('**/*.{ts,tsx,js,jsx,py,go,java,rb,php,rs}', {
    cwd: rootPath,
    ignore: ['node_modules/**', '.git/**', '.devmind/**', 'dist/**', 'build/**'],
    nodir: true,
  });

  let latest: number | null = null;
  for (const relPath of files) {
    const fullPath = path.join(rootPath, relPath);
    try {
      const stat = fs.statSync(fullPath);
      if (latest === null || stat.mtimeMs > latest) {
        latest = stat.mtimeMs;
      }
    } catch {
      // Ignore files that disappeared during scan.
    }
  }

  return latest;
}

async function getLastGeneratedTimestamp(contextIndexPath: string, contextFiles: string[]): Promise<number | null> {
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
  const generatedMs = await getLastGeneratedTimestamp(indexPath, contextFiles);
  const sourceMs = await getSourceLastModifiedMs(rootPath);

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
    recommendedCommand: chooseRecommendation(files, stale),
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
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
}
