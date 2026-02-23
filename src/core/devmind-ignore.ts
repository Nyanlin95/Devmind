import * as path from 'path';
import { readFileSafe } from './fileio.js';

const DEFAULT_SOURCE_IGNORE_GLOBS = [
  'node_modules/**',
  '.git/**',
  '.devmind/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '.ai/**',
];

const DEFAULT_SCANNER_IGNORE_NAMES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'cohere-scan',
  '__pycache__',
  '.devmind',
  '.ai',
];

const IGNORE_FILE_CANDIDATES = ['.devmindignore', path.join('.devmind', 'ignore')];

function normalizePattern(value: string): string {
  let normalized = value.trim().replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized.trim();
}

function expandPattern(rawPattern: string): string[] {
  const pattern = normalizePattern(rawPattern);
  if (!pattern) return [];
  if (/[*?[\]{}!]/.test(pattern)) return [pattern];

  const noTrailing = pattern.replace(/\/+$/, '');
  if (!noTrailing) return [];
  if (noTrailing.includes('/')) {
    return [noTrailing, `${noTrailing}/**`];
  }
  return [noTrailing, `${noTrailing}/**`, `**/${noTrailing}/**`];
}

function extractScannerName(pattern: string): string | null {
  if (/[*?[\]{}!]/.test(pattern)) return null;
  const normalized = normalizePattern(pattern);
  if (!normalized) return null;

  const noTrailing = normalized.replace(/\/+$/, '');
  if (!noTrailing) return null;
  if (!noTrailing.includes('/')) return noTrailing;
  if (noTrailing.startsWith('**/')) {
    const tail = noTrailing.slice(3);
    if (tail && !tail.includes('/')) return tail;
  }
  return null;
}

async function readIgnorePatterns(rootPath: string): Promise<string[]> {
  const merged: string[] = [];
  for (const relPath of IGNORE_FILE_CANDIDATES) {
    const fullPath = path.join(rootPath, relPath);
    try {
      const raw = await readFileSafe(fullPath);
      const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
      merged.push(...lines);
    } catch {
      // Optional ignore file.
    }
  }
  return merged;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function getSourceIgnoreGlobs(rootPath: string, extra: string[] = []): Promise<string[]> {
  const fromFile = await readIgnorePatterns(rootPath);
  const expandedFromFile = fromFile.flatMap((pattern) => expandPattern(pattern));
  const expandedExtra = extra.flatMap((pattern) => expandPattern(pattern));
  return dedupe([...DEFAULT_SOURCE_IGNORE_GLOBS, ...expandedFromFile, ...expandedExtra]);
}

export async function getScannerIgnoreNames(rootPath: string, extra: string[] = []): Promise<Set<string>> {
  const fromFile = await readIgnorePatterns(rootPath);
  const names = [
    ...DEFAULT_SCANNER_IGNORE_NAMES,
    ...fromFile.map((pattern) => extractScannerName(pattern)).filter((v): v is string => !!v),
    ...extra.map((pattern) => extractScannerName(pattern)).filter((v): v is string => !!v),
  ];
  return new Set(dedupe(names));
}

