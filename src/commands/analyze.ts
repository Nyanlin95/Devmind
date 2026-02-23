import * as path from 'path';
import { createHash } from 'crypto';
import {
  logger,
  readFileSafe,
  writeFileSafe,
  ensureDir,
  createProfiler,
  readCacheJson,
  writeCacheJson,
  getSourceFilesWithCache,
  getSourceIgnoreGlobs,
} from '../core/index.js';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

interface AnalyzeOptions {
  output?: string;
  path?: string;
  profile?: boolean;
}

interface TableUsage {
  tableName: string;
  files: string[];
  count: number;
}

interface AnalyzeCacheEntry {
  mtimeMs: number;
  size: number;
  matches: string[];
  content?: string;
}

interface AnalyzeCache {
  version: number;
  schemaSignature: string;
  files: Record<string, AnalyzeCacheEntry>;
}

interface TableSearchInfo {
  tableName: string;
  terms: string[];
}

const CACHEABLE_CONTENT_MAX_BYTES = 24 * 1024;
const CACHE_CONTENT_BUDGET_BYTES = 8 * 1024 * 1024;
const FILE_BATCH_SIZE = 48;

export async function analyze(options: AnalyzeOptions): Promise<void> {
  const profiler = createProfiler(!!options.profile);
  const outputDir = options.output || '.devmind';
  const rootPath = path.resolve(options.path || '.');

  logger.info('Starting Cross-Context Analysis...');

  // 1. Load Schema
  const schemaPath = path.join(outputDir, 'database', 'schema.json');
  let schema: any;
  try {
    const schemaContent = await profiler.section('analyze.loadSchema', async () =>
      readFileSafe(schemaPath),
    );
    schema = JSON.parse(schemaContent);
    logger.info(`Loaded schema: ${schema.tables.length} tables found.`);
  } catch (error) {
    logger.error('Failed to load schema.json. Run "devmind generate" first.');
    return;
  }

  // 2. Scan Codebase Files
  // We scan actual files instead of relying on structure.json to ensure fresh content
  logger.info(`Scanning files in: ${rootPath}`);
  const ignore = await profiler.section('analyze.loadIgnore', async () =>
    getSourceIgnoreGlobs(rootPath),
  );
  const sourceList = await profiler.section('analyze.listSources', async () =>
    getSourceFilesWithCache({
      outputDir,
      rootPath,
      includeGlob: '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,java,rb,php,rs,kt,kts,dart,sh,bash,zsh,sql,swift}',
      ignore,
    }),
  );
  const files = sourceList.files;

  logger.info(`Analyzing ${files.length} source files...`);

  // 3. Analyze Usage
  const usage: TableUsage[] = [];
  const unusedTables: string[] = [];
  const tableInfos: TableSearchInfo[] = schema.tables
    .map((table: any) => {
      const tableName = String(table.name);
      const variations = [tableName, toPascalCase(tableName), toCamelCase(tableName)];
      const terms = [...new Set(variations.map((value) => value.toLowerCase()))];
      return { tableName, terms };
    })
    .sort((a: TableSearchInfo, b: TableSearchInfo) => a.tableName.localeCompare(b.tableName));
  const schemaSignature = buildSchemaSignature(tableInfos);

  const cachePath = path.join(outputDir, 'cache', 'analyze-cache.json');
  let cache: AnalyzeCache = {
    version: 1,
    schemaSignature,
    files: {},
  };
  cache = await profiler.section('analyze.loadCache', async () => {
    try {
      const parsed = await readCacheJson<AnalyzeCache>(cachePath);
      if (!parsed) return cache;
      if (parsed.version !== 1 || typeof parsed.files !== 'object') {
        return cache;
      }
      if (parsed.schemaSignature !== schemaSignature) {
        return {
          version: 1,
          schemaSignature,
          files: {},
        };
      }
      return parsed;
    } catch {
      return cache;
    }
  });

  const activeFiles = new Set(files);
  const matchedByTable = new Map<string, string[]>();
  let cacheHits = 0;
  let cacheMisses = 0;

  await profiler.section('analyze.matchFiles', async () => {
    for (let i = 0; i < files.length; i += FILE_BATCH_SIZE) {
      const batch = files.slice(i, i + FILE_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (file) => {
          const fullPath = path.join(rootPath, file);
          let stat: fs.Stats;
          try {
            stat = await fsPromises.stat(fullPath);
          } catch {
            return null;
          }

          const cached = cache.files[file];
          if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
            return {
              file,
              stat,
              matchedTables: cached.matches,
              content: null as string | null,
              cacheHit: true,
            };
          }

          let content: string | null = null;
          let matchedTables: string[] = [];
          try {
            content = await fsPromises.readFile(fullPath, 'utf-8');
            const contentLower = content.toLowerCase();
            for (const tableInfo of tableInfos) {
              if (tableInfo.terms.some((term) => contentLower.includes(term))) {
                matchedTables.push(tableInfo.tableName);
              }
            }
          } catch {
            matchedTables = [];
          }
          return { file, stat, matchedTables, content, cacheHit: false };
        }),
      );

      for (const result of results) {
        if (!result) continue;
        if (result.cacheHit) {
          cacheHits += 1;
        } else {
          cacheMisses += 1;
          cache.files[result.file] = {
            mtimeMs: result.stat.mtimeMs,
            size: result.stat.size,
            matches: result.matchedTables,
            content:
              result.content !== null && result.stat.size <= CACHEABLE_CONTENT_MAX_BYTES
                ? result.content
                : undefined,
          };
        }

        for (const tableName of result.matchedTables) {
          const existing = matchedByTable.get(tableName);
          if (existing) {
            existing.push(result.file);
          } else {
            matchedByTable.set(tableName, [result.file]);
          }
        }
      }
    }
  });

  await profiler.section('analyze.pruneCache', async () => {
    for (const relPath of Object.keys(cache.files)) {
      if (!activeFiles.has(relPath)) {
        delete cache.files[relPath];
      }
    }
    enforceContentBudget(cache.files, CACHE_CONTENT_BUDGET_BYTES);
  });

  for (const tableInfo of tableInfos) {
    const matchedFiles = [...(matchedByTable.get(tableInfo.tableName) || [])].sort((a, b) =>
      a.localeCompare(b),
    );
    if (matchedFiles.length > 0) {
      usage.push({
        tableName: tableInfo.tableName,
        files: matchedFiles,
        count: matchedFiles.length,
      });
    } else {
      unusedTables.push(tableInfo.tableName);
    }
  }

  // 4. Generate Reports
  const analysisDir = path.join(outputDir, 'analysis');
  await ensureDir(analysisDir);

  // CODE_DB_MAPPING.md
  let mappingContent = '# Code-to-Database Mapping\n\n';
  mappingContent += `**Generated:** ${new Date().toISOString()}\n\n`;

  // Most used tables first
  usage.sort((a, b) => b.count - a.count || a.tableName.localeCompare(b.tableName));

  for (const item of usage) {
    mappingContent += `### ${item.tableName} (${item.count} files)\n`;
    for (const file of item.files) {
      mappingContent += `- \`${file}\`\n`;
    }
    mappingContent += '\n';
  }

  await profiler.section('analyze.writeMapping', async () =>
    writeFileSafe(path.join(analysisDir, 'CODE_DB_MAPPING.md'), mappingContent),
  );

  await profiler.section('analyze.writeCache', async () => {
    await ensureDir(path.dirname(cachePath));
    await writeCacheJson(cachePath, cache, { compressAboveBytes: 512 * 1024, pretty: false });
  });

  // UNUSED_TABLES.md
  if (unusedTables.length > 0) {
    let unusedContent = '# Unused Tables Report\n\n';
    unusedContent +=
      '> **Warning:** These tables were not found in the codebase. Verify manually before deleting.\n\n';
    for (const table of [...unusedTables].sort((a, b) => a.localeCompare(b))) {
      unusedContent += `- [ ] ${table}\n`;
    }
    await profiler.section('analyze.writeUnused', async () =>
      writeFileSafe(path.join(analysisDir, 'UNUSED_TABLES.md'), unusedContent),
    );
  }

  logger.success('Analysis Complete!');
  logger.info(`   - ${path.join(analysisDir, 'CODE_DB_MAPPING.md')}`);
  if (unusedTables.length > 0) {
    logger.info(`   - ${path.join(analysisDir, 'UNUSED_TABLES.md')}`);
  }
  logger.info(`Analyze cache: ${cacheHits} reused, ${cacheMisses} refreshed`);
  logger.info(`Source list cache: ${sourceList.cacheHit ? 'hit' : 'miss'}`);
  const profile = profiler.report();
  if (profile) {
    logger.info('Performance Profile');
    logger.info(`Total: ${profile.totalMs.toFixed(1)}ms`);
    for (const step of profile.steps) {
      logger.info(`- ${step.name}: ${step.ms.toFixed(1)}ms`);
    }
  }
}

// Helpers
function toPascalCase(str: string): string {
  return str
    .replace(/_(\w)/g, (all, letter) => letter.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function buildSchemaSignature(tableInfos: TableSearchInfo[]): string {
  const stable = tableInfos
    .map((item) => `${item.tableName}:${item.terms.join(',')}`)
    .sort()
    .join('|');
  return createHash('sha256').update(stable, 'utf8').digest('hex').slice(0, 16);
}

function enforceContentBudget(files: Record<string, AnalyzeCacheEntry>, budgetBytes: number): void {
  let used = 0;
  const keys = Object.keys(files).sort();
  for (const key of keys) {
    const entry = files[key];
    if (!entry.content) continue;
    const bytes = Buffer.byteLength(entry.content, 'utf-8');
    if (used + bytes <= budgetBytes) {
      used += bytes;
      continue;
    }
    delete entry.content;
  }
}
