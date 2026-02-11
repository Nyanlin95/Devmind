/**
 * Generate a token-efficient "Skeleton" view of code modules
 */

import { FileNode } from '../scanners/filesystem.js';
import { CodeExport } from '../parsers/typescript.js';

/**
 * Generate a token-efficient "Skeleton" view of the module
 */
export function generateSkeleton(node: FileNode): string {
  if (!node.exports || node.exports.length === 0) return '';

  const lang = getLangId(node.language || '');

  // Handle legacy string exports or simple string array
  if (typeof node.exports[0] === 'string') {
    const exportsList = (node.exports as string[]).map((e) => 'export ' + e).join('\n');
    return '```' + lang + '\n// ' + node.name + '\n' + exportsList + '\n```';
  }

  // Handle AST exports (objects)
  const lines = ['// ' + node.name];
  const typedExports = node.exports as CodeExport[];

  typedExports.forEach((exp) => {
    if (exp.doc) {
      lines.push('/** ' + exp.doc + ' */');
    }

    if (exp.type === 'function') {
      lines.push('export ' + exp.signature + ';');
    } else if (exp.type === 'class') {
      lines.push('export class ' + exp.name + ' {');
      if (exp.methods) {
        exp.methods.forEach((m) => lines.push('  ' + m + ';'));
      }
      lines.push('}');
    } else if (exp.type === 'interface') {
      lines.push('export ' + (exp.signature || `interface ${exp.name}`) + ' { ... }');
    } else if (exp.type === 'variable') {
      lines.push('export ' + exp.signature + ';');
    } else if (exp.type === 'type') {
      lines.push('export ' + (exp.signature || `type ${exp.name}`) + ';');
    }
  });

  return '```' + lang + '\n' + lines.join('\n') + '\n```';
}

function getLangId(lang: string): string {
  const map: Record<string, string> = {
    TypeScript: 'ts',
    'TypeScript React': 'tsx',
    JavaScript: 'js',
    'JavaScript React': 'jsx',
    Python: 'py',
    Go: 'go',
    Rust: 'rs',
  };
  return map[lang] || '';
}
