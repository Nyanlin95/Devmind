import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { readFileSafe, writeFileSafe, ensureDir, logger } from '../core/index.js';

const START_MARKER = '<!-- devmind:auto-context:start -->';
const END_MARKER = '<!-- devmind:auto-context:end -->';
const SECTION_START = '<!-- devmind:section';
const SECTION_END = '<!-- /devmind:section';

type SectionType =
  | 'architecture'
  | 'database'
  | 'business-logic'
  | 'codebase'
  | 'design-system'
  | 'memory'
  | 'capabilities'
  | 'retrieval'
  | 'runbook';

interface UnifiedDocSection {
  id: string;
  title: string;
  type: SectionType;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  source: string;
  content: string;
}

export interface IndexSection {
  id: string;
  title: string;
  type: SectionType;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  source: string;
  startLine: number;
  endLine: number;
  contentHash: string;
}

interface ParsedSection {
  id: string;
  startLine: number;
  endLine: number;
  content: string;
}

interface DesignSystemProfile {
  name: string;
  version: string;
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

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

function serializeSectionMetadata(section: UnifiedDocSection): string {
  const tags = section.tags.join(',');
  return `${SECTION_START} id=${section.id} type=${section.type} priority=${section.priority} source=${section.source} tags=${tags} -->`;
}

function renderSection(section: UnifiedDocSection): string {
  return [
    serializeSectionMetadata(section),
    `## ${section.title}`,
    section.content.trim() || '(No context available)',
    `${SECTION_END} id=${section.id} -->`,
  ].join('\n');
}

function parseSectionsFromAgentsContent(agentsContent: string): ParsedSection[] {
  const lines = agentsContent.split('\n');
  const parsed: ParsedSection[] = [];
  const idRegex = /id=([a-z0-9._-]+)/i;

  let current: { id: string; startLine: number; contentLines: string[] } | null = null;
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (line.startsWith(SECTION_START)) {
      const idMatch = line.match(idRegex);
      if (!idMatch) return;
      current = {
        id: idMatch[1],
        startLine: lineNo + 1,
        contentLines: [],
      };
      return;
    }
    if (line.startsWith(SECTION_END)) {
      if (!current) return;
      parsed.push({
        id: current.id,
        startLine: current.startLine,
        endLine: lineNo - 1,
        content: current.contentLines.join('\n').trim(),
      });
      current = null;
      return;
    }
    if (current) current.contentLines.push(line);
  });

  return parsed;
}

async function replaceFile(tempPath: string, targetPath: string): Promise<void> {
  await fs.rm(targetPath, { force: true });
  await fs.rename(tempPath, targetPath);
}

async function ensureFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await writeFileSafe(filePath, content);
  }
}

function buildIndexSections(
  declaredSections: UnifiedDocSection[],
  parsedSections: ParsedSection[],
): IndexSection[] {
  const parsedById = new Map(parsedSections.map((section) => [section.id, section]));

  return declaredSections.map((declared) => {
    const parsed = parsedById.get(declared.id);
    if (!parsed) {
      throw new Error(`Missing section marker for id=${declared.id}`);
    }

    return {
      id: declared.id,
      title: declared.title,
      type: declared.type,
      tags: declared.tags,
      priority: declared.priority,
      source: declared.source,
      startLine: parsed.startLine,
      endLine: parsed.endLine,
      contentHash: hashContent(parsed.content),
    };
  });
}

function validateSectionSync(indexSections: IndexSection[], parsedSections: ParsedSection[]): void {
  const ids = new Set<string>();
  for (const section of indexSections) {
    if (ids.has(section.id)) {
      throw new Error(`Duplicate index section id=${section.id}`);
    }
    ids.add(section.id);
  }

  const parsedById = new Map(parsedSections.map((section) => [section.id, section]));
  for (const indexSection of indexSections) {
    const parsed = parsedById.get(indexSection.id);
    if (!parsed) {
      throw new Error(`Section not found in AGENTS.md: ${indexSection.id}`);
    }
    if (indexSection.startLine > indexSection.endLine) {
      throw new Error(`Invalid section line range for ${indexSection.id}`);
    }
    const parsedHash = hashContent(parsed.content);
    if (parsedHash !== indexSection.contentHash) {
      throw new Error(`Hash mismatch for section ${indexSection.id}`);
    }
  }
}

