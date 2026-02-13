/**
 * Learn Command
 * Add a learning to the accumulated knowledge
 */

import * as path from 'path';
import { createHash } from 'crypto';
import { jsonSuccess, outputJson, isJsonMode, outputJsonError } from '../utils/json-output.js';
import * as fs from 'fs/promises';
import {
  logger,
  ensureDir,
  writeFileSafe,
  readFileSafe,
  readCacheJson,
  writeCacheJson,
  failCommand,
} from '../../core/index.js';
import { parseLearningEntries } from '../../core/learning-parser.js';

interface LearnOptions {
  list?: boolean;
  category?: string;
  top?: string | number;
  contains?: string;
  since?: string;
  compact?: boolean;
  output?: string;
  json?: boolean;
}

type LearningItem = ReturnType<typeof parseLearningEntries>[number];

interface LearnIndex {
  version: number;
  updatedAt: string;
  fingerprints: Record<string, string>;
}

interface LearnIndexLoadResult {
  index: LearnIndex;
  rebuilt: boolean;
}

const LEARN_HEADER =
  '# Project Learnings\n\n> Accumulated technical learnings, architectural decisions, and discovered patterns.\n\n';
const LEARN_LOCK_TIMEOUT_MS = 2000;
const LEARN_LOCK_RETRY_MS = 50;

export async function learn(learning: string, options: LearnOptions): Promise<void> {
  const outputDir = options.output || '.devmind';
  const jsonMode = isJsonMode(options);

  // List learnings
  if (options.list) {
    await listLearnings(outputDir, jsonMode, {
      category: options.category,
      top: options.top,
      contains: options.contains,
      since: options.since,
      compact: options.compact,
    });
    return;
  }

  if (!learning) {
    const errorMessage = 'Please provide a learning.';
    if (jsonMode) {
      outputJsonError(errorMessage);
      return;
    }
    logger.error(errorMessage);
    logger.info('');
    logger.info('Usage:');
    logger.info('  devmind learn "Always use indexes on foreign keys"');
    logger.info('  devmind learn "Batch inserts are 5x faster" --category=performance');
    return;
  }

  const category = normalizeCategory(options.category || 'general');
  const normalizedLearning = normalizeLearning(learning);
  if (!normalizedLearning) {
    const errorMessage = 'Learning content is empty after normalization.';
    if (jsonMode) {
      outputJsonError(errorMessage);
      return;
    }
    logger.error(errorMessage);
    return;
  }

  const timestamp = new Date().toISOString();
  const fingerprint = createFingerprint(category, normalizedLearning);

  // Create learning content
  const content = `## ${timestamp} - ${category}

${normalizedLearning}

---
`;

  const learningsPath = path.join(outputDir, 'memory', 'LEARN.md');
  const indexPath = path.join(outputDir, 'memory', 'learn-index.json');
  const lockPath = path.join(outputDir, 'memory', '.learn.lock');

  try {
    await ensureDir(path.dirname(learningsPath));
    await withFileLock(lockPath, async () => {
      const loaded = await loadOrRebuildLearnIndex(indexPath, learningsPath, timestamp);
      const index = loaded.index;
      if (loaded.rebuilt) {
        await writeCacheJson(indexPath, index, { pretty: false, compressAboveBytes: 512 * 1024 });
      }

      const existingAt = index.fingerprints[fingerprint];
      if (existingAt) {
        if (jsonMode) {
          outputJson(
            jsonSuccess({
              added: false,
              duplicate: true,
              fingerprint,
              existingAt,
            }),
          );
          return;
        }
        logger.info('Learning already exists. Skipping duplicate entry.');
        logger.info(`   Fingerprint: ${fingerprint}`);
        logger.info(`   First seen: ${existingAt}`);
        return;
      }

      try {
        await fs.access(learningsPath);
      } catch {
        await writeFileSafe(learningsPath, LEARN_HEADER);
      }
      await fs.appendFile(learningsPath, content, 'utf-8');

      index.fingerprints[fingerprint] = timestamp;
      index.updatedAt = timestamp;
      await writeCacheJson(indexPath, index, { pretty: false, compressAboveBytes: 512 * 1024 });

      if (jsonMode) {
        outputJson(
          jsonSuccess({
            added: true,
            duplicate: false,
            category,
            content: normalizedLearning,
            fingerprint,
            file: learningsPath,
            index: indexPath,
          }),
        );
        return;
      }

      logger.success('Learning added successfully!');
      logger.info(`   Category: ${category}`);
      logger.info(`   Content: ${normalizedLearning}`);
      logger.info(`   File: ${learningsPath}`);
    });
  } catch (error) {
    if (jsonMode) {
      outputJsonError(error as Error);
      return;
    }
    failCommand('Failed to save learning:', error);
    return;
  }
}

async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  while (true) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      try {
        return await fn();
      } finally {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') throw error;
      if (Date.now() - start >= LEARN_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for learn lock: ${lockPath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, LEARN_LOCK_RETRY_MS));
    }
  }
}

