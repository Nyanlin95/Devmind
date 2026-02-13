import * as fs from 'fs';
import * as path from 'path';
import type { FileNode } from '../scanners/filesystem.js';
import {
  extractArchitectureSignals,
  renderArchitectureSignalsMarkdown,
  type ArchitectureSignals,
} from './architecture-extractor.js';

function describeLayer(name: string): string {
  const key = name.toLowerCase();
  if (key === 'src') return 'Primary application and CLI source code';
  if (key === 'tests') return 'Automated tests and fixtures';
  if (key === 'docs') return 'Project documentation';
  if (key === 'integrations') return 'Tool and ecosystem integrations';
  if (key === 'scripts') return 'Operational and helper scripts';
  if (key === 'memory') return 'Manual memory/context assets';
  if (key === '.devmind') return 'Generated context artifacts';
  if (key === 'dist') return 'Build output';
  return 'Project module/directory';
}

function topLevelDirectoryTable(structure: FileNode): string {
  const directories = (structure.children || [])
    .filter((node) => node.type === 'directory')
    .map((node) => node.name)
    .sort((a, b) => a.localeCompare(b));

  if (directories.length === 0) return '_No top-level directories detected._';

  const rows = directories.map((name) => `| \`${name}/\` | ${describeLayer(name)} |`);
  return ['| Layer | Description |', '|---|---|', ...rows].join('\n');
}

function summarizeDataFlow(signals: ArchitectureSignals): string {
  const parts: string[] = [];
  if (signals.routes.length > 0) parts.push(`${signals.routes.length} route signal(s)`);
  if (signals.apiCalls.length > 0) parts.push(`${signals.apiCalls.length} API call site(s)`);
  if (signals.websockets.length > 0) parts.push(`${signals.websockets.length} websocket setup(s)`);
  if (signals.socketEvents.length > 0)
    parts.push(`${signals.socketEvents.length} socket event usage(s)`);
  if (signals.hooks.length > 0) parts.push(`${signals.hooks.length} hook usage(s)`);

  if (parts.length === 0) {
    return 'No major runtime interaction signals were detected in source files.';
  }

  return `Detected ${parts.join(', ')}.`;
}

function summarizePatterns(signals: ArchitectureSignals): string {
  const lines: string[] = [];
  if (signals.routes.some((route) => route.source === 'express')) {
    lines.push('- HTTP route handlers via Express/router method declarations');
  }
  if (signals.routes.some((route) => route.source === 'next')) {
    lines.push('- File-based or handler-based routing patterns consistent with Next.js');
  }
  if (signals.routes.some((route) => route.source === 'react-router')) {
    lines.push('- Client-side route declarations consistent with React Router');
  }
  if (signals.apiCalls.length > 0) {
    lines.push('- External/internal API integrations via `fetch`, `axios`, or client wrappers');
  }
  if (signals.websockets.length > 0 || signals.socketEvents.length > 0) {
    lines.push('- Realtime communication patterns via WebSocket/socket events');
  }
  if (signals.hooks.some((hook) => hook.kind === 'custom')) {
    lines.push('- Custom hook abstractions used in React code');
  }

  if (lines.length === 0) {
    return '- No strong architectural patterns auto-detected from code signals.';
  }
  return lines.join('\n');
}

function dependencySummary(rootPath: string): string {
  const packagePath = path.join(rootPath, 'package.json');
  if (!fs.existsSync(packagePath)) return '_No package.json found._';

  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(parsed.dependencies || {});
    const devDependencies = Object.keys(parsed.devDependencies || {});

    const topDependencies = dependencies.slice(0, 12);
    const topDevDependencies = devDependencies.slice(0, 12);

    const lines: string[] = [];
    lines.push(`- Runtime dependencies: ${dependencies.length}`);
    if (topDependencies.length > 0) {
      lines.push(
        `- Key runtime packages: ${topDependencies.map((name) => `\`${name}\``).join(', ')}`,
      );
    }
    lines.push(`- Dev dependencies: ${devDependencies.length}`);
    if (topDevDependencies.length > 0) {
      lines.push(
        `- Key dev packages: ${topDevDependencies.map((name) => `\`${name}\``).join(', ')}`,
      );
    }
    return lines.join('\n');
  } catch {
    return '_Failed to parse package.json dependencies._';
  }
}

export function generateArchitecture(structure: FileNode, projectRoot: string): string {
  const signals = extractArchitectureSignals(projectRoot);

  return `# Architecture

## Directory Structure

${topLevelDirectoryTable(structure)}

## Data Flow

${summarizeDataFlow(signals)}

## Key Patterns

${summarizePatterns(signals)}

## Runtime Interaction Signals

${renderArchitectureSignalsMarkdown(signals)}

## Dependencies

${dependencySummary(projectRoot)}
`;
}
