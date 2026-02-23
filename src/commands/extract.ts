import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import {
  logger,
  ensureDir,
  writeFileSafe,
  readFileSafe,
  createProfiler,
  readCacheJson,
  getSourceFilesWithCache,
  getSourceIgnoreGlobs,
} from '../core/index.js';

interface ExtractOptions {
  output?: string;
  path?: string;
  apply?: boolean;
  json?: boolean;
  silent?: boolean;
  profile?: boolean;
}

export interface ExtractedLearning {
  category: string;
  content: string;
}

export interface ExtractResult {
  extracted: number;
  report: string;
  applied: boolean;
  learnPath: string | null;
  sourceCache?: {
    reused: number;
    diskReads: number;
  };
  sourceListCache?: boolean;
  profile?: {
    totalMs: number;
    steps: Array<{ name: string; ms: number }>;
  };
}

interface AnalyzeCacheEntry {
  mtimeMs: number;
  size: number;
  matches: string[];
  content?: string;
}

interface AnalyzeCacheShape {
  version?: number;
  files?: Record<string, AnalyzeCacheEntry>;
}

async function readFilesInBatches(
  rootPath: string,
  relativePaths: string[],
  batchSize: number = 48,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (let i = 0; i < relativePaths.length; i += batchSize) {
    const batch = relativePaths.slice(i, i + batchSize);
    const loaded = await Promise.all(
      batch.map(async (relPath) => {
        try {
          const content = await fsPromises.readFile(path.join(rootPath, relPath), 'utf-8');
          return { relPath, content };
        } catch {
          return null;
        }
      }),
    );
    for (const item of loaded) {
      if (!item) continue;
      results.set(item.relPath, item.content);
    }
  }

  return results;
}

function normalizeSentence(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;:,]+$/, '');
}

function inferCategory(content: string): string {
  const lc = content.toLowerCase();
  if (lc.includes('index') || lc.includes('query') || lc.includes('sql')) return 'database';
  if (lc.includes('cache') || lc.includes('latency') || lc.includes('batch')) return 'performance';
  if (lc.includes('auth') || lc.includes('permission') || lc.includes('tenant')) return 'security';
  if (lc.includes('module') || lc.includes('service') || lc.includes('layer'))
    return 'architecture';
  return 'codebase';
}

function collectFromAnalysisFiles(content: string): ExtractedLearning[] {
  const lines = content.split('\n').map((line) => line.trim());
  const output: ExtractedLearning[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('>')) continue;
    if (line.startsWith('- [ ]')) continue;
    if (!line.startsWith('- ')) continue;
    const clean = normalizeSentence(line.replace(/^-+\s*/, ''));
    if (clean.length < 20) continue;
    output.push({
      category: inferCategory(clean),
      content: clean,
    });
  }

  return output;
}

function collectFromSourceComments(content: string): ExtractedLearning[] {
  const output: ExtractedLearning[] = [];
  const patterns = [
    /(?:TODO|NOTE|IMPORTANT|WARNING)\s*[:\-]\s*(.+)/gi,
    /@decision\s+(.+)/gi,
    /@pattern\s+(.+)/gi,
  ];

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const text = normalizeSentence(match[1] || '');
      if (text.length < 20) continue;
      output.push({
        category: inferCategory(text),
        content: text,
      });
    }
  }

  return output;
}

