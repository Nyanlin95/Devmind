import * as path from 'path';
import * as fs from 'fs';
import { readFileSafe } from '../core/index.js';

interface DesignSystemProfile {
  name?: string;
  version?: string;
  allowedComponentImports?: string[];
  tokenSources?: string[];
  requiredWrappers?: string[];
  bannedRegexRules?: Array<{
    id?: string;
    pattern?: string;
    message?: string;
  }>;
}

export interface DesignAuditFinding {
  severity: 'error' | 'warn';
  rule: string;
  file?: string;
  message: string;
}

function isLikelyUiFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return (
    normalized.endsWith('.tsx') ||
    normalized.endsWith('.jsx') ||
    normalized.includes('/components/') ||
    normalized.includes('/ui/') ||
    normalized.includes('/pages/') ||
    normalized.includes('/app/')
  );
}

function collectImports(content: string): string[] {
  const values = new Set<string>();
  const importFromRegex = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = importFromRegex.exec(content)) !== null) values.add(match[1]);
  while ((match = dynamicImportRegex.exec(content)) !== null) values.add(match[1]);
  return [...values];
}

function isUiLibraryImport(value: string): boolean {
  const uiCandidates = [
    '@mui/',
    '@material-ui/',
    'antd',
    '@chakra-ui/',
    'semantic-ui-react',
    'rebass',
    'theme-ui',
    '@headlessui/',
  ];
  return uiCandidates.some((candidate) => value === candidate || value.startsWith(candidate));
}

export async function collectDesignAuditFindings(
  rootPath: string,
  designSystemPath: string,
  fileContents: Map<string, string>,
): Promise<DesignAuditFinding[]> {
  const designFindings: DesignAuditFinding[] = [];
  if (!fs.existsSync(designSystemPath)) return designFindings;

  try {
    const parsed = JSON.parse(await readFileSafe(designSystemPath)) as DesignSystemProfile;
    const uiFileContents = new Map<string, string>();
    for (const [relPath, content] of fileContents.entries()) {
      if (isLikelyUiFile(relPath) || relPath.endsWith('.css') || relPath.endsWith('.scss')) {
        uiFileContents.set(relPath, content);
      }
    }

    const bannedRules = (parsed.bannedRegexRules || []).filter(
      (rule) => !!rule.pattern && !!rule.id,
    );
    const compiledBannedRules = bannedRules.flatMap((rule) => {
      try {
        return [
          {
            rule,
            regex: new RegExp(rule.pattern as string, 'm'),
          },
        ];
      } catch {
        designFindings.push({
          severity: 'warn',
          rule: rule.id as string,
          message: `Invalid regex pattern skipped: ${rule.pattern}`,
        });
        return [];
      }
    });
    for (const [relPath, content] of uiFileContents.entries()) {
      for (const { rule, regex } of compiledBannedRules) {
        if (regex.test(content)) {
          designFindings.push({
            severity: 'error',
            rule: rule.id as string,
            file: relPath,
            message: rule.message || `Matched banned pattern: ${rule.pattern}`,
          });
        }
      }
    }

    const tokenSources = parsed.tokenSources || [];
    for (const tokenSource of tokenSources) {
      const abs = path.resolve(rootPath, tokenSource);
      if (!fs.existsSync(abs)) {
        designFindings.push({
          severity: 'warn',
          rule: 'token-source-missing',
          file: tokenSource,
          message: 'Token source path not found.',
        });
      }
    }

    const wrappers = parsed.requiredWrappers || [];
    if (wrappers.length > 0) {
      const appShellCandidates = [...uiFileContents.entries()].filter(([file]) =>
        /(app|root|layout|provider)s?\.(tsx|jsx|ts|js)$/i.test(path.basename(file)),
      );
      const shellContent = appShellCandidates.map(([, content]) => content).join('\n');
      for (const wrapper of wrappers) {
        if (!shellContent.includes(wrapper)) {
          designFindings.push({
            severity: 'warn',
            rule: 'required-wrapper',
            message: `Required wrapper not detected in app/root/layout/provider files: ${wrapper}`,
          });
        }
      }
    }

    const allowList = parsed.allowedComponentImports || [];
    if (allowList.length > 0) {
      for (const [file, content] of uiFileContents.entries()) {
        if (!isLikelyUiFile(file)) continue;
        const imports = collectImports(content);
        const disallowed = imports.filter((value) => {
          if (!isUiLibraryImport(value)) return false;
          return !allowList.some((allowed) => value === allowed || value.startsWith(`${allowed}/`));
        });
        for (const importPath of disallowed) {
          designFindings.push({
            severity: 'warn',
            rule: 'allowed-component-imports',
            file,
            message: `Import not in allowedComponentImports: ${importPath}`,
          });
        }
      }
    }
  } catch (error) {
    designFindings.push({
      severity: 'error',
      rule: 'profile-parse',
      message: `Failed to parse design-system.json: ${(error as Error).message}`,
    });
  }
  return designFindings;
}

export function buildDesignAuditReport(
  designSystemPath: string,
  findings: DesignAuditFinding[],
): string {
  let designReport = '# Design System Audit Report\n\n';
  designReport += `Generated: ${new Date().toISOString()}\n\n`;
  designReport += `- Profile: \`${designSystemPath}\`\n`;
  designReport += `- Findings: ${findings.length}\n`;
  designReport += `- Errors: ${findings.filter((f) => f.severity === 'error').length}\n`;
  designReport += `- Warnings: ${findings.filter((f) => f.severity === 'warn').length}\n\n`;

  if (findings.length === 0) {
    designReport += 'No design-system violations detected.\n';
  } else {
    for (const finding of findings) {
      designReport += `## ${finding.severity.toUpperCase()} - ${finding.rule}\n\n`;
      designReport += `${finding.message}\n\n`;
      if (finding.file) {
        designReport += `File: \`${finding.file}\`\n\n`;
      }
    }
  }
  return designReport;
}
