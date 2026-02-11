/**
 * Generate module documentation
 */

import * as path from 'path';
import { generateSkeleton } from './skeleton.js';
import { FileNode } from '../scanners/filesystem.js';

export interface ModuleDoc {
  path: string;
  content: string;
}

export function generateModuleDocs(structure: FileNode, outputDir: string): ModuleDoc[] {
  const docs: ModuleDoc[] = [];

  function processNode(node: FileNode, currentPath: string = '') {
    if (node.type === 'directory') {
      const hasFiles = node.children && node.children.some((c) => c.type === 'file');

      if (hasFiles && node.children) {
        const fileContent = node.children
          .filter((c) => c.type === 'file' && c.exports && c.exports.length > 0)
          .map((child) => generateSkeleton(child))
          .join('\n\n');

        if (fileContent) {
          const dirReadme = `# Module: ${node.name}

## Contents
${node.children.map((child) => `- \`${child.name}\``).join('\n')}

## Interface (Skeleton View)

${fileContent}
`;

          const relativePath = path.join('03-modules', currentPath, node.name);
          const fullPath = path.join(outputDir, relativePath, 'README.md');
          docs.push({ path: fullPath, content: dirReadme });
        }
      }

      if (node.children) {
        node.children.forEach((child) => processNode(child, path.join(currentPath, node.name)));
      }
    }
  }

  // Start processing from children to avoid creating a module doc for the root folder itself if it's just a container
  if (structure.children) {
    structure.children.forEach((child) => {
      if (child.type === 'directory' && !child.name.startsWith('.')) {
        processNode(child, '');
      }
    });
  }

  return docs;
}
