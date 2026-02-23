/**
 * Filesystem scanner
 */

import * as fs from 'fs';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { parseSourceFile, CodeExport } from '../parsers/typescript.js';
import { logger } from '../../core/index.js';

const DEFAULT_IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'cohere-scan',
  '__pycache__',
  '.devmind',
  '.ai',
];
const IGNORED_FILES = [
  '.DS_Store',
  '.gitignore',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

const JS_TS_LANGUAGES = new Set([
  'TypeScript',
  'TypeScript React',
  'JavaScript',
  'JavaScript React',
]);
const MAX_PARSE_BYTES = 256 * 1024;

function shouldSkipAstParse(fileName: string, size: number): boolean {
  const lower = fileName.toLowerCase();
  if (size > MAX_PARSE_BYTES) return true;
  if (lower.includes('.min.')) return true;
  return false;
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path?: string;
  children?: FileNode[];
  language?: string;
  size?: number;
  exports?: (CodeExport | string)[];
}

export function detectLanguage(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript React',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.kt': 'Kotlin',
    '.kts': 'Kotlin Script',
    '.dart': 'Dart',
    '.sh': 'Shell',
    '.bash': 'Shell',
    '.zsh': 'Shell',
    '.sql': 'SQL',
    '.rs': 'Rust',
    '.java': 'Java',
    '.c': 'C',
    '.h': 'C Header',
    '.cpp': 'C++',
    '.cxx': 'C++',
    '.cc': 'C++',
    '.hpp': 'C++ Header',
    '.hh': 'C++ Header',
    '.cs': 'C#',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.vue': 'Vue',
    '.svelte': 'Svelte',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.yaml': 'YAML',
    '.yml': 'YAML',
  };
  return langMap[ext] || 'Unknown';
}

export function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

async function getFileSizeAsync(filePath: string): Promise<number> {
  try {
    const stats = await fsPromises.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

function createLimiter(maxConcurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (active >= maxConcurrency) return;
    const next = queue.shift();
    if (!next) return;
    next();
  };

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      runNext();
    }
  };
}

async function scanFileAsync(fullPath: string, entryName: string): Promise<FileNode | null> {
  if (IGNORED_FILES.includes(entryName)) return null;

  const lang = detectLanguage(entryName);
  let exports: (CodeExport | string)[] = [];
  let size = await getFileSizeAsync(fullPath);

  if (JS_TS_LANGUAGES.has(lang) && !shouldSkipAstParse(entryName, size)) {
    try {
      const content = await fsPromises.readFile(fullPath, 'utf-8');
      exports = parseSourceFile(fullPath, content);
    } catch (e: any) {
      logger.debug(`Failed to parse ${entryName}: ${e.message}`);
    }
  } else if (lang !== 'Unknown' && lang !== 'JSON' && lang !== 'YAML' && lang !== 'Markdown') {
    try {
      const content = await fsPromises.readFile(fullPath, 'utf-8');
      exports = extractExports(content);
    } catch {
      // Skip unreadable files
    }
  }

  return {
    name: entryName,
    type: 'file',
    language: lang,
    size,
    exports,
  };
}

export function scanDirectory(
  dir: string,
  depth: number = 0,
  maxDepth: number = 4,
  ignoredDirsInput?: Set<string>,
): FileNode {
  const ignoredDirs = ignoredDirsInput || new Set(DEFAULT_IGNORED_DIRS);
  return scanDirectoryWithIgnores(dir, depth, maxDepth, ignoredDirs);
}

