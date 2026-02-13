import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import {
  logger,
  ensureDir,
  readFileSafe,
  writeFileSafe,
  createProfiler,
  readCacheJson,
  writeCacheJson,
  getSourceFilesWithCache,
  parseLearningEntries,
} from '../core/index.js';
import { loadAuditSources, buildProjectFingerprint, AnalyzeCacheEntry } from './audit-source.js';
import {
  collectDesignAuditFindings,
  buildDesignAuditReport,
  type DesignAuditFinding,
} from './audit-design.js';
import { buildLearningAuditReport, summarizeDesignFindings } from './audit-report.js';

interface AuditOptions {
  output?: string;
  path?: string;
  json?: boolean;
  profile?: boolean;
}

type LearningItem = ReturnType<typeof parseLearningEntries>[number];

interface AuditResult {
  learning: LearningItem;
  status: 'covered' | 'needs-review';
  matchedFiles: string[];
}

interface AnalyzeCacheShape {
  version?: number;
  files?: Record<string, AnalyzeCacheEntry>;
}

interface AuditCoverageCacheEntry {
  status: 'covered' | 'needs-review';
  matchedFiles: string[];
}

interface AuditCoverageCache {
  version: number;
  projectFingerprint: string;
  items: Record<string, AuditCoverageCacheEntry>;
}

const STOPWORDS = new Set([
  'with',
  'from',
  'that',
  'this',
  'always',
  'never',
  'should',
  'would',
  'could',
  'must',
  'using',
  'across',
  'before',
  'after',
  'where',
  'when',
  'then',
  'they',
  'them',
  'into',
  'your',
  'ours',
  'their',
  'have',
  'has',
  'will',
  'been',
  'make',
  'more',
  'less',
]);
function buildKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  return [...new Set(tokens)].slice(0, 6);
}

