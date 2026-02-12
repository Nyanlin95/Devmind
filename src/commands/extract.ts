import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { logger, ensureDir, writeFileSafe, readFileSafe } from '../core/index.js';

interface ExtractOptions {
  output?: string;
  path?: string;
  apply?: boolean;
  json?: boolean;
  silent?: boolean;
}

export interface ExtractedLearning {
  category: string;
  content: string;
}

export interface ExtractResult {
  extracted: number;
  report: string;
  applied: boolean;
  learnPath: string | null;
}

function normalizeSentence(input: string): string {
  return input.trim().replace(/\s+/g, ' ').replace(/[.;:,]+$/, '');
}

function inferCategory(content: string): string {
  const lc = content.toLowerCase();
  if (lc.includes('index') || lc.includes('query') || lc.includes('sql')) return 'database';
  if (lc.includes('cache') || lc.includes('latency') || lc.includes('batch')) return 'performance';
  if (lc.includes('auth') || lc.includes('permission') || lc.includes('tenant')) return 'security';
  if (lc.includes('module') || lc.includes('service') || lc.includes('layer')) return 'architecture';
  return 'codebase';
}

function collectFromAnalysisFiles(content: string): ExtractedLearning[] {
  const lines = content.split('\n').map((line) => line.trim());
  const output: ExtractedLearning[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('>')) continue;
    if (line.startsWith('- [ ]')) continue;
    if (!line.startsWith('- ')) continue;
    const clean = normalizeSentence(line.replace(/^-+\s*/, ''));
    if (clean.length < 20) continue;
    output.push({
      category: inferCategory(clean),
      content: clean,
    });
  }

  return output;
}

function collectFromSourceComments(content: string): ExtractedLearning[] {
  const output: ExtractedLearning[] = [];
  const patterns = [
    /(?:TODO|NOTE|IMPORTANT|WARNING)\s*[:\-]\s*(.+)/gi,
    /@decision\s+(.+)/gi,
    /@pattern\s+(.+)/gi,
  ];

  for (const pattern of patterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const text = normalizeSentence(match[1] || '');
      if (text.length < 20) continue;
      output.push({
        category: inferCategory(text),
        content: text,
      });
    }
  }

  return output;
}

function dedupeLearnings(items: ExtractedLearning[]): ExtractedLearning[] {
  const seen = new Set<string>();
  const output: ExtractedLearning[] = [];
  for (const item of items) {
    const key = item.content.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function appendToLearnFile(outputDir: string, learnings: ExtractedLearning[]): Promise<string> {
  const learnPath = path.join(outputDir, 'memory', 'LEARN.md');
  await ensureDir(path.dirname(learnPath));

  let existing = '';
  try {
    existing = await readFileSafe(learnPath);
  } catch {
    existing =
      '# Project Learnings\n\n> Accumulated technical learnings, architectural decisions, and discovered patterns.\n\n';
  }

  let block = '';
  const timestamp = new Date().toISOString();
  for (const item of learnings) {
    block += `## ${timestamp} - ${item.category}\n\n${item.content}\n\n---\n`;
  }

  await writeFileSafe(learnPath, `${existing}${block}`);
  return learnPath;
}

export async function runExtraction(options: ExtractOptions): Promise<ExtractResult> {
  const outputDir = options.output || '.devmind';
  const rootPath = path.resolve(options.path || '.');
  const candidates: ExtractedLearning[] = [];

  const analysisDir = path.join(outputDir, 'analysis');
  const analysisFiles = ['CODE_DB_MAPPING.md', 'UNUSED_TABLES.md', 'AUDIT_REPORT.md'];
  for (const file of analysisFiles) {
    const filePath = path.join(analysisDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = await readFileSafe(filePath);
      candidates.push(...collectFromAnalysisFiles(content));
    } catch {
      // ignore unreadable files
    }
  }

  const sourceFiles = await glob('**/*.{ts,tsx,js,jsx,py,go,java,rb,php,rs}', {
    cwd: rootPath,
    ignore: ['node_modules/**', '.git/**', '.devmind/**', 'dist/**', 'build/**'],
    nodir: true,
  });

  for (const relPath of sourceFiles) {
    const fullPath = path.join(rootPath, relPath);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      candidates.push(...collectFromSourceComments(content));
    } catch {
      // ignore unreadable files
    }
  }

  const extracted = dedupeLearnings(candidates).slice(0, 25);

  const reportPath = path.join(outputDir, 'analysis', 'EXTRACTED_LEARNINGS.md');
  await ensureDir(path.dirname(reportPath));
  let report = '# Extracted Learnings\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  if (extracted.length === 0) {
    report += 'No learning candidates were extracted.\n';
  } else {
    for (const item of extracted) {
      report += `## ${item.category}\n\n${item.content}\n\n`;
    }
  }
  await writeFileSafe(reportPath, report);

  let learnPath: string | null = null;
  if (options.apply && extracted.length > 0) {
    learnPath = await appendToLearnFile(outputDir, extracted);
  }

  return {
    extracted: extracted.length,
    report: reportPath,
    applied: !!options.apply,
    learnPath,
  };
}

export async function extract(options: ExtractOptions): Promise<void> {
  const result = await runExtraction(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!options.silent) {
    logger.info('Extraction complete.');
    logger.info(`Extracted learnings: ${result.extracted}`);
    logger.info(`Report: ${result.report}`);
    if (result.learnPath) {
      logger.info(`Appended to: ${result.learnPath}`);
    } else if (result.extracted > 0) {
      logger.info('Use --apply to append extracted learnings to memory/LEARN.md');
    }
  }
}
