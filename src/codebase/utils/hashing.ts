/**
 * Codebase Hashing Utilities
 */

import { FileNode } from '../scanners/filesystem.js';
import * as crypto from 'crypto';

/**
 * Calculate a hash of the codebase structure and content (proxied by exports/size)
 */
export function calculateCodebaseHash(node: FileNode): string {
  const hash = crypto.createHash('sha256');
  updateHash(hash, node);
  return hash.digest('hex').substring(0, 32); // Return first 32 chars
}

function updateHash(hash: crypto.Hash, node: FileNode) {
  // Hash name and type
  hash.update(`${node.name}:${node.type}`);

  if (node.type === 'file') {
    // Hash size
    hash.update(`:${node.size || 0}`);

    // Hash exports if available
    if (node.exports && node.exports.length > 0) {
      hash.update(`:${JSON.stringify(node.exports)}`);
    }
  }

  // Recurse for directories
  if (node.children) {
    for (const child of node.children) {
      updateHash(hash, child);
    }
  }
}

/**
 * Get codebase statistics
 */
export function getCodebaseStats(node: FileNode): { files: number; loc: number } {
  let files = 0;
  // We don't track LOC directly in FileNode yet, so we'll use size as a rough proxy or just return 0 for now
  // If we want LOC, we'd need to read files or estimate.
  // Let's just track file count for now.

  function traverse(n: FileNode) {
    if (n.type === 'file') {
      files++;
    }
    if (n.children) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return { files, loc: 0 };
}
