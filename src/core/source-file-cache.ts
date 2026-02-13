import { createHash } from 'crypto';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import { readCacheJson, writeCacheJson } from './cache-json.js';

interface SourceFileCacheEntry {
  createdAtMs: number;
  files: string[];
  dirMtimes: Record<string, number>;
}

interface SourceFileCacheStore {
  version: number;
  entries: Record<string, SourceFileCacheEntry>;
}

interface SourceFileCacheOptions {
  outputDir: string;
  rootPath: string;
  includeGlob: string;
  ignore: string[];
  ttlMs?: number;
}

interface SourceFileCacheResult {
  files: string[];
  cacheHit: boolean;
}

const CACHE_VERSION = 2;

function makeKey(rootPath: string, includeGlob: string, ignore: string[]): string {
  const stable = `${rootPath}::${includeGlob}::${[...ignore].sort().join(',')}`;
  return createHash('sha256').update(stable, 'utf8').digest('hex').slice(0, 16);
}

function normalizeRelDir(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return normalized === '' ? '.' : normalized;
}

async function collectDirectoryMtimes(
  rootPath: string,
  files: string[],
): Promise<Record<string, number>> {
  const dirs = new Set<string>(['.']);
  for (const file of files) {
    const relDir = normalizeRelDir(path.posix.dirname(file.replace(/\\/g, '/')));
    dirs.add(relDir);
  }
  const entries = [...dirs];
  const result: Record<string, number> = {};
  for (const relDir of entries) {
    const absDir = relDir === '.' ? rootPath : path.join(rootPath, relDir);
    try {
      const stat = await fs.stat(absDir);
      result[relDir] = stat.mtimeMs;
    } catch {
      // Skip transiently missing or inaccessible directories.
    }
  }
  return result;
}

async function isDirectoryStateFresh(
  rootPath: string,
  dirMtimes: Record<string, number>,
): Promise<boolean> {
  if (!dirMtimes || Object.keys(dirMtimes).length === 0) {
    return false;
  }
  const entries = Object.entries(dirMtimes);
  for (const [relDir, recordedMtime] of entries) {
    const absDir = relDir === '.' ? rootPath : path.join(rootPath, relDir);
    let stat: Stats;
    try {
      stat = await fs.stat(absDir);
    } catch {
      return false;
    }
    if (stat.mtimeMs !== recordedMtime) {
      return false;
    }
  }
  return true;
}

export async function getSourceFilesWithCache(
  options: SourceFileCacheOptions,
): Promise<SourceFileCacheResult> {
  const ttlMs = options.ttlMs ?? 30000;
  const cachePath = `${options.outputDir}/cache/file-list.json`;
  const key = makeKey(options.rootPath, options.includeGlob, options.ignore);
  const now = Date.now();

  const store: SourceFileCacheStore = (await readCacheJson<SourceFileCacheStore>(cachePath)) || {
    version: CACHE_VERSION,
    entries: {},
  };
  const entry = store.version === CACHE_VERSION ? store.entries[key] : undefined;
  if (entry && now - entry.createdAtMs <= ttlMs) {
    if (await isDirectoryStateFresh(options.rootPath, entry.dirMtimes || {})) {
      return { files: entry.files, cacheHit: true };
    }
  }

  const files = await glob(options.includeGlob, {
    cwd: options.rootPath,
    ignore: options.ignore,
    nodir: true,
  });
  files.sort((a, b) => a.localeCompare(b));

  const nextStore: SourceFileCacheStore =
    store.version === CACHE_VERSION ? { ...store } : { version: CACHE_VERSION, entries: {} };
  nextStore.entries[key] = {
    createdAtMs: now,
    files,
    dirMtimes: await collectDirectoryMtimes(options.rootPath, files),
  };

  const maxEntries = 16;
  const sorted = Object.entries(nextStore.entries).sort(
    (a, b) => b[1].createdAtMs - a[1].createdAtMs,
  );
  nextStore.entries = Object.fromEntries(sorted.slice(0, maxEntries));

  await writeCacheJson(cachePath, nextStore, { compressAboveBytes: 1024 * 1024, pretty: false });

  return { files, cacheHit: false };
}
