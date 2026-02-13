#!/usr/bin/env node

/**
 * SchemaWise CLI
 *
 * Generate AI-friendly database context documentation and validate SQL queries.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Command } from 'commander';
import * as fs from 'fs';
import { registerAllCommands } from './cli/register-all.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as {
  version: string;
};

const program = new Command();

program
  .name('devmind-db')
  .description('Database schema documentation and SQL query validation for AI coding assistants')
  .version(pkg.version);

registerAllCommands(program);

program.parse();

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
