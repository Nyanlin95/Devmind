import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { logger, ensureDir, readFileSafe, writeFileSafe } from '../core/index.js';

interface AuditOptions {
  output?: string;
  path?: string;
  json?: boolean;
}

interface LearningItem {
  timestamp: string;
  category: string;
  content: string;
}

interface AuditResult {
  learning: LearningItem;
  status: 'covered' | 'needs-review';
  matchedFiles: string[];
}

const STOPWORDS = new Set([
  'with',
  'from',
  'that',
  'this',
  'always',
  'never',
  'should',
  'would',
  'could',
  'must',
  'using',
  'across',
  'before',
  'after',
  'where',
  'when',
  'then',
  'they',
  'them',
  'into',
  'your',
  'ours',
  'their',
  'have',
  'has',
  'will',
  'been',
  'make',
  'more',
  'less',
]);

function parseLearnings(content: string): LearningItem[] {
  const sections = content
    .split('\n---')
    .map((section) => section.trim())
    .filter((section) => section.startsWith('## '));

  const parsed: LearningItem[] = [];
  for (const section of sections) {
    const lines = section.split('\n').filter((line) => line.trim().length > 0);
    const header = lines[0].replace(/^##\s+/, '');
    const match = header.match(/^(.+?)\s+-\s+(.+)$/);
    if (!match) continue;
    parsed.push({
      timestamp: match[1].trim(),
      category: match[2].trim(),
      content: lines.slice(1).join(' ').trim(),
    });
  }
  return parsed;
}

function buildKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  return [...new Set(tokens)].slice(0, 6);
}

function hasKeywordCoverage(content: string, keywords: string[]): boolean {
  const lc = content.toLowerCase();
  let hits = 0;
  for (const keyword of keywords) {
    if (lc.includes(keyword)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

export async function audit(options: AuditOptions): Promise<void> {
  const outputDir = options.output || '.devmind';
  const rootPath = path.resolve(options.path || '.');
  const learnPath = path.join(outputDir, 'memory', 'LEARN.md');

  if (!fs.existsSync(learnPath)) {
    logger.error(`Learning file not found: ${learnPath}`);
    logger.info('Run: devmind learn "..." or devmind extract --apply');
    return;
  }

  const learnContent = await readFileSafe(learnPath);
  const learnings = parseLearnings(learnContent);

  if (learnings.length === 0) {
    logger.warn('No learnings found to audit.');
    return;
  }

  const files = await glob('**/*.{ts,tsx,js,jsx,py,go,java,rb,php,rs}', {
    cwd: rootPath,
    ignore: ['node_modules/**', '.git/**', '.devmind/**', 'dist/**', 'build/**'],
    nodir: true,
  });

  const fileContents = new Map<string, string>();
  for (const relPath of files) {
    const absPath = path.join(rootPath, relPath);
    try {
      fileContents.set(relPath, fs.readFileSync(absPath, 'utf-8'));
    } catch {
      // Ignore unreadable files.
    }
  }

  const results: AuditResult[] = [];
  for (const learning of learnings) {
    const keywords = buildKeywords(learning.content);
    const matchedFiles: string[] = [];
    if (keywords.length > 0) {
      for (const [relPath, content] of fileContents.entries()) {
        if (hasKeywordCoverage(content, keywords)) {
          matchedFiles.push(relPath);
          if (matchedFiles.length >= 5) break;
        }
      }
    }
    results.push({
      learning,
      status: matchedFiles.length > 0 ? 'covered' : 'needs-review',
      matchedFiles,
    });
  }

  const covered = results.filter((r) => r.status === 'covered').length;
  const needsReview = results.length - covered;

  const reportPath = path.join(outputDir, 'analysis', 'AUDIT_REPORT.md');
  await ensureDir(path.dirname(reportPath));

  let report = '# Learning Audit Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `- Total learnings: ${results.length}\n`;
  report += `- Covered: ${covered}\n`;
  report += `- Needs review: ${needsReview}\n\n`;

  for (const item of results) {
    report += `## ${item.status === 'covered' ? 'Covered' : 'Needs Review'} - ${item.learning.category}\n\n`;
    report += `${item.learning.content}\n\n`;
    if (item.matchedFiles.length > 0) {
      report += 'Matched files:\n';
      for (const file of item.matchedFiles) {
        report += `- \`${file}\`\n`;
      }
      report += '\n';
    } else {
      report += 'Matched files: none\n\n';
    }
  }

  await writeFileSafe(reportPath, report);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          total: results.length,
          covered,
          needsReview,
          report: reportPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  logger.info('Learning audit complete.');
  logger.info(`Total: ${results.length}`);
  logger.info(`Covered: ${covered}`);
  logger.info(`Needs review: ${needsReview}`);
  logger.info(`Report: ${reportPath}`);
}
