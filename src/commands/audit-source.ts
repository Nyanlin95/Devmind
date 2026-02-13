import * as path from 'path';
import * as fsPromises from 'fs/promises';
import type { Stats } from 'fs';
import { createHash } from 'crypto';

export interface AnalyzeCacheEntry {
  mtimeMs: number;
  size: number;
  matches: string[];
  content?: string;
}

export interface LoadedAuditSources {
  fileContents: Map<string, string>;
  fileSignatures: Map<string, string>;
  cacheReused: number;
  diskReads: number;
}

interface LoadAuditSourcesOptions {
  files: string[];
  rootPath: string;
  analyzeCache: Record<string, AnalyzeCacheEntry>;
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 48;

export async function loadAuditSources(
  options: LoadAuditSourcesOptions,
): Promise<LoadedAuditSources> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const fileContents = new Map<string, string>();
  const fileSignatures = new Map<string, string>();
  let cacheReused = 0;
  let diskReads = 0;

  for (let i = 0; i < options.files.length; i += batchSize) {
    const batch = options.files.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (relPath) => {
        const absPath = path.join(options.rootPath, relPath);
        let stat: Stats;
        try {
          stat = await fsPromises.stat(absPath);
        } catch {
          return null;
        }
        const signature = `${stat.size}:${stat.mtimeMs}`;
        const cached = options.analyzeCache[relPath];
        if (
          cached?.content !== undefined &&
          stat.mtimeMs === cached.mtimeMs &&
          stat.size === cached.size
        ) {
          return { relPath, signature, content: cached.content, reused: true };
        }
        try {
          const content = await fsPromises.readFile(absPath, 'utf-8');
          return { relPath, signature, content, reused: false };
        } catch {
          return { relPath, signature, content: null as string | null, reused: false };
        }
      }),
    );

    for (const result of batchResults) {
      if (!result) continue;
      fileSignatures.set(result.relPath, result.signature);
      if (result.content === null) continue;
      fileContents.set(result.relPath, result.content);
      if (result.reused) cacheReused += 1;
      else diskReads += 1;
    }
  }

  return { fileContents, fileSignatures, cacheReused, diskReads };
}

export function buildProjectFingerprint(fileSignatures: Map<string, string>): string {
  const stable = [...fileSignatures.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, sig]) => `${file}:${sig}`)
    .join('|');
  return createHash('sha256').update(stable, 'utf8').digest('hex').slice(0, 16);
}
