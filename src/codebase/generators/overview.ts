/**
 * Generate project overview documentation
 */

import { generateTree } from '../utils/tree.js';
import { countFilesAndLines } from '../utils/stats.js';
import { FileNode } from '../scanners/filesystem.js';

export function generateOverview(structure: FileNode, projectRoot: string): string {
  const stats = countFilesAndLines(structure);

  return `# Project Overview

## Summary
- **Root**: ${projectRoot}
- **Generated**: ${new Date().toISOString()}
- **Languages**: ${stats.languages.join(', ') || 'Unknown'}
- **Total Files**: ${stats.files}
- **Total Directories**: ${stats.dirs}
- **Estimated Lines**: ${stats.lines}

## Project Structure (Tree View)

\`\`\`
${generateTree(structure)}
\`\`\`

## Key Entry Points
${stats.entryPoints.length > 0 ? stats.entryPoints.map((ep) => `- \`${ep}\``).join('\n') : '_No entry points detected_'}

## Technology Stack
${stats.languages.map((lang) => `- ${lang}`).join('\n')}

## Purpose
_Edit this file to describe your project's purpose and goals._
`;
}