function hasKeywordCoverageLowercase(lowercaseContent: string, keywords: string[]): boolean {
  let hits = 0;
  for (const keyword of keywords) {
    if (lowercaseContent.includes(keyword)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

function buildLearningKey(learning: LearningItem): string {
  return createHash('sha256')
    .update(`${learning.timestamp}|${learning.category}|${learning.content}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function normalizeMatchedFiles(files: string[]): string[] {
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

export async function audit(options: AuditOptions): Promise<void> {
  const profiler = createProfiler(!!options.profile);
  const outputDir = options.output || '.devmind';
  const rootPath = path.resolve(options.path || '.');
  const learnPath = path.join(outputDir, 'memory', 'LEARN.md');

  if (!fs.existsSync(learnPath)) {
    logger.error(`Learning file not found: ${learnPath}`);
    logger.info('Run: devmind learn "..." or devmind extract --apply');
    return;
  }

  const learnContent = await readFileSafe(learnPath);
  const learnings = parseLearningEntries(learnContent).map((entry) => ({
    ...entry,
    content: entry.content.replace(/\s+/g, ' ').trim(),
  }));

  if (learnings.length === 0) {
    logger.warn('No learnings found to audit.');
    return;
  }

  const sourceList = await profiler.section('audit.listSources', async () =>
    getSourceFilesWithCache({
      outputDir,
      rootPath,
      includeGlob: '**/*.{ts,tsx,js,jsx,py,go,java,rb,php,rs,css,scss}',
      ignore: ['node_modules/**', '.git/**', '.devmind/**', 'dist/**', 'build/**'],
    }),
  );
  const files = sourceList.files;

  const analyzeCache = await profiler.section('audit.loadAnalyzeCache', async () => {
    const cachePath = path.join(outputDir, 'cache', 'analyze-cache.json');
    const parsed = await readCacheJson<AnalyzeCacheShape>(cachePath);
    return parsed?.files || ({} as Record<string, AnalyzeCacheEntry>);
  });

  const sourceData = await profiler.section('audit.readSources', async () =>
    loadAuditSources({
      files,
      rootPath,
      analyzeCache,
    }),
  );
  const { fileContents, fileSignatures, cacheReused, diskReads } = sourceData;

  const projectFingerprint = buildProjectFingerprint(fileSignatures);
  const coverageCachePath = path.join(outputDir, 'cache', 'audit-coverage.json');
  const existingCoverageCache = await profiler.section('audit.loadCoverageCache', async () => {
    const parsed = await readCacheJson<AuditCoverageCache>(coverageCachePath);
    if (!parsed || parsed.version !== 1 || typeof parsed.items !== 'object') {
      return {
        version: 1,
        projectFingerprint,
        items: {},
      } as AuditCoverageCache;
    }
    return parsed;
  });
  const coverageCache: AuditCoverageCache =
    existingCoverageCache.projectFingerprint === projectFingerprint
      ? existingCoverageCache
      : {
          version: 1,
          projectFingerprint,
          items: {},
        };

  const results: AuditResult[] = [];
  let coverageCacheHits = 0;
  let coverageCacheMisses = 0;
  await profiler.section('audit.learningCoverage', async () => {
    const lowerContents = new Map<string, string>();
    for (const [relPath, content] of fileContents.entries()) {
      lowerContents.set(relPath, content.toLowerCase());
    }

    const keywordFileCache = new Map<string, string[]>();
    const getFilesForKeyword = (keyword: string): string[] => {
      const cached = keywordFileCache.get(keyword);
      if (cached) return cached;
      const matched: string[] = [];
      for (const [relPath, lc] of lowerContents.entries()) {
        if (lc.includes(keyword)) matched.push(relPath);
      }
      keywordFileCache.set(keyword, matched);
      return matched;
    };

    for (const learning of learnings) {
      const learningKey = buildLearningKey(learning);
      const cachedCoverage = coverageCache.items[learningKey];
      if (cachedCoverage) {
        const normalized = normalizeMatchedFiles(cachedCoverage.matchedFiles || []);
        coverageCacheHits += 1;
        results.push({
          learning,
          status: cachedCoverage.status,
          matchedFiles: normalized,
        });
        coverageCache.items[learningKey] = {
          status: cachedCoverage.status,
          matchedFiles: normalized,
        };
        continue;
      }
      coverageCacheMisses += 1;
      const keywords = buildKeywords(learning.content);
      const matchedFiles: string[] = [];
      if (keywords.length > 0) {
        const prioritizedKeywords = [...keywords].sort(
          (a, b) => getFilesForKeyword(a).length - getFilesForKeyword(b).length,
        );
        const primaryCandidates = getFilesForKeyword(prioritizedKeywords[0]);
        for (const relPath of primaryCandidates) {
          const lc = lowerContents.get(relPath);
          if (!lc) continue;
          if (hasKeywordCoverageLowercase(lc, keywords)) {
            matchedFiles.push(relPath);
            if (matchedFiles.length >= 5) break;
          }
        }
      }

      const normalizedMatchedFiles = normalizeMatchedFiles(matchedFiles);
      results.push({
        learning,
        status: normalizedMatchedFiles.length > 0 ? 'covered' : 'needs-review',
        matchedFiles: normalizedMatchedFiles,
      });
      coverageCache.items[learningKey] = {
        status: normalizedMatchedFiles.length > 0 ? 'covered' : 'needs-review',
        matchedFiles: normalizedMatchedFiles,
      };
    }
  });

  await profiler.section('audit.writeCoverageCache', async () => {
    await writeCacheJson(coverageCachePath, coverageCache, {
      compressAboveBytes: 512 * 1024,
      pretty: false,
    });
  });

  const covered = results.filter((r) => r.status === 'covered').length;
  const needsReview = results.length - covered;

  const reportPath = path.join(outputDir, 'analysis', 'AUDIT_REPORT.md');
  await ensureDir(path.dirname(reportPath));

  const report = buildLearningAuditReport(results, covered, needsReview);

  await profiler.section('audit.writeLearningReport', async () =>
    writeFileSafe(reportPath, report),
  );

  let designFindings: DesignAuditFinding[] = [];
  const designSystemPath = path.join(outputDir, 'design-system.json');
  const designReportPath = path.join(outputDir, 'analysis', 'DESIGN_SYSTEM_AUDIT.md');
  if (fs.existsSync(designSystemPath)) {
    designFindings = await collectDesignAuditFindings(rootPath, designSystemPath, fileContents);
    designFindings.sort(
      (a, b) =>
        a.severity.localeCompare(b.severity) ||
        a.rule.localeCompare(b.rule) ||
        (a.file || '').localeCompare(b.file || '') ||
        a.message.localeCompare(b.message),
    );
  }

  if (fs.existsSync(designSystemPath)) {
    const designReport = buildDesignAuditReport(designSystemPath, designFindings);
    await profiler.section('audit.writeDesignReport', async () =>
      writeFileSafe(designReportPath, designReport),
    );
  }

  if (options.json) {
    const profile = profiler.report();
    const payload = {
      total: results.length,
      covered,
      needsReview,
      report: reportPath,
      sourceCache: {
        reused: cacheReused,
        diskReads,
      },
      coverageCache: {
        reused: coverageCacheHits,
        recomputed: coverageCacheMisses,
      },
      sourceListCache: sourceList.cacheHit,
      designSystem: fs.existsSync(designSystemPath)
        ? {
            report: designReportPath,
            ...summarizeDesignFindings(designFindings),
          }
        : null,
      ...(profile ? { profile } : {}),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  logger.info('Learning audit complete.');
  logger.info(`Total: ${results.length}`);
  logger.info(`Covered: ${covered}`);
  logger.info(`Needs review: ${needsReview}`);
  logger.info(`Report: ${reportPath}`);
  logger.info(`Source cache reuse: ${cacheReused}, disk reads: ${diskReads}`);
  logger.info(`Coverage cache: ${coverageCacheHits} reused, ${coverageCacheMisses} recomputed`);
  logger.info(`Source list cache: ${sourceList.cacheHit ? 'hit' : 'miss'}`);
  if (fs.existsSync(designSystemPath)) {
    logger.info(`Design system findings: ${designFindings.length}`);
    logger.info(`Design report: ${designReportPath}`);
  }
  const profile = profiler.report();
  if (profile) {
    logger.info('Performance Profile');
    logger.info(`Total: ${profile.totalMs.toFixed(1)}ms`);
    for (const step of profile.steps) {
      logger.info(`- ${step.name}: ${step.ms.toFixed(1)}ms`);
    }
  }
}
