import * as path from 'path';
import { createHash } from 'crypto';
import { logger, readFileSafe, createProfiler } from '../core/index.js';
import type { IndexSection } from '../generators/unified.js';

interface RetrieveOptions {
  output?: string;
  query: string;
  type?: string;
  tags?: string;
  route?: string;
  level?: string | number;
  state?: boolean;
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
  criticalityScore: number;
}

interface RoutedContextChunk {
  route: 'auth' | 'db' | 'ui';
  level: 1 | 2 | 3;
  source: string;
  title: string;
  content: string;
}

interface ContractContextChunk {
  contract:
    | 'http'
    | 'middleware'
    | 'auth'
    | 'ui'
    | 'motion'
    | 'go'
    | 'python'
    | 'next'
    | 'php'
    | 'laravel';
  source: string;
  title: string;
  content: string;
}

interface DesignSystemContextChunk {
  source: string;
  title: string;
  content: string;
}

interface StateLogEntry {
  kind: 'decision' | 'hypothesis';
  timestamp: string;
  source?: string;
  note?: string | null;
  text: string;
  status?: 'open' | 'ruled-out' | 'confirmed';
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

function hasUiTokenSignal(tokens: string[]): boolean {
  const hasToken = tokens.includes('token') || tokens.includes('tokens');
  if (!hasToken) return false;
  return (
    tokens.includes('design') ||
    tokens.includes('theme') ||
    tokens.includes('spacing') ||
    tokens.includes('typography') ||
    tokens.includes('color') ||
    tokens.includes('colors') ||
    tokens.includes('component') ||
    tokens.includes('components')
  );
}

function hasAuthTokenSignal(tokens: string[]): boolean {
  const hasToken = tokens.includes('token') || tokens.includes('tokens');
  return hasToken && !hasUiTokenSignal(tokens);
}

function detectRoutes(tokens: string[]): Array<'auth' | 'db' | 'ui'> {
  const routes: Array<'auth' | 'db' | 'ui'> = [];
  const hasAny = (values: string[]) => values.some((value) => tokens.includes(value));

  const authSignal =
    hasAny(['auth', 'authentication', 'authorize', 'authorization', 'login']) ||
    hasAuthTokenSignal(tokens);
  if (authSignal) {
    routes.push('auth');
  }
  if (hasAny(['db', 'database', 'schema', 'sql', 'query', 'migration', 'postgres', 'mysql'])) {
    routes.push('db');
  }
  const uiSignal =
    hasAny([
      'ui',
      'ux',
      'frontend',
      'component',
      'layout',
      'design',
      'theme',
      'hydration',
      'ssr',
      'csr',
      'a11y',
      'accessibility',
      'form',
      'client',
      'server-component',
      'animation',
      'animations',
      'motion',
      'framer',
      'gsap',
      'lottie',
      'keyframe',
      'keyframes',
    ]) || hasUiTokenSignal(tokens);
  if (uiSignal) {
    routes.push('ui');
  }

  return routes;
}

function detectContractTargets(
  tokens: string[],
): Array<
  'http' | 'middleware' | 'auth' | 'ui' | 'motion' | 'go' | 'python' | 'next' | 'php' | 'laravel'
> {
  const targets: Array<
    'http' | 'middleware' | 'auth' | 'ui' | 'motion' | 'go' | 'python' | 'next' | 'php' | 'laravel'
  > = [];
  const hasAny = (values: string[]) => values.some((value) => tokens.includes(value));

  if (
    hasAny([
      'econnrefused',
      'eaddrinuse',
      'port',
      'listen',
      'upstream',
      'proxy',
      'http',
      'gateway',
      'basepath',
      'header',
    ])
  ) {
    targets.push('http');
  }

  if (
    hasAny([
      'middleware',
      'helper',
      'helpers',
      'signature',
      'next',
      'ctx',
      'req',
      'res',
      'wrapper',
    ])
  ) {
    targets.push('middleware');
  }

  const authContractSignal =
    hasAny([
      'auth',
      'jwt',
      'session',
      'claim',
      'claims',
      'sub',
      'aud',
      'iss',
      'scope',
      'roles',
      'permissions',
    ]) || hasAuthTokenSignal(tokens);
  if (authContractSignal) {
    targets.push('auth');
  }

  if (
    hasAny([
      'ui',
      'ux',
      'frontend',
      'component',
      'layout',
      'design',
      'theme',
      'hydration',
      'ssr',
      'csr',
      'a11y',
      'accessibility',
      'form',
      'validation',
      'server-component',
      'client-component',
    ])
    || hasUiTokenSignal(tokens)
  ) {
    targets.push('ui');
  }

  if (
    hasAny([
      'animation',
      'animations',
      'motion',
      'framer',
      'framer-motion',
      'gsap',
      'lottie',
      'keyframe',
      'keyframes',
      'spring',
      'tween',
      'timeline',
      'reduced-motion',
      'prefers-reduced-motion',
    ])
  ) {
    targets.push('motion');
  }

  if (hasAny(['go', 'golang', 'goroutine', 'gin', 'fiber', 'echo'])) {
    targets.push('go');
  }

  if (hasAny(['python', 'fastapi', 'django', 'flask', 'uvicorn', 'pydantic'])) {
    targets.push('python');
  }

  if (hasAny(['next', 'nextjs', 'next.js', 'app-router', 'route-handler', 'server-component'])) {
    targets.push('next');
  }

  if (hasAny(['php', 'php-fpm', 'composer'])) {
    targets.push('php');
  }

  if (hasAny(['laravel', 'eloquent', 'artisan', 'sanctum', 'passport'])) {
    targets.push('laravel');
  }

  return [...new Set(targets)];
}

function parseRouteOption(raw?: string): Array<'auth' | 'db' | 'ui'> {
  if (!raw) return [];
  const entries = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const routes: Array<'auth' | 'db' | 'ui'> = [];
  for (const entry of entries) {
    if (entry === 'auth' || entry === 'db' || entry === 'ui') {
      routes.push(entry);
    }
  }
  return [...new Set(routes)];
}

function detectEscalationLevel(tokens: string[], override?: string | number): 1 | 2 | 3 {
  if (override !== undefined) {
    const parsed = Number(override);
    if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
  }

  const level3Hints = [
    'refactor',
    'cross-module',
    'crossmodule',
    'migration',
    'migrate',
    'incident',
    'debug',
    'outage',
    'hotfix',
  ];
  if (level3Hints.some((hint) => tokens.includes(hint))) return 3;

  const level2Hints = [
    'modify',
    'change',
    'behavior',
    'invariant',
    'contract',
    'breaking',
    'semantics',
  ];
  if (level2Hints.some((hint) => tokens.includes(hint))) return 2;

  return 1;
}

function routeCandidatesForLevel(level: 1 | 2 | 3): Array<{ level: 1 | 2 | 3; file: string }> {
  const candidates: Array<{ level: 1 | 2 | 3; file: string }> = [{ level: 1, file: 'summary.md' }];
  if (level >= 2) candidates.push({ level: 2, file: 'details.md' });
  if (level >= 3) candidates.push({ level: 3, file: 'deep-dive.md' });
  return candidates;
}

function shouldIncludeState(tokens: string[], explicit?: boolean): boolean {
  if (explicit === true) return true;
  const stateHints = [
    'decision',
    'decisions',
    'hypothesis',
    'hypotheses',
    'assumption',
    'assumptions',
    'ruled-out',
    'ruled',
    'confirmed',
    'state',
    'context',
  ];
  return stateHints.some((hint) => tokens.includes(hint));
}

function maxStateEntriesForLevel(level: 1 | 2 | 3): number {
  if (level >= 3) return 10;
  if (level === 2) return 6;
  return 3;
}

function parseStateLogLines(
  content: string,
  kind: 'decision' | 'hypothesis',
  maxEntries: number,
): StateLogEntry[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: StateLogEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && parsed.length < maxEntries; i -= 1) {
    try {
      const raw = JSON.parse(lines[i]) as Record<string, unknown>;
      const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : new Date(0).toISOString();
      const textField =
        kind === 'decision'
          ? typeof raw.decision === 'string'
            ? raw.decision
            : ''
          : typeof raw.hypothesis === 'string'
            ? raw.hypothesis
            : '';
      if (!textField) continue;
      parsed.push({
        kind,
        timestamp,
        source: typeof raw.source === 'string' ? raw.source : undefined,
        note: typeof raw.note === 'string' ? raw.note : null,
        text: textField,
        status:
          kind === 'hypothesis' &&
          (raw.status === 'open' || raw.status === 'ruled-out' || raw.status === 'confirmed')
            ? raw.status
            : undefined,
      });
    } catch {
      // Skip malformed line.
    }
  }