function buildAutoContextBlock(outputDir: string): string {
  const workspaceRoot = process.cwd();
  const agentsPath = toPosixPath(path.relative(workspaceRoot, path.join(outputDir, 'AGENTS.md')));
  const indexPath = toPosixPath(path.relative(workspaceRoot, path.join(outputDir, 'index.json')));

  return [
    START_MARKER,
    '## DevMind Auto Context',
    `- At session start, read \`${agentsPath}\` for project context.`,
    `- Then read \`${indexPath}\` to discover linked context files.`,
    '- If either file is missing or stale, run `devmind generate --all` or `devmind scan` first.',
    END_MARKER,
  ].join('\n');
}

export async function ensureWorkspaceAgentsBootstrap(outputDir: string): Promise<void> {
  const workspaceAgentsPath = path.join(process.cwd(), 'AGENTS.md');
  const block = buildAutoContextBlock(outputDir);

  const existing = await readFileSafe(workspaceAgentsPath).catch(() => '');
  const markerPattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'm');

  let nextContent: string;
  if (existing) {
    if (markerPattern.test(existing)) {
      nextContent = existing.replace(markerPattern, block);
    } else {
      const separator = existing.endsWith('\n') ? '\n' : '\n\n';
      nextContent = `${existing}${separator}${block}\n`;
    }
  } else {
    nextContent = `${block}\n`;
  }

  await writeFileSafe(workspaceAgentsPath, nextContent);
  logger.info(`Updated workspace AGENTS bootstrap: ${workspaceAgentsPath}`);
}

