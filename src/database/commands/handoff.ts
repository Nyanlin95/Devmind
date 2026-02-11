/**
 * Handoff Command
 *
 * Multi-agent handoff management for DevMind.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger, ensureDir, writeFileSafe, readFileSafe, writeJSON } from '../../core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HandoffOptions {
  record?: boolean;
  resume?: string;
  list?: boolean;
  output?: string;
  status?: string;
  agentId?: string;
}

export async function handoff(options: HandoffOptions): Promise<void> {
  const outputDir = options.output || '.devmind';

  if (options.list) {
    await listSessions(outputDir);
    return;
  }

  if (options.resume) {
    await resumeSession(outputDir, options.resume);
    return;
  }

  if (options.record) {
    await recordHandoff(outputDir, options);
    return;
  }

  // Default: show help
  logger.info('Handoff command - record session state for multi-agent handoff');
  logger.info('');
  logger.info('Usage:');
  logger.info('  devmind handoff --record           Record current session state');
  logger.info('  devmind handoff --resume <id>     Resume from previous session');
  logger.info('  devmind handoff --list            List available sessions');
  logger.info('');
  logger.info('Options:');
  logger.info('  -o, --output <dir>     Output directory (default: .devmind)');
  logger.info('  --status <status>      Session status (in_progress, completed, paused)');
  logger.info('  --agentId <id>         Agent identifier');
}

async function listSessions(outputDir: string): Promise<void> {
  const handoffsDir = path.join(outputDir, 'handoffs');

  try {
    const files = await fs.readdir(handoffsDir);
    const handoffFiles = files
      .filter((f) => f.startsWith('HANDOFF_') && f.endsWith('.md'))
      .sort()
      .reverse();

    if (handoffFiles.length === 0) {
      logger.info('No handoff sessions found.');
      logger.info('Record a session with: devmind handoff --record');
      return;
    }

    logger.info('Available Sessions:');
    logger.info('');
    logger.info('| Session ID | Timestamp | Status |');
    logger.info('|------------|-----------|--------|');

    for (const file of handoffFiles.slice(0, 10)) {
      const content = await readFileSafe(path.join(handoffsDir, file));
      const sessionMatch = content.match(/\|\s*\*\*Session ID\*\*\s*\|\s*([^\|]+?)\s*\|/);
      const timestampMatch = content.match(/\|\s*\*\*Timestamp\*\*\s*\|\s*([^\|]+?)\s*\|/);
      const statusMatch = content.match(/\|\s*\*\*Status\*\*\s*\|\s*([^\|]+?)\s*\|/);

      const sessionId = sessionMatch?.[1] || 'unknown';
      const timestamp = timestampMatch?.[1] || 'unknown';
      const status = statusMatch?.[1] || 'unknown';

      logger.info(`| ${sessionId} | ${timestamp} | ${status} |`);
    }

    logger.info('');
    logger.info(`Total: ${handoffFiles.length} session(s)`);
    logger.info('Resume with: devmind handoff --resume <session_id>');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('No handoff sessions found.');
      logger.info('Record a session with: devmind handoff --record');
    } else {
      throw error;
    }
  }
}

async function resumeSession(outputDir: string, sessionId: string): Promise<void> {
  const handoffsDir = path.join(outputDir, 'handoffs');
  const stateDir = path.join(outputDir, 'state');
  const contextDir = path.join(outputDir, 'context');

  // Try to find session files
  const sessionPatterns = [`HANDOFF_${sessionId}.md`, `HANDOFF_${sessionId}-*.md`];

  let handoffFile: string | null = null;

  for (const pattern of sessionPatterns) {
    try {
      const files = await fs.readdir(handoffsDir);
      const handoffFiles = files.filter((f) => f.startsWith('HANDOFF_') && f.endsWith('.md'));

      for (const file of handoffFiles) {
        const filePath = path.join(handoffsDir, file);
        const content = await readFileSafe(filePath);
        const sessionMatch = content.match(/\|\s*\*\*Session ID\*\*\s*\|\s*([^\|]+?)\s*\|/);

        if (sessionMatch && sessionMatch[1].trim() === sessionId) {
          handoffFile = path.join(handoffsDir, file);
          break;
        }
      }

      if (handoffFile) break;
    } catch {
      // Continue
    }
  }

  if (!handoffFile) {
    logger.error(`Session ${sessionId} not found.`);
    logger.info('List sessions with: devmind handoff --list');
    return;
  }

  // Load state files
  const stateFile = path.join(stateDir, 'CURRENT_STATE.md');
  const contextFile = path.join(contextDir, 'SESSION_CONTEXT.json');

  logger.info(`Resuming session: ${sessionId}`);
  logger.info('');

  try {
    const handoffContent = await readFileSafe(handoffFile);
    logger.info('--- Handoff Summary ---');
    logger.info(handoffContent.slice(0, 500) + '...\n');
  } catch {
    // Continue
  }

  try {
    const stateContent = await readFileSafe(stateFile);
    logger.info('--- Current State ---');
    logger.info(stateContent.slice(0, 500) + '...\n');
  } catch {
    logger.warn('(No current state file found)\n');
  }

  try {
    const contextContent = await readFileSafe(contextFile);
    logger.info('--- Context (JSON) ---');
    logger.info(contextContent.slice(0, 500) + '...\n');
  } catch {
    logger.warn('(No context JSON found)\n');
  }

  logger.success('Ready to resume. Review state before continuing.');
}

async function recordHandoff(outputDir: string, options: HandoffOptions): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionId = `sess_${timestamp}`;
  const agentId = options.agentId || 'agent-unknown';

  const handoffsDir = path.join(outputDir, 'handoffs');
  const stateDir = path.join(outputDir, 'state');
  const contextDir = path.join(outputDir, 'context');
  const decisionsDir = path.join(outputDir, 'decisions');

  // Create directories
  await ensureDir(handoffsDir);
  await ensureDir(stateDir);
  await ensureDir(contextDir);
  await ensureDir(decisionsDir);

  // Generate handoff file
  const handoffContent = generateHandoffMarkdown(
    sessionId,
    agentId,
    timestamp,
    options.status || 'in_progress',
  );
  const handoffFile = path.join(handoffsDir, `HANDOFF_${timestamp}.md`);
  await writeFileSafe(handoffFile, handoffContent);

  // Generate state file
  const stateContent = generateStateMarkdown(
    sessionId,
    agentId,
    timestamp,
    options.status || 'in_progress',
  );
  await writeFileSafe(path.join(stateDir, 'CURRENT_STATE.md'), stateContent);

  // Generate context JSON
  const contextContent = generateContextJson(
    sessionId,
    agentId,
    timestamp,
    options.status || 'in_progress',
  );
  await writeFileSafe(path.join(contextDir, 'SESSION_CONTEXT.json'), contextContent);

  logger.success(`Session recorded: ${sessionId}`);
  logger.info('Files created:');
  logger.info(`  - ${handoffFile}`);
  logger.info(`  - ${path.join(stateDir, 'CURRENT_STATE.md')}`);
  logger.info(`  - ${path.join(contextDir, 'SESSION_CONTEXT.json')}`);
  logger.info('');
  logger.info('Multi-agent protocol:');
  logger.info('1. Share handoff file with next agent');
  logger.info('2. Next agent reads: .devmind/state/CURRENT_STATE.md');
  logger.info('3. Full context: .devmind/context/SESSION_CONTEXT.json');
}

function generateHandoffMarkdown(
  sessionId: string,
  agentId: string,
  timestamp: string,
  status: string,
): string {
  return `# Agent Handoff Record

> AUTO-GENERATED by devmind-db. Read this before continuing.

## Session Info

| Field | Value |
|-------|-------|
| **Agent ID** | ${agentId} |
| **Session ID** | ${sessionId} |
| **Timestamp** | ${timestamp} |
| **Status** | ${status} |

---

## What Was Attempted

### Goals
- Goal 1
- Goal 2

### Actions Taken

| Step | Action | Result |
|------|--------|--------|
| 1 | Initial setup | ✅ Complete |

---

## What Succeeded

- ✅ Success item 1

---

## What Failed

- (None yet)

---

## Decisions Made

> See \`.devmind/decisions/\` for detailed logs.

---

## Current State

### Last Completed Step
- Initial handoff recorded

### Pending Work
- [ ] Pending item 1

---

## Context for Next Agent

### Variables
\`\`\`json
{
  "sessionId": "${sessionId}",
  "agentId": "${agentId}"
}
\`\`\`

---

## Next Steps

1. Review CURRENT_STATE.md
2. Check SESSION_CONTEXT.json for full state
3. Continue from last checkpoint

---

> **PROTOCOL**: Before spawning subagents:
> 1. Generate handoff file
> 2. Pass handoff to next agent
> 3. Next agent reads state first
`;
}

function generateStateMarkdown(
  sessionId: string,
  agentId: string,
  timestamp: string,
  status: string,
): string {
  return `# Current State

> AUTO-GENERATED by devmind-db. Active progress snapshot.

## Session Status

| Field | Value |
|-------|-------|
| **Status** | ${status} |
| **Last Updated** | ${timestamp} |
| **Session ID** | ${sessionId} |
| **Agent ID** | ${agentId} |

---

## Progress

### Completed Steps
- ✅ Initial session recorded

### Current Step
- Session initialization

### Remaining Steps
- ⏳ Define goals
- ⏳ Execute work

---

## Variables & State

\`\`\`json
{
  "sessionId": "${sessionId}",
  "agentId": "${agentId}"
}
\`\`\`

---

> **MULTI-AGENT**: Read this first when resuming.
`;
}

function generateContextJson(
  sessionId: string,
  agentId: string,
  timestamp: string,
  status: string,
): string {
  return JSON.stringify(
    {
      version: '1.0.2',
      session: {
        id: sessionId,
        agentId: agentId,
        parentSessionId: null,
        timestamp: timestamp,
        status: status,
      },
      state: {
        phase: 'initializing',
        progress: 0,
        lastAction: 'Session created',
        nextAction: 'Define goals',
      },
      variables: {},
      schema: {
        databaseType: null,
        tablesModified: [],
        schemaHash: null,
      },
      decisions: [],
      handoffs: [],
      errors: [],
    },
    null,
    2,
  );
}
