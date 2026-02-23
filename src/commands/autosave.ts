import * as path from 'path';
import { ensureDir, readFileSafe, writeFileSafe, logger } from '../core/index.js';
import { runExtraction } from './extract.js';
import * as fs from 'fs/promises';

interface AutosaveOptions {
  output?: string;
  path?: string;
  source?: string;
  note?: string;
  decision?: string;
  hypothesis?: string;
  hypothesisStatus?: 'open' | 'ruled-out' | 'confirmed';
  goal?: string;
  nonNegotiable?: string;
  openQuestion?: string;
  failure?: string;
  resolution?: string;
  noExtract?: boolean;
  extract?: boolean;
  json?: boolean;
  silent?: boolean;
}

interface SessionContextShape {
  session?: {
    id?: string;
    lastAutosaveAt?: string;
    lastAutosaveSource?: string;
  };
  state?: {
    lastAction?: string;
  };
  [key: string]: unknown;
}

interface AutosaveResult {
  journalPath: string;
  sessionContextPath: string;
  decisionLogPath: string | null;
  hypothesisLogPath: string | null;
  refactorLedgerPath: string | null;
  decisionsLogged: number;
  hypothesesLogged: number;
  ledgerEntriesLogged: number;
  extracted: number;
  applied: boolean;
}

function createSessionId(): string {
  return `sess_${Date.now()}`;
}

function normalizeDecision(value?: string): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeHypothesis(value?: string): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeHypothesisStatus(value?: string): 'open' | 'ruled-out' | 'confirmed' {
  if (value === 'ruled-out' || value === 'confirmed') return value;
  return 'open';
}

async function appendJsonLine(filePath: string, payload: Record<string, unknown>): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf-8');
}

async function appendRefactorLedger(
  outputDir: string,
  source: string,
  options: AutosaveOptions,
): Promise<{ path: string | null; entries: number }> {
  const fields = {
    note: (options.note || '').trim(),
    goal: (options.goal || '').trim(),
    nonNegotiable: (options.nonNegotiable || '').trim(),
    openQuestion: (options.openQuestion || '').trim(),
    decision: (options.decision || '').trim(),
    hypothesis: (options.hypothesis || '').trim(),
    hypothesisStatus: normalizeHypothesisStatus(options.hypothesisStatus),
    failure: (options.failure || '').trim(),
    resolution: (options.resolution || '').trim(),
  };

  const hasEntries =
    fields.note ||
    fields.goal ||
    fields.nonNegotiable ||
    fields.openQuestion ||
    fields.decision ||
    fields.hypothesis ||
    fields.failure ||
    fields.resolution;
  if (!hasEntries) return { path: null, entries: 0 };

  const ledgerPath = path.join(outputDir, 'context', 'refactor-ledger.md');
  await ensureDir(path.dirname(ledgerPath));

  let existing = '';
  try {
    existing = await readFileSafe(ledgerPath);
  } catch {
    existing = [
      '# Refactor Ledger',
      '',
      '> Persistent refactor state: goals, constraints, hypotheses, decisions, and resolutions.',
      '',
    ].join('\n');
  }

  const lines: string[] = [];
  const ts = new Date().toISOString();
  lines.push(`## ${ts} | ${source}`);
  if (fields.note) lines.push(`- Note: ${fields.note}`);
  if (fields.goal) lines.push(`- Goal: ${fields.goal}`);
  if (fields.nonNegotiable) lines.push(`- Non-negotiable: ${fields.nonNegotiable}`);
  if (fields.openQuestion) lines.push(`- Open question: ${fields.openQuestion}`);
  if (fields.decision) lines.push(`- Decision: ${fields.decision}`);
  if (fields.hypothesis)
    lines.push(`- Hypothesis (${fields.hypothesisStatus}): ${fields.hypothesis}`);
  if (fields.failure) lines.push(`- Failure mode: ${fields.failure}`);
  if (fields.resolution) lines.push(`- Resolution: ${fields.resolution}`);
  lines.push('');

  const next = existing.endsWith('\n') ? `${existing}\n${lines.join('\n')}` : `${existing}\n\n${lines.join('\n')}`;
  await writeFileSafe(ledgerPath, next);
  const entryCount = lines.filter((line) => line.startsWith('- ')).length;
  return { path: ledgerPath, entries: entryCount };
}

