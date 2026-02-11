/**
 * Statistics utility for codebase structure
 */

import { FileNode } from '../scanners/filesystem.js';

export interface CodebaseStats {
  files: number;
  dirs: number;
  lines: number;
  languages: string[];
  entryPoints: string[];
}

export function countFilesAndLines(node: FileNode): CodebaseStats {
  const stats: CodebaseStats = {
    files: 0,
    dirs: 0,
    lines: 0,
    languages: [],
    entryPoints: [],
  };

  const traverse = (n: FileNode) => {
    if (n.type === 'file') {
      stats.files++;
      // Estimate lines roughly if not available (file size / 30 bytes per line approx)
      // or set to 0 if unknown.
      // In a real scenario we might read the file, but for scanning we used size.
      // Let's assume 1 line per 30 bytes as a heuristic if we don't have line count.
      if (n.size) {
        stats.lines += Math.ceil(n.size / 30);
      }

      if (n.language) {
        if (!stats.languages.includes(n.language)) {
          stats.languages.push(n.language);
        }
      }

      const name = n.name.toLowerCase();
      if (
        [
          'index.tsx',
          'index.ts',
          'main.tsx',
          'main.ts',
          'app.js',
          'app.tsx',
          'index.js',
          'server.ts',
          'server.js',
        ].includes(name)
      ) {
        if (n.path) stats.entryPoints.push(n.path);
        else stats.entryPoints.push(n.name);
      }
    } else if (n.type === 'directory') {
      stats.dirs++;
      if (n.children) {
        n.children.forEach(traverse);
      }
    }
  };

  traverse(node);
  return stats;
}