function scanDirectoryWithIgnores(
  dir: string,
  depth: number,
  maxDepth: number,
  ignoredDirs: Set<string>,
): FileNode {
  if (depth > maxDepth) {
    return { name: path.basename(dir), type: 'directory', children: [] };
  }

  const items: FileNode[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        items.push(scanDirectoryWithIgnores(fullPath, depth + 1, maxDepth, ignoredDirs));
      } else if (entry.isFile()) {
        if (IGNORED_FILES.includes(entry.name)) continue;

        const lang = detectLanguage(entry.name);
        let exports: (CodeExport | string)[] = [];
        const size = getFileSize(fullPath);

        // Use AST parser for JS/TS
        if (JS_TS_LANGUAGES.has(lang) && !shouldSkipAstParse(entry.name, size)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            exports = parseSourceFile(fullPath, content);
          } catch (e: any) {
            logger.debug(`Failed to parse ${entry.name}: ${e.message}`);
          }
        } else if (
          lang !== 'Unknown' &&
          lang !== 'JSON' &&
          lang !== 'YAML' &&
          lang !== 'Markdown'
        ) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            exports = extractExports(content);
          } catch (e) {
            // Skip unreadable files
          }
        }

        items.push({
          name: entry.name,
          type: 'file',
          language: lang,
          size,
          exports: exports,
        });
      }
    }
  } catch (e: any) {
    logger.error(`Error scanning ${dir}: ${e.message}`);
  }

  return {
    name: path.basename(dir),
    type: 'directory',
    path: path.relative(process.cwd(), dir).replace(/\\/g, '/'),
    children: items,
  };
}

export async function scanDirectoryAsync(
  dir: string,
  depth: number = 0,
  maxDepth: number = 4,
  maxConcurrency: number = 24,
  ignoredDirsInput?: Set<string>,
): Promise<FileNode> {
  const ignoredDirs = ignoredDirsInput || new Set(DEFAULT_IGNORED_DIRS);
  const limit = createLimiter(maxConcurrency);

  async function walk(currentDir: string, currentDepth: number): Promise<FileNode> {
    if (currentDepth > maxDepth) {
      return { name: path.basename(currentDir), type: 'directory', children: [] };
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch (e: any) {
      logger.error(`Error scanning ${currentDir}: ${e.message}`);
      return {
        name: path.basename(currentDir),
        type: 'directory',
        path: path.relative(process.cwd(), currentDir).replace(/\\/g, '/'),
        children: [],
      };
    }

    const itemPromises = entries
      .filter((entry) => !ignoredDirs.has(entry.name))
      .map((entry) =>
        limit(async () => {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            return walk(fullPath, currentDepth + 1);
          }
          if (!entry.isFile()) return null;
          return scanFileAsync(fullPath, entry.name);
        }),
      );

    const items = (await Promise.all(itemPromises)).filter((item): item is FileNode => !!item);

    return {
      name: path.basename(currentDir),
      type: 'directory',
      path: path.relative(process.cwd(), currentDir).replace(/\\/g, '/'),
      children: items,
    };
  }

  return walk(dir, depth);
}

// Simple regex-based export extractor for non-JS/TS files or fallback
export function extractExports(content: string): string[] {
  const exports: string[] = [];
  const lines = content.split('\n');

  // Simple regex patterns for common languages
  const patterns = [
    /export\s+(?:const|function|class|interface|type)\s+(\w+)/g,
    /export\s+\{\s*([^}]+)\s*\}/g,
    /export\s+default\s+(?:function|class)?\s*(\w+)/g,
    // Add patterns for Python, Go, etc. if needed later
    /def\s+(\w+)/g, // Python function
    /class\s+(\w+)/g, // Python/Ruby class
    /fun\s+(\w+)\s*\(/g, // Kotlin function
    /(?:class|interface|object)\s+(\w+)/g, // Kotlin type/object
    /(?:class|enum|mixin|extension)\s+(\w+)/g, // Dart type
    /function\s+(\w+)\s*\(/g, // Shell/JS function
    /^(\w+)\s*\(\)\s*\{/gm, // Shell function form
    /create\s+(?:or\s+replace\s+)?(?:table|view|function)\s+([a-zA-Z0-9_.]+)/gi, // SQL DDL
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          // Handle comma-separated exports in { }
          if (match[0].includes('{')) {
            const names = match[1].split(',').map((n) => n.trim());
            exports.push(...names);
          } else {
            exports.push(match[1]);
          }
        }
      }
    }
  }

  return [...new Set(exports)].slice(0, 10);
}
