import * as path from 'path';
import { logger, readFileSafe, writeFileSafe, ensureDir } from '../core/index.js';
import { glob } from 'glob';
import * as fs from 'fs';

interface AnalyzeOptions {
  output?: string;
  path?: string;
}

interface TableUsage {
  tableName: string;
  files: string[];
  count: number;
}

export async function analyze(options: AnalyzeOptions): Promise<void> {
  const outputDir = options.output || '.devmind';
  const rootPath = options.path || '.';

  logger.info('Starting Cross-Context Analysis...');

  // 1. Load Schema
  const schemaPath = path.join(outputDir, 'database', 'schema.json');
  let schema: any;
  try {
    const schemaContent = await readFileSafe(schemaPath);
    schema = JSON.parse(schemaContent);
    logger.info(`Loaded schema: ${schema.tables.length} tables found.`);
  } catch (error) {
    logger.error('Failed to load schema.json. Run "devmind generate" first.');
    return;
  }

  // 2. Scan Codebase Files
  // We scan actual files instead of relying on structure.json to ensure fresh content
  logger.info(`Scanning files in: ${rootPath}`);
  const files = await glob('**/*.{ts,js,tsx,jsx,py,go,java,rb,php}', {
    cwd: rootPath,
    ignore: ['node_modules/**', '.devmind/**', 'dist/**', 'build/**'],
  });

  logger.info(`Analyzing ${files.length} source files...`);

  // 3. Analyze Usage
  const usage: TableUsage[] = [];
  const unusedTables: string[] = [];

  for (const table of schema.tables) {
    const tableName = table.name;
    const variations = [tableName, toPascalCase(tableName), toCamelCase(tableName)];

    // Remove duplicates
    const searchTerms = [...new Set(variations)];
    const matchedFiles: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(path.join(rootPath, file), 'utf-8');
      if (searchTerms.some((term) => content.includes(term))) {
        matchedFiles.push(file);
      }
    }

    if (matchedFiles.length > 0) {
      usage.push({
        tableName,
        files: matchedFiles,
        count: matchedFiles.length,
      });
    } else {
      unusedTables.push(tableName);
    }
  }

  // 4. Generate Reports
  const analysisDir = path.join(outputDir, 'analysis');
  await ensureDir(analysisDir);

  // CODE_DB_MAPPING.md
  let mappingContent = '# Code-to-Database Mapping\n\n';
  mappingContent += `**Generated:** ${new Date().toISOString()}\n\n`;

  // Most used tables first
  usage.sort((a, b) => b.count - a.count);

  for (const item of usage) {
    mappingContent += `### ${item.tableName} (${item.count} files)\n`;
    for (const file of item.files) {
      mappingContent += `- \`${file}\`\n`;
    }
    mappingContent += '\n';
  }

  await writeFileSafe(path.join(analysisDir, 'CODE_DB_MAPPING.md'), mappingContent);

  // UNUSED_TABLES.md
  if (unusedTables.length > 0) {
    let unusedContent = '# Unused Tables Report\n\n';
    unusedContent +=
      '> ⚠️ **Warning:** These tables were not found in the codebase. Verify manually before deleting.\n\n';
    for (const table of unusedTables) {
      unusedContent += `- [ ] ${table}\n`;
    }
    await writeFileSafe(path.join(analysisDir, 'UNUSED_TABLES.md'), unusedContent);
  }

  logger.success('Analysis Complete!');
  logger.info(`   - ${path.join(analysisDir, 'CODE_DB_MAPPING.md')}`);
  if (unusedTables.length > 0) {
    logger.info(`   - ${path.join(analysisDir, 'UNUSED_TABLES.md')}`);
  }
}

// Helpers
function toPascalCase(str: string): string {
  return str
    .replace(/_(\w)/g, (all, letter) => letter.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