export async function generateUnifiedDocs(outputDir: string): Promise<void> {
  logger.info('Generating unified documentation...');

  const contextDir = path.join(outputDir, 'context');
  const memoryDir = path.join(outputDir, 'memory');

  const routeDefinitions: Record<'auth' | 'db' | 'ui', string> = {
    auth: '# Auth Summary\n\nDocument authentication and authorization invariants here.\n',
    db: '# DB Summary\n\nDocument database behavior and schema-sensitive rules here.\n',
    ui: '# UI Summary\n\nDocument UI state/interaction behavior and constraints here.\n',
  };
  for (const [route, summaryTemplate] of Object.entries(routeDefinitions)) {
    const routeDir = path.join(contextDir, route);
    await ensureDir(routeDir);
    await ensureFileIfMissing(path.join(routeDir, 'summary.md'), summaryTemplate);
    if (route === 'ui') {
      await ensureFileIfMissing(
        path.join(routeDir, 'details.md'),
        '# UI Details\n\nBehavior-level UI context for state, rendering flow, and interaction rules.\n',
      );
      await ensureFileIfMissing(
        path.join(routeDir, 'deep-dive.md'),
        '# UI Deep Dive\n\nCross-module UI refactor notes, invariants, and migration constraints.\n',
      );
    }
  }

  const contractsDir = path.join(contextDir, 'contracts');
  await ensureDir(contractsDir);
  await ensureFileIfMissing(
    path.join(contractsDir, 'http.md'),
    [
      '# HTTP Contract',
      '',
      '- Service ports: define canonical listen/exposed/proxy ports.',
      '- Base paths: define canonical API base paths.',
      '- Required headers: define auth/header format and ownership.',
      '- Env names: define canonical env vars for port binding.',
      '',
      '## Mapping Table',
      '| Layer | Setting | Value | Source |',
      '| --- | --- | --- | --- |',
      '| app | listen port | TBD | app config |',
      '| container | exposed port | TBD | container config |',
      '| proxy/gateway | upstream port | TBD | infra config |',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'middleware.md'),
    [
      '# Middleware Contract',
      '',
      '- Canonical signature: define one middleware signature and keep all helpers aligned.',
      '- Error strategy: define throw/return convention.',
      '- Response ownership: define whether middleware writes response or returns data.',
      '- Helper wrappers: list approved wrappers only.',
      '',
      '## Canonical Signature',
      '`(ctx, next)` (or project standard) - update all callsites consistently.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'auth.md'),
    [
      '# Auth Contract',
      '',
      '- Token types: define access/refresh/session usage.',
      '- Claim schema: define required claims (`sub`, `aud`, `iss`, `exp`, app claims).',
      '- Validation rules: define skew, rotation, and revocation behavior.',
      '- Enforcement points: define where auth is validated (gateway/service/both).',
      '',
      '## Claims',
      '- `sub`: principal id',
      '- `aud`: audience',
      '- `iss`: issuer',
      '- `exp`: expiration',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'ui.md'),
    [
      '# UI Contract',
      '',
      '- Routing boundaries: define page/route ownership and allowed cross-route coupling.',
      '- Data-fetch contract: define where loading/mutation happens and fallback behavior.',
      '- State ownership: define local/global/server state boundaries.',
      '- UX invariants: loading/empty/error patterns and accessibility requirements.',
      '- Design system usage: define allowed components, token sources, and wrapper requirements.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'motion.md'),
    [
      '# Motion Contract',
      '',
      '- Motion ownership: define where timeline/state-machine logic lives.',
      '- Accessibility: enforce `prefers-reduced-motion` strategy for animated interactions.',
      '- Performance: avoid layout-thrashing animation properties; prefer transform/opacity.',
      '- Invariants: define max duration, easing conventions, and infinite-loop restrictions.',
      '- Library boundaries: define allowed usage of Framer Motion/GSAP/Lottie and fallback behavior.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'go.md'),
    [
      '# Go/Golang Contract',
      '',
      '- Framework/runtime: document chosen HTTP/router stack (gin/fiber/echo/net-http).',
      '- Context propagation: define request context/timeouts/cancellation policy.',
      '- Middleware shape: define canonical middleware signature and ordering.',
      '- Error contract: define error wrapping/logging/status mapping.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'python.md'),
    [
      '# Python Contract',
      '',
      '- Framework/runtime: document FastAPI/Django/Flask conventions used.',
      '- Validation contract: document schema/typing layer (pydantic/dataclasses).',
      '- Middleware/dependency flow: define request lifecycle and auth hooks.',
      '- Error contract: define exception-to-response mapping.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'next.md'),
    [
      '# Next.js Contract',
      '',
      '- Router mode: App Router vs Pages Router and allowed usage boundaries.',
      '- Server/client split: define server component, client component, and route handler rules.',
      '- Auth/session handoff: define where token/session checks occur.',
      '- API contract: define route handler conventions and edge/runtime constraints.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'php.md'),
    [
      '# PHP Contract',
      '',
      '- Runtime: define php-fpm/web server assumptions and entrypoint flow.',
      '- Dependency contract: define composer package and autoload conventions.',
      '- Request lifecycle: define middleware/controller boundaries.',
      '- Error contract: define exception handling and response mapping.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contractsDir, 'laravel.md'),
    [
      '# Laravel Contract',
      '',
      '- Routing contract: define web/api route boundaries and middleware groups.',
      '- Auth contract: define Sanctum/Passport/session model and guards.',
      '- Data contract: define Eloquent model, policy, and resource conventions.',
      '- Queue/event contract: define async boundaries and retry semantics.',
      '',
    ].join('\n'),
  );
  await ensureFileIfMissing(
    path.join(contextDir, 'refactor-ledger.md'),
    [
      '# Refactor Ledger',
      '',
      '> Persistent refactor state: goals, constraints, hypotheses, decisions, and resolutions.',
      '',
    ].join('\n'),
  );

  // Read available contexts
  const schemaContext = await readFileSafe(
    path.join(outputDir, 'database', 'schema-overview.md'),
  ).catch(() => '');
  const codebaseOverview = await readFileSafe(
    path.join(outputDir, 'codebase', 'codebase-overview.md'),
  ).catch(() => '');
  const architecture = await readFileSafe(
    path.join(outputDir, 'codebase', 'architecture.md'),
  ).catch(() => '');
  const businessLogic = await readFileSafe(
    path.join(outputDir, 'database', 'BUSINESS_LOGIC.md'),
  ).catch(() => '');
  const learnings = await readFileSafe(path.join(memoryDir, 'LEARN.md')).catch(() => '');
  const designSystemRaw = await readFileSafe(path.join(outputDir, 'design-system.json')).catch(
    () => '',
  );

  let designSystemProfile: DesignSystemProfile | null = null;
  if (designSystemRaw) {
    try {
      designSystemProfile = JSON.parse(designSystemRaw) as DesignSystemProfile;
    } catch (error) {
      logger.warn(`Failed to parse design-system.json: ${(error as Error).message}`);
    }
  }

  const sourceMap = {
    architecture: 'codebase/architecture.md',
    database: 'database/schema-overview.md',
    businessLogic: 'database/BUSINESS_LOGIC.md',
    codebase: 'codebase/codebase-overview.md',
    designSystem: 'design-system.json',
    learnings: 'memory/LEARN.md',
  };

  const capabilityContent = `
<tools>
  <tool name="devmind-scan">
    <description>Scan codebase structure and generate QMD summary.</description>
  </tool>
  <tool name="devmind-analyze">
    <description>Analyze code-to-database usage patterns.</description>
  </tool>
  <tool name="devmind-status">
    <description>Check context freshness and get the recommended next command.</description>
  </tool>
  <tool name="devmind-audit">
    <description>Audit codebase coverage against recorded learnings.</description>
  </tool>
  <tool name="devmind-extract">
    <description>Extract learning candidates from code and analysis artifacts.</description>
  </tool>
  <tool name="devmind-autosave">
    <description>Persist session journal/context and auto-apply extracted learnings.</description>
  </tool>
  <tool name="devmind-retrieve">
    <description>Retrieve focused context using index metadata filters, routed summaries, and escalation levels.</description>
  </tool>
  <tool name="devmind-design-system">
    <description>Initialize or inspect design-system.json used for UI alignment auditing and agent guidance.</description>
  </tool>
  <tool name="devmind-learn">
    <description>Save a new technical learning, pattern, or architectural decision to LEARN.md.</description>
    <arguments>
      <arg name="learning">The knowledge to save</arg>
      <arg name="category">Category (architecture, database, etc)</arg>
    </arguments>
  </tool>
  <tool name="devmind-context">
    <description>Get focused context for a specific directory or module.</description>
    <arguments>
      <arg name="focus">Path to focus on</arg>
    </arguments>
  </tool>
</tools>
`.trim();

  const designSystemContent = designSystemProfile
    ? `
Design system profile: \`${designSystemProfile.name || 'unnamed'}\` (v${designSystemProfile.version || 'n/a'})

- Allowed component imports: ${(designSystemProfile.allowedComponentImports || []).map((value) => `\`${value}\``).join(', ') || '(none configured)'}
- Token sources: ${(designSystemProfile.tokenSources || []).map((value) => `\`${value}\``).join(', ') || '(none configured)'}
- Required wrappers: ${(designSystemProfile.requiredWrappers || []).map((value) => `\`${value}\``).join(', ') || '(none configured)'}
- Banned rules: ${
        (designSystemProfile.bannedRegexRules || [])
          .map((rule) => `\`${rule.id || 'rule'}\` (${rule.message || 'no message'})`)
          .join('; ') || '(none configured)'
      }
- Motion config: reducedMotionRequired=\`${designSystemProfile.motion?.reducedMotionRequired !== false}\`, maxDurationMs=\`${designSystemProfile.motion?.maxDurationMs || 900}\`, forbidInfiniteAnimations=\`${designSystemProfile.motion?.forbidInfiniteAnimations !== false}\`
`.trim()
    : 'No design-system profile found. Run `devmind design-system --init` and customize `.devmind/design-system.json`.';

  const runbookContent = `
### Agent Runbook (Auto Workflow, Recommendation Drift Control)
1. Automatically run \`devmind status --json\` at session start.
2. If context is stale/missing, automatically run the returned \`recommendedCommand\` (drift control remains recommendation-based).
3. Automatically re-run \`devmind status --json\` and continue when context is fresh.
4. Perform the requested coding task.
5. Automatically run \`devmind autosave --source task-end\` at task end (journal + session context + learnings apply).
6. Optionally run \`devmind extract --json\` for a verbose extraction report.

### Working Rules
- **Context:** Read this file first, then linked files from \`index.json\`.
- **Retrieve:** Use routing + escalation contract below before loading deeper context files.
- **Style:** Follow patterns in \`architecture.md\` and module docs.
- **Database:** Run \`devmind analyze\` or \`devmind validate\` before risky schema changes.
- **Memory:** Use \`LEARN.md\` to keep decisions consistent across sessions.

### CLI Flow Playbook
- Session start: \`devmind status --json\`, run \`recommendedCommand\` when stale, re-check status.
- Build codebase context: \`devmind scan -p . -o .devmind\`.
- Build database context: \`devmind generate --db -o .devmind\`.
- Unified generation: \`devmind generate --all -p . -o .devmind\`.
- Deterministic retrieval: \`devmind retrieve -q "<intent>" [--route auth|db|ui] [--level 1|2|3] [--state] --json\`.
- Analysis loop: \`devmind analyze\`, \`devmind audit\`, \`devmind extract --apply\`.
- Refactor/rewrite loop: record \`--goal\`, \`--non-negotiable\`, \`--open-question\`, \`--failure\`, \`--resolution\` via \`devmind autosave\`.
- Task end: \`devmind autosave --source task-end\`.
`.trim();

  const retrievalContractContent = `
Purpose:
This file defines HOW to retrieve context, not the context itself.

Routing rules:
- If query/error contains ECONNREFUSED/port/listen/upstream/proxy -> load \`/context/contracts/http.md\` first.
- If query/error contains middleware/helper/signature/next/ctx/req/res -> load \`/context/contracts/middleware.md\` first.
- If query/error contains auth/token/jwt/session/claims -> load \`/context/contracts/auth.md\` first.
- If query/error contains ui/ux/frontend/component/layout/hydration/ssr/csr/design-token/a11y -> load \`/context/contracts/ui.md\` first.
- If query/error contains animation/motion/framer/gsap/lottie/keyframes/reduced-motion -> load \`/context/contracts/motion.md\` first.
- If query/error contains go/golang/goroutine/gin/fiber/echo -> load \`/context/contracts/go.md\` first.
- If query/error contains python/fastapi/django/flask/pydantic -> load \`/context/contracts/python.md\` first.
- If query/error contains next/nextjs/next.js/app-router/server-component -> load \`/context/contracts/next.md\` first.
- If query/error contains php/composer/php-fpm -> load \`/context/contracts/php.md\` first.
- If query/error contains laravel/eloquent/artisan/sanctum/passport -> load \`/context/contracts/laravel.md\` first.
- Then load routed summaries:
  - auth -> /context/auth/summary.md
  - db -> /context/db/summary.md
  - ui -> /context/ui/summary.md

Escalation:
- Load level-2 only if modifying behavior or invariants.
- Load level-3 only for cross-module refactor, migrations, or incident/debug.
- For refactor/rewrite/migration tasks, load \`/context/refactor-ledger.md\` and recent decisions/hypotheses.
`.trim();

  const sections: UnifiedDocSection[] = [
    {
      id: 'architecture.overview',
      title: 'Architecture',
      type: 'architecture',
      tags: ['architecture', 'layers', 'patterns'],
      priority: 'high',
      source: sourceMap.architecture,
      content: architecture || '(No architecture context available)',
    },
    {
      id: 'database.schema',
      title: 'Database Schema',
      type: 'database',
      tags: ['database', 'schema', 'tables'],
      priority: 'high',
      source: sourceMap.database,
      content: schemaContext
        ? 'See schema-overview.md for details.'
        : '(No database context available)',
    },
    {
      id: 'business.logic',
      title: 'Business Logic',
      type: 'business-logic',
      tags: ['business', 'rules', 'domain'],
      priority: 'medium',
      source: sourceMap.businessLogic,
      content: businessLogic || '(No business logic detected)',
    },
    {
      id: 'codebase.overview',
      title: 'Codebase Overview',
      type: 'codebase',
      tags: ['codebase', 'modules', 'entrypoints'],
      priority: 'high',
      source: sourceMap.codebase,
      content: codebaseOverview || '(No codebase overview available)',
    },
    {
      id: 'memory.learnings',
      title: 'Project Learnings',
      type: 'memory',
      tags: ['memory', 'learnings', 'decisions'],
      priority: 'medium',
      source: sourceMap.learnings,
      content: learnings || '(No learnings recorded)',
    },
    {
      id: 'ui.design-system',
      title: 'Design System',
      type: 'design-system',
      tags: ['ui', 'design-system', 'components', 'tokens'],
      priority: 'high',
      source: sourceMap.designSystem,
      content: designSystemContent,
    },
    {
      id: 'agent.capabilities',
      title: 'Agent Capabilities',
      type: 'capabilities',
      tags: ['tools', 'capabilities', 'commands'],
      priority: 'medium',
      source: 'devmind-tools.json',
      content: capabilityContent,
    },
    {
      id: 'context.retrieval',
      title: 'Context Retrieval Contract',
      type: 'retrieval',
      tags: ['context', 'retrieval', 'routing', 'escalation'],
      priority: 'high',
      source: 'AGENTS.md',
      content: retrievalContractContent,
    },
    {
      id: 'agent.runbook',
      title: 'Instructions',
      type: 'runbook',
      tags: ['runbook', 'workflow', 'status', 'autosave'],
      priority: 'high',
      source: 'AGENTS.md',
      content: runbookContent,
    },
  ];

  // Generate AGENTS.md (Consolidated Context in QMD Format)
  const agentsContent = `
# Project Context

> Generated by DevMind for AI Agents (Claude, Cursor, Windsurf)

${sections.map((section) => renderSection(section)).join('\n\n')}

---
`.trim();
  const parsedSections = parseSectionsFromAgentsContent(agentsContent);
  const indexSections = buildIndexSections(sections, parsedSections);
  validateSectionSync(indexSections, parsedSections);

  // Generate unified index.json
  const index = {
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    contexts: {
      agents: 'AGENTS.md',
      schema: 'database/schema-overview.md',
      codebase: 'codebase/codebase-overview.md',
      architecture: 'codebase/architecture.md',
      designSystem: 'design-system.json',
      retrieval: 'context',
      learnings: 'memory/LEARN.md',
    },
    metadata: {
      hasDatabase: !!schemaContext,
      hasCodebase: !!codebaseOverview,
      hasDesignSystem: !!designSystemProfile,
    },
    sections: indexSections,
  };

  const agentsPath = path.join(outputDir, 'AGENTS.md');
  const indexPath = path.join(outputDir, 'index.json');
  const agentsTempPath = `${agentsPath}.tmp`;
  const indexTempPath = `${indexPath}.tmp`;

  await writeFileSafe(agentsTempPath, agentsContent);
  await writeFileSafe(indexTempPath, JSON.stringify(index, null, 2));

  await replaceFile(agentsTempPath, agentsPath);
  await replaceFile(indexTempPath, indexPath);

  logger.success('Unified documentation generated:');
  logger.info(`   - ${path.join(outputDir, 'AGENTS.md')}`);

  // Generate devmind-tools.json (Tool Definitions for Agents)
  const tools = [
    {
      name: 'devmind_scan',
      description:
        'Scans the codebase to generate an up-to-date structural overview and architecture summary. Use this when you need to understand the project structure or find specific files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The root path to scan (default: current directory)',
          },
        },
      },
    },
    {
      name: 'devmind_analyze',
      description:
        'Analyzes the codebase for database table usage. Returns a report mapping tables to files and identifying unused tables. Use this before modifying the database schema.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The root path to analyze (default: current directory)',
          },
        },
      },
    },
    {
      name: 'devmind_status',
      description:
        'Checks context freshness and returns a recommended next command when generated context is stale or missing.',
      parameters: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Context output directory (default: .devmind)',
          },
          path: {
            type: 'string',
            description: 'Root path for source freshness checks (default: current directory)',
          },
        },
      },
    },
    {
      name: 'devmind_audit',
      description:
        'Audits codebase coverage against recorded learnings in memory/LEARN.md and writes an audit report.',
      parameters: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Context output directory (default: .devmind)',
          },
          path: {
            type: 'string',
            description: 'Root path to audit (default: current directory)',
          },
        },
      },
    },
    {
      name: 'devmind_extract',
      description:
        'Extracts learning candidates from analysis artifacts and source comments, with optional apply to LEARN.md.',
      parameters: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Context output directory (default: .devmind)',
          },
          path: {
            type: 'string',
            description: 'Root path to scan for comments (default: current directory)',
          },
          apply: {
            type: 'boolean',
            description: 'Append extracted learning candidates into memory/LEARN.md',
          },
        },
      },
    },
    {
      name: 'devmind_autosave',
      description:
        'Persists crash-safe session journal/context, decision+hypothesis state, refactor ledger entries, and auto-applies extracted learnings.',
      parameters: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Context output directory (default: .devmind)',
          },
          path: {
            type: 'string',
            description: 'Root path for extraction (default: current directory)',
          },
          source: {
            type: 'string',
            description: 'Autosave source label (e.g., task-end, scan, generate)',
          },
          note: {
            type: 'string',
            description: 'Optional note attached to journal/context state',
          },
          decision: {
            type: 'string',
            description: 'Optional decision text to append into context decision log',
          },
          hypothesis: {
            type: 'string',
            description: 'Optional hypothesis text to append into context hypothesis log',
          },
          hypothesis_status: {
            type: 'string',
            description: 'Optional hypothesis status (open, ruled-out, confirmed)',
          },
          goal: {
            type: 'string',
            description: 'Optional refactor/rewrite goal to append into refactor ledger',
          },
          non_negotiable: {
            type: 'string',
            description: 'Optional non-negotiable invariant to append into refactor ledger',
          },
          open_question: {
            type: 'string',
            description: 'Optional unresolved question to append into refactor ledger',
          },
          failure: {
            type: 'string',
            description: 'Optional encountered failure mode to append into refactor ledger',
          },
          resolution: {
            type: 'string',
            description: 'Optional resolution to append into refactor ledger',
          },
        },
      },
    },
    {
      name: 'devmind_retrieve',
      description:
        'Performs deterministic retrieval using contract docs, routed summaries, AGENTS sections, and escalation levels.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Retrieval query',
          },
          output: {
            type: 'string',
            description: 'Context output directory (default: .devmind)',
          },
          type: {
            type: 'string',
            description: 'Optional section type filter',
          },
          tags: {
            type: 'string',
            description: 'Optional comma-separated tags filter',
          },
          route: {
            type: 'string',
            description: 'Optional comma-separated routed context targets (auth,db,ui)',
          },
          level: {
            type: 'number',
            description: 'Optional escalation level override (1,2,3)',
          },
          state: {
            type: 'boolean',
            description: 'Include decision/hypothesis state logs when available',
          },
          limit: {
            type: 'number',
            description: 'Max sections to return (default: 6)',
          },
          max_words: {
            type: 'number',
            description: 'Approximate max words in output (default: 1400)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'devmind_design_system',
      description:
        'Initializes or reads the design system profile used to keep UI code aligned with component/token policies.',
      parameters: {
        type: 'object',
        properties: {
          output: {
            type: 'string',
            description: 'Context output directory (default: .devmind)',
          },
          init: {
            type: 'boolean',
            description: 'Create default profile file if missing',
          },
          force: {
            type: 'boolean',
            description: 'Overwrite profile when used with init',
          },
        },
      },
    },
    {
      name: 'devmind_learn',
      description:
        "Saves a new technical learning, pattern, or architectural decision to the project's persistent memory (LEARN.md). Use this when you discover something important that future agents should know.",
      parameters: {
        type: 'object',
        properties: {
          learning: {
            type: 'string',
            description: 'The knowledge to save (concise, actionable)',
          },
          category: {
            type: 'string',
            description:
              'Category of learning (e.g., architecture, database, testing, performance)',
          },
        },
        required: ['learning'],
      },
    },
    {
      name: 'devmind_context',
      description:
        'Retrieves focused context for a specific directory or module. Use this to inspect file structure and exports without reading the entire codebase.',
      parameters: {
        type: 'object',
        properties: {
          focus: {
            type: 'string',
            description: "Path to focus on (e.g., 'src/database')",
          },
          query: {
            type: 'string',
            description: 'Keyword search query (optional)',
          },
        },
      },
    },
    {
      name: 'devmind_history',
      description:
        "Retrieves the project's evolution history (database changes, codebase growth). Use this to understand what has changed recently.",
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['unified', 'schema', 'codebase'],
            description: 'Type of history to view (default: unified)',
          },
        },
      },
    },
  ];

  await writeFileSafe(path.join(outputDir, 'devmind-tools.json'), JSON.stringify(tools, null, 2));
  logger.info(`   - ${path.join(outputDir, 'devmind-tools.json')}`);

  logger.info(`   - ${path.join(outputDir, 'index.json')}`);

  await ensureWorkspaceAgentsBootstrap(outputDir);
}
