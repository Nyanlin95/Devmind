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

/**
 * Parse a TypeScript/JavaScript file and extract exported symbols with signatures
 */
export function parseFile(filePath: string): CodeExport[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return parseSourceFile(filePath, fileContent);
}

export function parseSourceFile(filePath: string, fileContent: string): CodeExport[] {
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);

  const exports: CodeExport[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (isExported(node)) {
      const details = extractDetails(node, sourceFile);
      if (details) {
        if (Array.isArray(details)) {
          exports.push(...details);
        } else {
          exports.push(details);
        }
      }
    }
  });

  return exports;
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
function extractDetails(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): CodeExport | CodeExport[] | null {
  // printer is not strictly needed if we just use getText() but keeping for compatibility with original logic if strictly needed
  // Original logic used printer for some things but mostly getText.

  switch (node.kind) {
    case ts.SyntaxKind.FunctionDeclaration: {
      const funcNode = node as ts.FunctionDeclaration;
      return {
        type: 'function',
        name: funcNode.name?.text || 'default',
        signature: getFunctionSignature(funcNode, sourceFile),
        doc: getJSDoc(funcNode),
      };
    }

    case ts.SyntaxKind.ClassDeclaration: {
      const classNode = node as ts.ClassDeclaration;
      return {
        type: 'class',
        name: classNode.name?.text || 'default',
        methods: getClassMembers(classNode, sourceFile),
        doc: getJSDoc(classNode),
      };
    }

    case ts.SyntaxKind.InterfaceDeclaration: {
      const interfaceNode = node as ts.InterfaceDeclaration;
      return {
        type: 'interface',
        name: interfaceNode.name.text,
        signature: `interface ${interfaceNode.name.text}`,
        doc: getJSDoc(interfaceNode),
      };
    }

    case ts.SyntaxKind.TypeAliasDeclaration: {
      const typeNode = node as ts.TypeAliasDeclaration;
      return {
        type: 'type',
        name: typeNode.name.text,
        signature: `type ${typeNode.name.text}`,
        doc: getJSDoc(typeNode),
      };
    }

    case ts.SyntaxKind.VariableStatement: {
      const varNode = node as ts.VariableStatement;
      const declarations: CodeExport[] = [];
      varNode.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          declarations.push({
            type: 'variable',
            name: decl.name.getText(sourceFile),
            signature: `const ${decl.name.getText(sourceFile)}`,
            doc: getJSDoc(varNode), // JSDoc is on the statement, not declaration usually
          });
        }
      });
      return declarations;
    }

    case ts.SyntaxKind.ExportAssignment: {
      const exportNode = node as ts.ExportAssignment;
      return {
        type: 'variable',
        name: 'default',
        signature: exportNode.getText(sourceFile),
        doc: getJSDoc(exportNode),
      };
    }

    default:
      return null;
  }
}

/**
 * Get clean function signature
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
