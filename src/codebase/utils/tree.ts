/**
 * Tree generation utility
 */

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  [key: string]: any;
}

export function generateTree(node: TreeNode, prefix: string = '', isLast: boolean = true): string {
  const connector = isLast ? '└── ' : '├── ';
  let result = prefix + connector + node.name + (node.type === 'directory' ? '/' : '') + '\n';

  if (node.children && node.children.length > 0) {
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      // Sort children: directories first, then files
      // This logic was not in original but is good practice for trees
      // However, to keep strict port, I'll trust input order or sort if needed later.
      // For now, adhering to original logic but adding types.

      if (node.children) {
        // Check again for TS strictness
        result += generateTree(child, newPrefix, index === node.children.length - 1);
      }
    });
  }

  return result;
}