function dedupeLearnings(items: ExtractedLearning[]): ExtractedLearning[] {
  const seen = new Set<string>();
  const output: ExtractedLearning[] = [];
  for (const item of items) {
    const key = item.content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function appendToLearnFile(
  outputDir: string,
  learnings: ExtractedLearning[],
): Promise<string> {
  const learnPath = path.join(outputDir, 'memory', 'LEARN.md');
  await ensureDir(path.dirname(learnPath));

  let existing = '';
  try {
    existing = await readFileSafe(learnPath);
  } catch {
    existing =
      '# Project Learnings\n\n> Accumulated technical learnings, architectural decisions, and discovered patterns.\n\n';
  }

  let block = '';
  const timestamp = new Date().toISOString();
  for (const item of learnings) {
    block += `## ${timestamp} - ${item.category}\n\n${item.content}\n\n---\n`;
  }

  await writeFileSafe(learnPath, `${existing}${block}`);
  return learnPath;
}

export async function runExtraction(options: ExtractOptions): Promise<ExtractResult> {
  const profiler = createProfiler(!!options.profile);
  const outputDir = options.output || '.devmind';
  const rootPath = path.resolve(options.path || '.');
  const candidates: ExtractedLearning[] = [];

  const analysisDir = path.join(outputDir, 'analysis');
  const analysisFiles = ['CODE_DB_MAPPING.md', 'UNUSED_TABLES.md', 'AUDIT_REPORT.md'];
  for (const file of analysisFiles) {
    const filePath = path.join(analysisDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = await readFileSafe(filePath);
      candidates.push(...collectFromAnalysisFiles(content));
    } catch {
      // ignore unreadable files
    }
  }

  const ignore = await profiler.section('extract.loadIgnore', async () =>
    getSourceIgnoreGlobs(rootPath),
  );
  const sourceList = await profiler.section('extract.listSources', async () =>
    getSourceFilesWithCache({
      outputDir,
      rootPath,
      includeGlob: '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,java,rb,php,rs,kt,kts,dart,sh,bash,zsh,sql,swift}',
      ignore,
    }),
  );
  const sourceFiles = sourceList.files;

  const analyzeCache = await profiler.section('extract.loadAnalyzeCache', async () => {
    const cachePath = path.join(outputDir, 'cache', 'analyze-cache.json');
    const parsed = await readCacheJson<AnalyzeCacheShape>(cachePath);
    return parsed?.files || ({} as Record<string, AnalyzeCacheEntry>);
  });

  const sourceContents = new Map<string, string>();
  const missingFiles: string[] = [];
  let cacheReused = 0;
  await profiler.section('extract.reuseCachedSources', async () => {
    for (const relPath of sourceFiles) {
      const cached = analyzeCache[relPath];
      if (cached?.content === undefined) {
        missingFiles.push(relPath);
        continue;
      }
      const fullPath = path.join(rootPath, relPath);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
          sourceContents.set(relPath, cached.content);
          cacheReused += 1;
          continue;
        }
      } catch {
        // fall through to missing path
      }
      missingFiles.push(relPath);
    }
  });

  const diskSourceContents = await profiler.section('extract.readSources', async () =>
    readFilesInBatches(rootPath, missingFiles),
  );
  for (const [relPath, content] of diskSourceContents.entries()) {
    sourceContents.set(relPath, content);
  }
  for (const content of sourceContents.values()) {
    candidates.push(...collectFromSourceComments(content));
  }

  const extracted = dedupeLearnings(candidates)
    .sort((a, b) => a.category.localeCompare(b.category) || a.content.localeCompare(b.content))
    .slice(0, 25);

  const reportPath = path.join(outputDir, 'analysis', 'EXTRACTED_LEARNINGS.md');
  await ensureDir(path.dirname(reportPath));
  let report = '# Extracted Learnings\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  if (extracted.length === 0) {
    report += 'No learning candidates were extracted.\n';
  } else {
    for (const item of extracted) {
      report += `## ${item.category}\n\n${item.content}\n\n`;
    }
  }
  await writeFileSafe(reportPath, report);

  let learnPath: string | null = null;
  if (options.apply && extracted.length > 0) {
    learnPath = await profiler.section('extract.appendLearn', async () =>
      appendToLearnFile(outputDir, extracted),
    );
  }

  const result: ExtractResult = {
    extracted: extracted.length,
    report: reportPath,
    applied: !!options.apply,
    learnPath,
    sourceCache: {
      reused: cacheReused,
      diskReads: missingFiles.length,
    },
    sourceListCache: sourceList.cacheHit,
  };
  if (!options.json && !options.silent) {
    logger.info(`Source cache reuse: ${cacheReused}, disk reads: ${missingFiles.length}`);
  }
  const profile = profiler.report();
  return profile ? { ...result, profile } : result;
}

export async function extract(options: ExtractOptions): Promise<void> {
  const result = await runExtraction(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!options.silent) {
    logger.info('Extraction complete.');
    logger.info(`Extracted learnings: ${result.extracted}`);
    logger.info(`Report: ${result.report}`);
    if (result.learnPath) {
      logger.info(`Appended to: ${result.learnPath}`);
    } else if (result.extracted > 0) {
      logger.info('Use --apply to append extracted learnings to memory/LEARN.md');
    }
  }
}
