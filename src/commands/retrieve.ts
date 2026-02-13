import * as path from 'path';
import { createHash } from 'crypto';
import { logger, readFileSafe, createProfiler } from '../core/index.js';
import type { IndexSection } from '../generators/unified.js';

interface RetrieveOptions {
  output?: string;
  query: string;
  type?: string;
  tags?: string;
  limit?: string | number;
  maxWords?: string | number;
  json?: boolean;
  profile?: boolean;
}

interface RetrievalCandidate {
  section: IndexSection;
  stage1Score: number;
  content: string;
  score: number;
}

function isJsonFlagEnabled(
  options: RetrieveOptions & { opts?: () => { json?: boolean } },
): boolean {
  if (options.json === true) return true;
  try {
    return options.opts?.().json === true;
  } catch {
    return false;
  }
}

function jsonFail(message: string): void {
  console.log(
    JSON.stringify(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

function metadataScore(section: IndexSection, tokens: string[]): number {
  const haystack =
    `${section.id} ${section.title} ${section.type} ${section.tags.join(' ')}`.toLowerCase();
  let score = section.priority === 'high' ? 2 : section.priority === 'medium' ? 1 : 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 3;
  }
  return score;
}

function contentScore(content: string, tokens: string[]): number {
  const lc = content.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lc.includes(token)) score += 2;
  }
  return score;
}

function parseIndexSections(indexContent: string): IndexSection[] {
  const parsed = JSON.parse(indexContent) as { sections?: IndexSection[] };
  return parsed.sections || [];
}

function sliceByLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  return lines
    .slice(startLine - 1, endLine)
    .join('\n')
    .trim();
}

function parseTags(tagsRaw?: string): string[] {
  if (!tagsRaw) return [];
  return tagsRaw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function clampInt(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export async function retrieve(options: RetrieveOptions): Promise<void> {
  const jsonMode = isJsonFlagEnabled(
    options as RetrieveOptions & { opts?: () => { json?: boolean } },
  );
  const profiler = createProfiler(!!options.profile);
  const outputDir = options.output || '.devmind';
  const query = options.query || '';
  const tokens = tokenize(query);
  const typeFilter = options.type?.toLowerCase();
  const tagFilter = parseTags(options.tags);
  const limit = clampInt(options.limit, 6);
  const maxWords = clampInt(options.maxWords, 1400);

  const indexPath = path.join(outputDir, 'index.json');
  const agentsPath = path.join(outputDir, 'AGENTS.md');

  let indexSections: IndexSection[] = [];
  let agentsContent = '';
  try {
    indexSections = parseIndexSections(
      await profiler.section('retrieve.loadIndex', async () => readFileSafe(indexPath)),
    );
    agentsContent = await profiler.section('retrieve.loadAgents', async () =>
      readFileSafe(agentsPath),
    );
  } catch (error) {
    const message = `Failed to load retrieval files in ${outputDir}. Run "devmind scan" or "devmind generate --all".`;
    if (jsonMode) {
      jsonFail(message);
      return;
    }
    logger.error(message);
    return;
  }

  if (indexSections.length === 0) {
    const message = 'No section metadata found in index.json. Regenerate context first.';
    if (jsonMode) {
      jsonFail(message);
      return;
    }
    logger.error(message);
    return;
  }

  let filtered = indexSections.filter((section) => {
    if (typeFilter && section.type !== typeFilter) return false;
    if (
      tagFilter.length > 0 &&
      !tagFilter.every((tag) => section.tags.map((t) => t.toLowerCase()).includes(tag))
    ) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            success: true,
            query,
            outputDir,
            selected: [],
            message: 'No sections matched the requested filters.',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    }
    logger.warn('No sections matched the requested filters.');
    return;
  }

  // Stage 1: metadata filter + ranking
  filtered = filtered
    .map((section) => ({ section, stage1Score: metadataScore(section, tokens) }))
    .sort(
      (a, b) =>
        b.stage1Score - a.stage1Score ||
        a.section.id.localeCompare(b.section.id) ||
        a.section.startLine - b.section.startLine,
    )
    .slice(0, Math.min(24, filtered.length))
    .map((item) => item.section);

  // Stage 2: content ranking
  const ranked: RetrievalCandidate[] = filtered.map((section) => {
    const content = sliceByLines(agentsContent, section.startLine, section.endLine);
    const hash = hashContent(content);
    if (hash !== section.contentHash) {
      if (!jsonMode) {
        logger.warn(`Section hash mismatch for ${section.id}; consider regenerating context.`);
      }
    }
    const score = metadataScore(section, tokens) * 2 + contentScore(content, tokens);
    return {
      section,
      stage1Score: metadataScore(section, tokens),
      content,
      score,
    };
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.stage1Score - a.stage1Score ||
      a.section.id.localeCompare(b.section.id) ||
      a.section.startLine - b.section.startLine,
  );
  const selected = ranked.slice(0, limit);

  const picked: RetrievalCandidate[] = [];
  let wordBudget = 0;
  for (const item of selected) {
    const words = item.content.split(/\s+/).filter(Boolean).length;
    if (wordBudget + words > maxWords && picked.length > 0) continue;
    picked.push(item);
    wordBudget += words;
  }

  if (jsonMode) {
    const profile = profiler.report();
    console.log(
      JSON.stringify(
        profile
          ? {
              query,
              outputDir,
              selected: picked.map((item) => ({
                id: item.section.id,
                title: item.section.title,
                type: item.section.type,
                tags: item.section.tags,
                source: item.section.source,
                startLine: item.section.startLine,
                endLine: item.section.endLine,
                score: item.score,
                content: item.content,
              })),
              profile,
            }
          : {
              query,
              outputDir,
              selected: picked.map((item) => ({
                id: item.section.id,
                title: item.section.title,
                type: item.section.type,
                tags: item.section.tags,
                source: item.section.source,
                startLine: item.section.startLine,
                endLine: item.section.endLine,
                score: item.score,
                content: item.content,
              })),
            },
        null,
        2,
      ),
    );
    return;
  }

  let output = '# Retrieved Context\n\n';
  output += `Query: ${query || '(none)'}\n`;
  output += `Selected sections: ${picked.length}\n\n`;

  for (const item of picked) {
    output += `## ${item.section.title}\n\n`;
    output += `- ID: \`${item.section.id}\`\n`;
    output += `- Type: \`${item.section.type}\`\n`;
    output += `- Tags: ${item.section.tags.map((tag) => `\`${tag}\``).join(', ') || '(none)'}\n`;
    output += `- Source: \`${item.section.source}\`\n`;
    output += `- Lines: \`${item.section.startLine}-${item.section.endLine}\`\n\n`;
    output += `${item.content}\n\n`;
  }

  console.log(output.trim());
  const profile = profiler.report();
  if (profile) {
    logger.info('Performance Profile');
    logger.info(`Total: ${profile.totalMs.toFixed(1)}ms`);
    for (const step of profile.steps) {
      logger.info(`- ${step.name}: ${step.ms.toFixed(1)}ms`);
    }
  }
}
