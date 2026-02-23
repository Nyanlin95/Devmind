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
  motion?: {
    reducedMotionRequired?: boolean;
    maxDurationMs?: number;
    forbidInfiniteAnimations?: boolean;
  };
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

function hasMotionUsage(content: string): boolean {
  return (
    /framer-motion|motion\./.test(content) ||
    /gsap\./.test(content) ||
    /lottie/i.test(content) ||
    /@keyframes|animation\s*:|transition\s*:/.test(content)
  );
}

function hasReducedMotionHandling(content: string): boolean {
  return (
    /prefers-reduced-motion/i.test(content) ||
    /useReducedMotion\s*\(/.test(content) ||
    /matchMedia\s*\(\s*['"`]\(prefers-reduced-motion: reduce\)/.test(content)
  );
}

function collectMotionFindings(
  uiFileContents: Map<string, string>,
  profile: DesignSystemProfile,
): DesignAuditFinding[] {
  const findings: DesignAuditFinding[] = [];
  const reducedMotionRequired = profile.motion?.reducedMotionRequired ?? true;
  const forbidInfinite = profile.motion?.forbidInfiniteAnimations ?? true;
  const maxDurationMs = profile.motion?.maxDurationMs ?? 900;

  let projectHasReducedMotion = false;
  for (const content of uiFileContents.values()) {
    if (hasReducedMotionHandling(content)) {
      projectHasReducedMotion = true;
      break;
    }
  }

  for (const [file, content] of uiFileContents.entries()) {
    if (!hasMotionUsage(content)) continue;

    if (/transition\s*:\s*['"]?all\b/i.test(content)) {
      findings.push({
        severity: 'warn',
        rule: 'motion-transition-all',
        file,
        message: 'Avoid `transition: all`; animate explicit properties (transform/opacity).',
      });
    }

    if (forbidInfinite && /(animation(?:-iteration-count)?\s*:[^;\n]*infinite\b)/i.test(content)) {
      findings.push({
        severity: 'warn',
        rule: 'motion-infinite-animation',
        file,
        message: 'Infinite animations detected; ensure opt-out and accessibility-safe behavior.',
      });
    }

    const durationMatches = [...content.matchAll(/(?:duration|transition-duration)\s*:\s*(\d+)ms/gi)];
    for (const match of durationMatches) {
      const duration = Number(match[1]);
      if (Number.isFinite(duration) && duration > maxDurationMs) {
        findings.push({
          severity: 'warn',
          rule: 'motion-duration-budget',
          file,
          message: `Animation duration ${duration}ms exceeds budget (${maxDurationMs}ms).`,
        });
      }
    }

    if (
      /(left|top|right|bottom|width|height)\s*:\s*[^;\n]+;/.test(content) &&
      /transition|animation/.test(content)
    ) {
      findings.push({
        severity: 'warn',
        rule: 'motion-layout-thrash-risk',
        file,
        message: 'Potential layout-thrashing animation properties detected; prefer transform/opacity.',
      });
    }
  }

  if (reducedMotionRequired && !projectHasReducedMotion) {
    findings.push({
      severity: 'warn',
      rule: 'motion-reduced-motion',
      message:
        'No reduced-motion handling detected (`prefers-reduced-motion` / `useReducedMotion`).',
    });
  }

  return findings;
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

    designFindings.push(...collectMotionFindings(uiFileContents, parsed));
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