function normalizeCategory(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizeLearning(input: string): string {
  return input
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function createFingerprint(category: string, content: string): string {
  return createHash('sha256').update(`${category}\n${content}`, 'utf8').digest('hex').slice(0, 16);
}

function isValidLearnIndex(value: unknown): value is LearnIndex {
  if (!value || typeof value !== 'object') return false;
  const typed = value as LearnIndex;
  return (
    typed.version === 1 &&
    typeof typed.updatedAt === 'string' &&
    !!typed.fingerprints &&
    typeof typed.fingerprints === 'object'
  );
}

async function loadOrRebuildLearnIndex(
  indexPath: string,
  learningsPath: string,
  nowIso: string,
): Promise<LearnIndexLoadResult> {
  const loaded = await readCacheJson<LearnIndex>(indexPath);
  if (isValidLearnIndex(loaded)) {
    return { index: loaded, rebuilt: false };
  }

  let rebuilt: LearnIndex = {
    version: 1,
    updatedAt: nowIso,
    fingerprints: {},
  };
  try {
    const learnContent = await readFileSafe(learningsPath);
    const parsed = parseLearningEntries(learnContent);
    for (const item of parsed) {
      const fingerprint = createFingerprint(
        normalizeCategory(item.category || 'general'),
        normalizeLearning(item.content || ''),
      );
      const existingAt = rebuilt.fingerprints[fingerprint];
      if (!existingAt || item.timestamp < existingAt) {
        rebuilt.fingerprints[fingerprint] = item.timestamp;
      }
    }
  } catch {
    // Missing or unreadable LEARN.md means we start from an empty index.
  }

  return { index: rebuilt, rebuilt: true };
}

function parseTop(topRaw: string | number | undefined): number | null {
  if (topRaw === undefined) return null;
  const parsed = Number(topRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

async function listLearnings(
  outputDir: string,
  jsonMode: boolean,
  filters: {
    category?: string;
    top?: string | number;
    contains?: string;
    since?: string;
    compact?: boolean;
  },
): Promise<void> {
  const learningsPath = path.join(outputDir, 'memory', 'LEARN.md');

  try {
    const content = await readFileSafe(learningsPath);
    const items = parseLearningEntries(content).sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
    );
    const normalizedCategory = filters.category ? normalizeCategory(filters.category) : null;
    const top = parseTop(filters.top);
    const contains = (filters.contains || '').trim().toLowerCase();
    const sinceTimestamp = filters.since ? Date.parse(filters.since) : null;
    if (filters.since && (sinceTimestamp === null || Number.isNaN(sinceTimestamp))) {
      const error = new Error(`Invalid --since date: ${filters.since}`);
      if (jsonMode) {
        outputJsonError(error);
        return;
      }
      logger.error(error.message);
      return;
    }

    let filteredItems = items;
    if (normalizedCategory) {
      filteredItems = filteredItems.filter(
        (item) => normalizeCategory(item.category) === normalizedCategory,
      );
    }
    if (contains) {
      filteredItems = filteredItems.filter((item) =>
        `${item.category}\n${item.content}`.toLowerCase().includes(contains),
      );
    }
    if (sinceTimestamp !== null && !Number.isNaN(sinceTimestamp)) {
      filteredItems = filteredItems.filter((item) => {
        const ts = Date.parse(item.timestamp);
        return !Number.isNaN(ts) && ts >= sinceTimestamp;
      });
    }
    if (top !== null) {
      filteredItems = filteredItems.slice(0, top);
    }

    if (jsonMode) {
      const compactItems = filteredItems.map((item) => ({
        timestamp: item.timestamp,
        category: item.category,
        fingerprint: createFingerprint(
          normalizeCategory(item.category || 'general'),
          item.content || '',
        ),
      }));
      outputJson(
        jsonSuccess({
          total: filteredItems.length,
          filters: {
            category: normalizedCategory,
            top,
            contains: contains || null,
            since: filters.since || null,
            compact: !!filters.compact,
          },
          items: filters.compact ? compactItems : filteredItems,
        }),
      );
      return;
    }

    if (filteredItems.length === 0) {
      logger.info('No learnings recorded yet.');
      return;
    }

    logger.info(`Accumulated Learnings (${filteredItems.length}):`);
    logger.info('');

    filteredItems.forEach((item) => {
      logger.success(`  ${item.timestamp}`);
      logger.info(`    Category: ${item.category || 'general'}`);
      logger.info(`    ${item.content || '(No content)'}`);
      logger.info('');
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (jsonMode) {
        outputJson(
          jsonSuccess({
            total: 0,
            filters: {
              category: filters.category ? normalizeCategory(filters.category) : null,
              top: parseTop(filters.top),
              contains: (filters.contains || '').trim() || null,
              since: filters.since || null,
              compact: !!filters.compact,
            },
            items: [] as LearningItem[],
          }),
        );
        return;
      }
      logger.info('No learnings found.');
    } else {
      if (jsonMode) {
        outputJsonError(error as Error);
        return;
      }
      logger.error('Failed to list learnings:');
      logger.error((error as Error).message);
    }
  }
}