  return parsed.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

async function loadStateEntries(
  outputDir: string,
  escalationLevel: 1 | 2 | 3,
): Promise<StateLogEntry[]> {
  const maxEntries = maxStateEntriesForLevel(escalationLevel);
  const entries: StateLogEntry[] = [];

  try {
    const decisionContent = await readFileSafe(path.join(outputDir, 'context', 'DECISIONS.jsonl'));
    entries.push(...parseStateLogLines(decisionContent, 'decision', maxEntries));
  } catch {
    // Optional file
  }

  try {
    const hypothesisContent = await readFileSafe(path.join(outputDir, 'context', 'HYPOTHESES.jsonl'));
    entries.push(...parseStateLogLines(hypothesisContent, 'hypothesis', maxEntries));
  } catch {
    // Optional file
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, maxEntries * 2);
}

async function loadContractContext(
  outputDir: string,
  contracts: Array<
    | 'http'
    | 'middleware'
    | 'auth'
    | 'ui'
    | 'motion'
    | 'go'
    | 'python'
    | 'next'
    | 'php'
    | 'laravel'
  >,
): Promise<ContractContextChunk[]> {
  const chunks: ContractContextChunk[] = [];
  for (const contract of contracts) {
    const relSource = `context/contracts/${contract}.md`;
    const fullPath = path.join(outputDir, relSource);
    try {
      const content = await readFileSafe(fullPath);
      if (!content.trim()) continue;
      chunks.push({
        contract,
        source: relSource,
        title: `${contract.toUpperCase()} Contract`,
        content: content.trim(),
      });
    } catch {
      // Optional file
    }
  }
  return chunks;
}

function shouldIncludeDesignSystem(tokens: string[], routes: Array<'auth' | 'db' | 'ui'>): boolean {
  if (routes.includes('ui')) return true;
  const uiHints = [
    'ui',
    'ux',
    'design-system',
    'component',
    'a11y',
    'accessibility',
    'hydration',
    'ssr',
    'csr',
  ];
  return uiHints.some((hint) => tokens.includes(hint)) || hasUiTokenSignal(tokens);
}

async function loadDesignSystemContext(outputDir: string): Promise<DesignSystemContextChunk | null> {
  const source = 'design-system.json';
  const fullPath = path.join(outputDir, source);
  let raw = '';
  try {
    raw = await readFileSafe(fullPath);
  } catch {
    return null;
  }
  if (!raw.trim()) return null;

  try {
    const parsed = JSON.parse(raw) as {
      name?: string;
      version?: string;
      allowedComponentImports?: string[];
      tokenSources?: string[];
      requiredWrappers?: string[];
      bannedRegexRules?: Array<{ id?: string; message?: string }>;
      motion?: {
        reducedMotionRequired?: boolean;
        maxDurationMs?: number;
        forbidInfiniteAnimations?: boolean;
      };
    };
    const lines = [
      `Design system: ${parsed.name || 'unnamed'} (v${parsed.version || 'n/a'})`,
      `Allowed component imports: ${(parsed.allowedComponentImports || []).join(', ') || '(none)'}`,
      `Token sources: ${(parsed.tokenSources || []).join(', ') || '(none)'}`,
      `Required wrappers: ${(parsed.requiredWrappers || []).join(', ') || '(none)'}`,
      `Banned rules: ${
        (parsed.bannedRegexRules || [])
          .map((rule) => `${rule.id || 'rule'}${rule.message ? ` (${rule.message})` : ''}`)
          .join('; ') || '(none)'
      }`,
      `Motion config: reducedMotionRequired=${parsed.motion?.reducedMotionRequired !== false}, maxDurationMs=${parsed.motion?.maxDurationMs || 900}, forbidInfiniteAnimations=${parsed.motion?.forbidInfiniteAnimations !== false}`,
    ];
    return {
      source,
      title: 'Design System Context',
      content: lines.join('\n'),
    };
  } catch {
    const snippet = raw.split(/\r?\n/).slice(0, 40).join('\n').trim();
    return {
      source,
      title: 'Design System Context',
      content: snippet || '(unreadable design-system content)',
    };
  }
}

function shouldLoadRefactorLedger(tokens: string[], includeState: boolean): boolean {
  if (includeState) return true;
  return tokens.includes('refactor') || tokens.includes('rewrite') || tokens.includes('migration');
}

async function loadRoutedContext(
  outputDir: string,
  routes: Array<'auth' | 'db' | 'ui'>,
  escalationLevel: 1 | 2 | 3,
): Promise<RoutedContextChunk[]> {
  const chunks: RoutedContextChunk[] = [];
  for (const route of routes) {
    const candidates = routeCandidatesForLevel(escalationLevel);
    for (const candidate of candidates) {
      const relSource = `context/${route}/${candidate.file}`;
      const fullPath = path.join(outputDir, relSource);
      try {
        const content = await readFileSafe(fullPath);
        if (!content.trim()) continue;
        chunks.push({
          route,
          level: candidate.level,
          source: relSource,
          title: `${route.toUpperCase()} Context (level-${candidate.level})`,
          content: content.trim(),
        });
      } catch {
        // Optional routed context files; skip missing/unreadable paths.
      }
    }
  }
  return chunks;
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

function criticalityScore(section: IndexSection, content: string, tokens: string[]): number {
  const criticalHints = [
    'invariant',
    'invariants',
    'constraint',
    'constraints',
    'edge-case',
    'edge-cases',
    'edge case',
    'migration',
    'migrations',
    'contract',
    'contracts',
    'decision',
    'decisions',
    'rollback',
  ];
  const sectionSignal =
    `${section.title} ${section.tags.join(' ')} ${section.source} ${section.type}`.toLowerCase();
  const contentSignal = content.toLowerCase();
  let score = 0;
  for (const hint of criticalHints) {
    if (sectionSignal.includes(hint)) score += 4;
    else if (contentSignal.includes(hint)) score += 2;
    if (tokens.includes(hint.replace(/\s+/g, '-')) || tokens.includes(hint.replace(/\s+/g, ''))) {
      if (sectionSignal.includes(hint) || contentSignal.includes(hint)) score += 2;
    }
  }

  if (section.priority === 'high') score += 1;
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
  const routeOverride = parseRouteOption(options.route);
  const routedTargets = routeOverride.length > 0 ? routeOverride : detectRoutes(tokens);
  const contractTargets = detectContractTargets(tokens);
  const escalationLevel = detectEscalationLevel(tokens, options.level);
  const includeState = shouldIncludeState(tokens, options.state);
  const includeLedger = shouldLoadRefactorLedger(tokens, includeState);
  const typeFilter = options.type?.toLowerCase();
  const tagFilter = parseTags(options.tags);
  const limit = clampInt(options.limit, 6);
  const maxWords = clampInt(options.maxWords, 1400);

  const indexPath = path.join(outputDir, 'index.json');
  const agentsPath = path.join(outputDir, 'AGENTS.md');

  let indexSections: IndexSection[] = [];
  let agentsContent = '';
  let routedChunks: RoutedContextChunk[] = [];
  let contractChunks: ContractContextChunk[] = [];
  let designSystemChunk: DesignSystemContextChunk | null = null;
  let stateEntries: StateLogEntry[] = [];
  let refactorLedger = '';
  try {
    indexSections = parseIndexSections(
      await profiler.section('retrieve.loadIndex', async () => readFileSafe(indexPath)),
    );
    agentsContent = await profiler.section('retrieve.loadAgents', async () =>
      readFileSafe(agentsPath),
    );
    routedChunks = await profiler.section('retrieve.loadRoutedContext', async () =>
      loadRoutedContext(outputDir, routedTargets, escalationLevel),
    );
    contractChunks = await profiler.section('retrieve.loadContractContext', async () =>
      loadContractContext(outputDir, contractTargets),
    );
    designSystemChunk = shouldIncludeDesignSystem(tokens, routedTargets)
      ? await profiler.section('retrieve.loadDesignSystemContext', async () =>
          loadDesignSystemContext(outputDir),
        )
      : null;
    stateEntries = includeState
      ? await profiler.section('retrieve.loadStateEntries', async () =>
          loadStateEntries(outputDir, escalationLevel),
        )
      : [];
    refactorLedger = includeLedger
      ? await profiler.section('retrieve.loadRefactorLedger', async () =>
          readFileSafe(path.join(outputDir, 'context', 'refactor-ledger.md')).catch(() => ''),
        )
      : '';
  } catch {
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
            routing: {
              routes: routedTargets,
              contracts: contractTargets,
              escalationLevel,
            },
            contracts: contractChunks,
            designSystem: designSystemChunk,
            routed: routedChunks,
            state: stateEntries,
            ledger: refactorLedger,
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

  const ranked: RetrievalCandidate[] = filtered.map((section) => {
    const content = sliceByLines(agentsContent, section.startLine, section.endLine);
    const hash = hashContent(content);
    if (hash !== section.contentHash) {
      if (!jsonMode) {
        logger.warn(`Section hash mismatch for ${section.id}; consider regenerating context.`);
      }
    }
    const criticalScore = criticalityScore(section, content, tokens);
    const score = metadataScore(section, tokens) * 2 + contentScore(content, tokens) + criticalScore;
    return {
      section,
      stage1Score: metadataScore(section, tokens),
      content,
      score,
      criticalityScore: criticalScore,
    };
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.criticalityScore - a.criticalityScore ||
      b.stage1Score - a.stage1Score ||
      a.section.id.localeCompare(b.section.id) ||
      a.section.startLine - b.section.startLine,
  );
  const selected = ranked.slice(0, limit);

  const routedPicked: RoutedContextChunk[] = [];
  let wordBudget = 0;
  const contractPicked: ContractContextChunk[] = [];
  for (const chunk of contractChunks) {
    const words = chunk.content.split(/\s+/).filter(Boolean).length;
    if (wordBudget + words > maxWords && contractPicked.length > 0) continue;
    contractPicked.push(chunk);
    wordBudget += words;
  }
  for (const chunk of routedChunks) {
    const words = chunk.content.split(/\s+/).filter(Boolean).length;
    if (wordBudget + words > maxWords && routedPicked.length > 0) continue;
    routedPicked.push(chunk);
    wordBudget += words;
  }

  const includeDesignSystem =
    !!designSystemChunk &&
    (wordBudget +
      designSystemChunk.content
        .split(/\s+/)
        .filter(Boolean).length <=
      maxWords ||
      (wordBudget === 0 && !!designSystemChunk));
  if (includeDesignSystem && designSystemChunk) {
    wordBudget += designSystemChunk.content.split(/\s+/).filter(Boolean).length;
  }

  const statePicked: StateLogEntry[] = [];
  for (const entry of stateEntries) {
    const words = entry.text.split(/\s+/).filter(Boolean).length;
    if (wordBudget + words > maxWords && statePicked.length > 0) continue;
    statePicked.push(entry);
    wordBudget += words;
  }

  const ledgerWords = refactorLedger.split(/\s+/).filter(Boolean).length;
  const includeLedgerInOutput = !!refactorLedger && (wordBudget + ledgerWords <= maxWords);
  if (includeLedgerInOutput) {
    wordBudget += ledgerWords;
  }

  const picked: RetrievalCandidate[] = [];
  const sectionLimit = Math.max(0, limit - routedPicked.length - contractPicked.length);
  for (const item of selected) {
    if (picked.length >= sectionLimit) break;
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
              routing: {
                routes: routedTargets,
                contracts: contractTargets,
                escalationLevel,
              },
              contracts: contractPicked,
              designSystem: includeDesignSystem ? designSystemChunk : null,
              routed: routedPicked,
              state: statePicked,
              ledger: includeLedgerInOutput ? refactorLedger : '',
              selected: picked.map((item) => ({
                id: item.section.id,
                title: item.section.title,
                type: item.section.type,
                tags: item.section.tags,
                source: item.section.source,
                startLine: item.section.startLine,
                endLine: item.section.endLine,
                score: item.score,
                criticalityScore: item.criticalityScore,
                content: item.content,
              })),
              profile,
            }
          : {
              query,
              outputDir,
              routing: {
                routes: routedTargets,
                contracts: contractTargets,
                escalationLevel,
              },
              contracts: contractPicked,
              designSystem: includeDesignSystem ? designSystemChunk : null,
              routed: routedPicked,
              state: statePicked,
              ledger: includeLedgerInOutput ? refactorLedger : '',
              selected: picked.map((item) => ({
                id: item.section.id,
                title: item.section.title,
                type: item.section.type,
                tags: item.section.tags,
                source: item.section.source,
                startLine: item.section.startLine,
                endLine: item.section.endLine,
                score: item.score,
                criticalityScore: item.criticalityScore,
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
  if (routedTargets.length > 0) {
    output += `Routing: ${routedTargets.map((target) => `\`${target}\``).join(', ')}\n`;
  }
  if (contractTargets.length > 0) {
    output += `Contracts: ${contractTargets.map((target) => `\`${target}\``).join(', ')}\n`;
  }
  if (includeDesignSystem && designSystemChunk) {
    output += 'Design system included: yes\n';
  }
  output += `Escalation level: ${escalationLevel}\n`;
  output += `State logs included: ${statePicked.length}\n`;
  output += `Selected sections: ${picked.length}\n\n`;

  if (routedPicked.length > 0) {
    output += '## Routed Context\n\n';
    for (const chunk of routedPicked) {
      output += `### ${chunk.title}\n\n`;
      output += `- Route: \`${chunk.route}\`\n`;
      output += `- Source: \`${chunk.source}\`\n\n`;
      output += `${chunk.content}\n\n`;
    }
  }

  if (contractPicked.length > 0) {
    output += '## Contract Context\n\n';
    for (const chunk of contractPicked) {
      output += `### ${chunk.title}\n\n`;
      output += `- Contract: \`${chunk.contract}\`\n`;
      output += `- Source: \`${chunk.source}\`\n\n`;
      output += `${chunk.content}\n\n`;
    }
  }

  if (includeDesignSystem && designSystemChunk) {
    output += '## Design System Context\n\n';
    output += `- Source: \`${designSystemChunk.source}\`\n\n`;
    output += `${designSystemChunk.content}\n\n`;
  }

  if (statePicked.length > 0) {
    output += '## State Log\n\n';
    for (const entry of statePicked) {
      output += `- [${entry.kind}] ${entry.timestamp}`;
      if (entry.status) output += ` | status=\`${entry.status}\``;
      if (entry.source) output += ` | source=\`${entry.source}\``;
      output += `\n`;
      output += `  ${entry.text}\n`;
      if (entry.note) output += `  note: ${entry.note}\n`;
      output += '\n';
    }
  }

  if (includeLedgerInOutput) {
    output += '## Refactor Ledger\n\n';
    output += `${refactorLedger}\n\n`;
  }

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
