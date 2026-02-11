import * as path from 'path';
import * as fs from 'fs';
import { scanDirectory, FileNode } from '../codebase/index.js';
import { logger } from '../core/index.js';

export async function context(options: { focus?: string; query?: string }): Promise<void> {
  const cwd = process.cwd();

  if (options.focus) {
    const targetPath = path.resolve(cwd, options.focus);

    if (!fs.existsSync(targetPath)) {
      logger.error(`Path not found: ${options.focus}`);
      return;
    }

    logger.info(`Generating focused context for: ${options.focus}`);
    const structure = scanDirectory(targetPath, 0, 2); // Depth 2 for focused view
    const summary = generateFocusedSummary(structure, options.focus);

    console.log(summary); // Output to stdout for agent to read
    return;
  }

  if (options.query) {
    // Simple keyword search in existing context files (placeholder for now)
    logger.info(`Searching context for: ${options.query}`);
    // TODO: Implement grep/search across .devmind/ files
    console.log(
      `> Context search for "${options.query}" not yet implemented. Use --focus <path> to see file structure.`,
    );
  }

  // Default: Show high-level map
  logger.info('No focus specified. Showing high-level project map.');
  const rootStructure = scanDirectory(cwd, 0, 1); // Depth 1 for root
  console.log(generateFocusedSummary(rootStructure, '.'));
}

function generateFocusedSummary(node: FileNode, relPath: string): string {
  let output = `# Context: ${relPath}\n\n`;

  function renderNode(n: FileNode, depth: number) {
    const indent = '  '.repeat(depth);
    const icon = n.type === 'directory' ? '📁' : '📄';
    const meta = n.type === 'file' && n.size ? ` (${(n.size / 1024).toFixed(1)}KB)` : '';

    output += `${indent}- ${icon} ${n.name}${meta}\n`;

    // Show exports for files if available (Context Slicing magic)
    if (n.type === 'file' && n.exports && n.exports.length > 0) {
      const exports = n.exports.map((e) => (typeof e === 'string' ? e : e.name)).slice(0, 5);
      output += `${indent}  - Exports: \`${exports.join(', ')}\`${n.exports.length > 5 ? '...' : ''}\n`;
    }

    if (n.children) {
      n.children.forEach((c) => renderNode(c, depth + 1));
    }
  }

  if (node.children) {
    node.children.forEach((c) => renderNode(c, 0));
  } else {
    output += '(Empty directory)\n';
  }

  return output;
}
