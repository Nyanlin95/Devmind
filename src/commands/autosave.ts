import * as path from 'path';
import { ensureDir, readFileSafe, writeFileSafe, logger } from '../core/index.js';
import { runExtraction } from './extract.js';

interface AutosaveOptions {
  output?: string;
  path?: string;
  source?: string;
  note?: string;
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
  extracted: number;
  applied: boolean;
}

function createSessionId(): string {
  return `sess_${Date.now()}`;
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

  const journalPath = await appendJournal(outputDir, source, options.note);
  const sessionContextPath = await updateSessionContext(outputDir, source, options.note);

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
    logger.info(`Learnings extracted: ${result.extracted}`);
    logger.info(`Applied to LEARN.md: ${result.applied ? 'yes' : 'no'}`);
  }
}
