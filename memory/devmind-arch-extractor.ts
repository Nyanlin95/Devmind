#!/usr/bin/env tsx

import * as path from 'path';
import {
  extractArchitectureSignals,
  renderArchitectureSignalsMarkdown,
} from '../src/codebase/generators/architecture-extractor.ts';

function usage(): string {
  return [
    'Usage:',
    '  npx tsx memory/devmind-arch-extractor.ts <path> [--json]',
    '',
    'Examples:',
    '  npx tsx memory/devmind-arch-extractor.ts .',
    '  npx tsx memory/devmind-arch-extractor.ts . --json',
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return;
  }

  const jsonMode = args.includes('--json');
  const rootArg = args.find((arg) => !arg.startsWith('--')) || '.';
  const rootPath = path.resolve(rootArg);

  const signals = extractArchitectureSignals(rootPath);
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          routes: signals.routes,
          apiCalls: signals.apiCalls,
          websockets: signals.websockets,
          socketEvents: signals.socketEvents,
          hooks: signals.hooks,
        },
        null,
        2,
      ),
    );
    return;
  }

  const sections = [
    `# Architecture Extraction`,
    ``,
    `- Root: ${rootPath}`,
    `- Generated: ${new Date().toISOString()}`,
    ``,
    renderArchitectureSignalsMarkdown(signals).trim(),
  ];
  console.log(sections.join('\n'));
}

main();
