/**
 * DevMind Codebase Scanner Package
 */

export * from './scanners/filesystem.js';
export * from './parsers/typescript.js';
export * from './generators/overview.js';
export * from './generators/architecture.js';
export * from './generators/modules.js';
export * from './generators/skeleton.js';
export * from './utils/tree.js';
export * from './utils/stats.js';
export * from './utils/hashing.js';

import { scanDirectory } from './scanners/filesystem.js';
import { generateOverview } from './generators/overview.js';
import { generateArchitecture } from './generators/architecture.js';
import { generateModuleDocs } from './generators/modules.js';
import { generateTree } from './utils/tree.js';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../core/index.js';

// High-level API for the CLI to use
export interface ScanResult {
  overview: string;
  architecture: string;
  modules: { path: string; content: string }[];
  tree: string;
  structure: any;
}

export async function scanCodebase(rootPath: string, outputDir: string): Promise<ScanResult> {
  logger.info(`Scanning codebase at: ${rootPath}`);

  const structure = scanDirectory(rootPath);

  logger.info('Generating documentation...');

  const overview = generateOverview(structure, rootPath);
  const architecture = generateArchitecture();
  const modules = generateModuleDocs(structure, outputDir);
  const tree = generateTree(structure);

  return {
    overview,
    architecture,
    modules,
    tree,
    structure,
  };
}

export async function saveScanResult(result: ScanResult, outputDir: string): Promise<void> {
  const { ensureDir, writeFileSafe } = await import('../core/index.js');

  // Ensure output directory exists
  await ensureDir(outputDir);

  // Write top-level documentation
  await writeFileSafe(path.join(outputDir, 'codebase-overview.md'), result.overview);
  await writeFileSafe(path.join(outputDir, 'architecture.md'), result.architecture);
  await writeFileSafe(path.join(outputDir, 'tree.md'), result.tree);

  // Write module documentation
  for (const doc of result.modules) {
    await ensureDir(path.dirname(doc.path));
    await writeFileSafe(doc.path, doc.content);
  }
}
