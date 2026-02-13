import * as path from 'path';
import * as fs from 'fs';
import { scanDirectory, FileNode } from '../codebase/index.js';
import { logger } from '../core/index.js';

interface ContextSearchResult {
  file: string;
  line: number;
  text: string;
}

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
    logger.info(`Searching context for: ${options.query}`);
    const results = await searchContextFiles(path.join(cwd, '.devmind'), options.query);
    if (results.length === 0) {
      console.log(`No context matches found for "${options.query}" in .devmind.`);
      return;
    }

    console.log(`# Context Search: ${options.query}\n`);
    for (const result of results) {
      console.log(`- ${result.file}:${result.line} ${result.text}`);
    }
    return;
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
    const icon = n.type === 'directory' ? '[D]' : '[F]';
    const meta = n.type === 'file' && n.size ? ` (${(n.size / 1024).toFixed(1)}KB)` : '';

    output += `${indent}- ${icon} ${n.name}${meta}\n`;

    // Show exports for files if available (Context Slicing helper)
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

async function searchContextFiles(rootDir: string, query: string): Promise<ContextSearchResult[]> {
  const results: ContextSearchResult[] = [];
  const needle = query.trim().toLowerCase();
  if (!needle) return results;
  if (!fs.existsSync(rootDir)) return results;

  const stack = [rootDir];
  const maxResults = 50;
  while (stack.length > 0 && results.length < maxResults) {
    const current = stack.pop();
    if (!current) break;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
      const entry = entries[idx];
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(md|json|ya?ml|txt|log)$/i.test(entry.name)) continue;

      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let idx = 0; idx < lines.length && results.length < maxResults; idx += 1) {
        const line = lines[idx];
        if (!line.toLowerCase().includes(needle)) continue;
        results.push({
          file: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
          line: idx + 1,
          text: line.trim().slice(0, 220),
        });
      }
    }
  }

  return results;
}