async function appendJournal(outputDir: string, source: string, note?: string): Promise<string> {
  const journalPath = path.join(outputDir, 'memory', 'SESSION_JOURNAL.md');
  await ensureDir(path.dirname(journalPath));

  let existing = '';
  try {
    existing = await readFileSafe(journalPath);
  } catch {
    existing = '# Session Journal\n\n> Incremental execution journal for crash-safe recovery.\n\n';
  }

  const line = `- ${new Date().toISOString()} | ${source}${note ? ` | ${note}` : ''}\n`;
  await writeFileSafe(journalPath, `${existing}${line}`);
  return journalPath;
}

async function updateSessionContext(
  outputDir: string,
  source: string,
  note?: string,
): Promise<string> {
  const contextPath = path.join(outputDir, 'context', 'SESSION_CONTEXT.json');
  await ensureDir(path.dirname(contextPath));

  let context: SessionContextShape = {};
  try {
    const existing = await readFileSafe(contextPath);
    context = JSON.parse(existing) as SessionContextShape;
  } catch {
    context = {};
  }

  const now = new Date().toISOString();
  context.session = {
    id: context.session?.id || createSessionId(),
    ...context.session,
    lastAutosaveAt: now,
    lastAutosaveSource: source,
  };

  context.state = {
    ...context.state,
    lastAction: note || source,
  };

  await writeFileSafe(contextPath, JSON.stringify(context, null, 2));
  return contextPath;
}

export async function runAutosave(options: AutosaveOptions): Promise<AutosaveResult> {
  const outputDir = options.output || '.devmind';
  const source = options.source || 'manual';
  const skipExtract = options.noExtract || options.extract === false;
  const decision = normalizeDecision(options.decision);
  const hypothesis = normalizeHypothesis(options.hypothesis);
  const hypothesisStatus = normalizeHypothesisStatus(options.hypothesisStatus);

  const journalPath = await appendJournal(outputDir, source, options.note);
  const sessionContextPath = await updateSessionContext(outputDir, source, options.note);

  let decisionLogPath: string | null = null;
  let hypothesisLogPath: string | null = null;
  let decisionsLogged = 0;
  let hypothesesLogged = 0;
  let refactorLedgerPath: string | null = null;
  let ledgerEntriesLogged = 0;

  if (decision) {
    decisionLogPath = path.join(outputDir, 'context', 'DECISIONS.jsonl');
    await appendJsonLine(decisionLogPath, {
      timestamp: new Date().toISOString(),
      source,
      note: options.note || null,
      decision,
    });
    decisionsLogged = 1;
  }

  if (hypothesis) {
    hypothesisLogPath = path.join(outputDir, 'context', 'HYPOTHESES.jsonl');
    await appendJsonLine(hypothesisLogPath, {
      timestamp: new Date().toISOString(),
      source,
      note: options.note || null,
      hypothesis,
      status: hypothesisStatus,
    });
    hypothesesLogged = 1;
  }

  const ledgerWrite = await appendRefactorLedger(outputDir, source, options);
  refactorLedgerPath = ledgerWrite.path;
  ledgerEntriesLogged = ledgerWrite.entries;

  let extracted = 0;
  let applied = false;
  if (!skipExtract) {
    const extractResult = await runExtraction({
      output: outputDir,
      path: options.path || '.',
      apply: true,
      silent: true,
    });
    extracted = extractResult.extracted;
    applied = extractResult.applied;
  }

  return {
    journalPath,
    sessionContextPath,
    decisionLogPath,
    hypothesisLogPath,
    refactorLedgerPath,
    decisionsLogged,
    hypothesesLogged,
    ledgerEntriesLogged,
    extracted,
    applied,
  };
}

export async function autosave(options: AutosaveOptions): Promise<void> {
  const result = await runAutosave(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!options.silent) {
    logger.info('Autosave complete.');
    logger.info(`Journal: ${result.journalPath}`);
    logger.info(`Session context: ${result.sessionContextPath}`);
    logger.info(`Decisions logged: ${result.decisionsLogged}`);
    logger.info(`Hypotheses logged: ${result.hypothesesLogged}`);
    logger.info(`Ledger entries logged: ${result.ledgerEntriesLogged}`);
    logger.info(`Learnings extracted: ${result.extracted}`);
    logger.info(`Applied to LEARN.md: ${result.applied ? 'yes' : 'no'}`);
  }
}
