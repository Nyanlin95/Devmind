#!/usr/bin/env node

/**
 * DevMind CLI
 * Unified tool for database and codebase analysis
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import * as fs from 'fs';
import { registerAllCommands } from './cli/register-all.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

const program = new Command();

program
  .name('devmind')
  .description('Unified developer assistant for database and codebase context')
  .version(pkg.version);

registerAllCommands(program);

program.parse();
