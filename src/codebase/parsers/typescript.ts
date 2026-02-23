/**
 * TypeScript/JavaScript parser utility
 */

import ts from 'typescript';
import * as fs from 'fs';

export interface CodeExport {
  type: 'function' | 'class' | 'interface' | 'type' | 'variable';
  name: string;
  signature?: string;
  doc?: string;
  methods?: string[];
}

interface ParserContext {
  sourceFile: ts.SourceFile;
}

interface ParserRule {
  id: string;
  apply: (node: ts.Node, context: ParserContext) => CodeExport | CodeExport[] | null;
}

type SourceParser = (filePath: string, fileContent: string) => CodeExport[];

const parserRegistry = new Map<string, SourceParser>();

/**
 * Parse a TypeScript/JavaScript file and extract exported symbols with signatures
 */
export function parseFile(filePath: string): CodeExport[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parseSourceFile(filePath, fileContent);
}

export function parseSourceFile(filePath: string, fileContent: string): CodeExport[] {
  const extension = getNormalizedExtension(filePath);
  const parser = parserRegistry.get(extension) || parseTsJsSource;
  return parser(filePath, fileContent);
}

function registerParser(extensions: string[], parser: SourceParser): void {
  for (const extension of extensions) {
    parserRegistry.set(extension, parser);
  }
}

function getNormalizedExtension(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.d.ts')) return '.d.ts';
  const dotIndex = lower.lastIndexOf('.');
  return dotIndex >= 0 ? lower.slice(dotIndex) : '';
}

const TS_JS_EXPORT_RULES: ParserRule[] = [
  {
    id: 'function',
    apply: (node, context) => {
      if (!ts.isFunctionDeclaration(node)) return null;
      return {
        type: 'function',
        name: node.name?.text || 'default',
        signature: getFunctionSignature(node, context.sourceFile),
        doc: getJSDoc(node),
      };
    },
  },
  {
    id: 'class',
    apply: (node, context) => {
      if (!ts.isClassDeclaration(node)) return null;
      return {
        type: 'class',
        name: node.name?.text || 'default',
        methods: getClassMembers(node, context.sourceFile),
        doc: getJSDoc(node),
      };
    },
  },
  {
    id: 'interface',
    apply: (node) => {
      if (!ts.isInterfaceDeclaration(node)) return null;
      return {
        type: 'interface',
        name: node.name.text,
        signature: `interface ${node.name.text}`,
        doc: getJSDoc(node),
      };
    },
  },
  {
    id: 'type',
    apply: (node) => {
      if (!ts.isTypeAliasDeclaration(node)) return null;
      return {
        type: 'type',
        name: node.name.text,
        signature: `type ${node.name.text}`,
        doc: getJSDoc(node),
      };
    },
  },
  {
    id: 'variable',
    apply: (node, context) => {
      if (!ts.isVariableStatement(node)) return null;
      const declarations: CodeExport[] = [];
      node.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          declarations.push({
            type: 'variable',
            name: decl.name.getText(context.sourceFile),
            signature: `const ${decl.name.getText(context.sourceFile)}`,
            doc: getJSDoc(node),
          });
        }
      });
      return declarations;
    },
  },
  {
    id: 'export-assignment',
    apply: (node, context) => {
      if (!ts.isExportAssignment(node)) return null;
      return {
        type: 'variable',
        name: 'default',
        signature: node.getText(context.sourceFile),
        doc: getJSDoc(node),
      };
    },
  },
];

function parseTsJsSource(filePath: string, fileContent: string): CodeExport[] {
  const scriptKind = getScriptKindFromFilePath(filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const context: ParserContext = { sourceFile };
  const exports: CodeExport[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (!isExported(node)) return;
    for (const rule of TS_JS_EXPORT_RULES) {
      const details = rule.apply(node, context);
      if (!details) continue;
      if (Array.isArray(details)) {
        exports.push(...details);
      } else {
        exports.push(details);
      }
      break;
    }
  });

  return exports;
}

function getScriptKindFromFilePath(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/**
 * Check if a node is exported
 */
function isExported(node: ts.Node): boolean {
  const explicitExport =
    (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
  const defaultExport =
    ts.isExportAssignment(node) ||
    (ts.isFunctionDeclaration(node) &&
      !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) ||
    (ts.isClassDeclaration(node) &&
      !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));

  return explicitExport || defaultExport;
}

/**
 * Extract details from an exported node
 */
function getFunctionSignature(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): string {
  const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ');
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : '';
  const name = node.name?.text || 'default';

  return `function ${name}(${params})${returnType}`;
}

/**
 * Get public members of a class
 */
function getClassMembers(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): string[] {
  const members: string[] = [];
  node.members.forEach((member) => {
    // Only public members (default is public)
    const isPrivate = (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private) !== 0;
    const isProtected = (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Protected) !== 0;

    if (!isPrivate && !isProtected) {
      if (
        member.kind === ts.SyntaxKind.MethodDeclaration ||
        member.kind === ts.SyntaxKind.Constructor
      ) {
        const method = member as ts.MethodDeclaration | ts.ConstructorDeclaration;
        // Constructor doesn't have a name property in the same way, handle explicitly
        let name = 'constructor';
        if (ts.isMethodDeclaration(method) && method.name) {
          name = method.name.getText(sourceFile);
        }

        const params = method.parameters.map((p) => p.getText(sourceFile)).join(', ');
        const returnType = method.type ? `: ${method.type.getText(sourceFile)}` : '';
        members.push(`${name}(${params})${returnType}`);
      } else if (member.kind === ts.SyntaxKind.PropertyDeclaration) {
        members.push(member.getText(sourceFile));
      }
    }
  });
  return members;
}

/**
 * Extract JSDoc comments
 */
function getJSDoc(node: ts.Node): string {
  const jsDoc = (node as any).jsDoc; // jsDoc property exists on JSDocContainer nodes but not base interface
  if (jsDoc && jsDoc.length > 0) {
    return jsDoc[0].comment && typeof jsDoc[0].comment === 'string' ? jsDoc[0].comment : '';
  }
  return '';
}

registerParser(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'], parseTsJsSource);
