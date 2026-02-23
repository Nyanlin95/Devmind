import * as path from 'path';
import { createHash } from 'crypto';
import { ensureDir } from './fileio.js';
import * as fs from 'fs/promises';

export interface CompactedToolOutput {
  summary: string;
  keyLines: string[];
  traceLines: string[];
  omittedLines: number;
  rawHash: string;
  rawBytes: number;
}

interface PersistCompactedToolOutputOptions {
  outputDir?: string;
  command: string;
  stage: 'error' | 'result';
  rawText: string;
  metadata?: Record<string, unknown>;
}

const MAX_KEY_LINES = 8;
const MAX_TRACE_LINES = 4;
const MAX_SUMMARY_LENGTH = 220;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function firstNonEmpty(lines: string[]): string {
  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (normalized) return normalized;
  }
  return '';
}

function isImportantLine(line: string): boolean {
  const lc = line.toLowerCase();
  if (!lc) return false;
  return (
    lc.includes('error') ||
    lc.includes('failed') ||
    lc.includes('exception') ||
    lc.includes('traceback') ||
    lc.includes('enoent') ||
    lc.includes('econn') ||
    lc.includes('timeout') ||
    lc.includes('cannot ') ||
    lc.includes('invalid') ||
    lc.includes('unexpected')
  );
}

function isTraceLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('at ') || trimmed.includes('.ts:') || trimmed.includes('.js:');
}

export function compactToolOutput(rawText: string): CompactedToolOutput {
  const normalizedRaw = rawText || '';
  const rawLines = normalizedRaw.split(/\r?\n/);
  const summary = firstNonEmpty(rawLines).slice(0, MAX_SUMMARY_LENGTH) || 'No output';

  const keyLines: string[] = [];
  const traceLines: string[] = [];

  for (const line of rawLines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;
    if (isTraceLine(normalized)) {
      if (traceLines.length < MAX_TRACE_LINES) {
        traceLines.push(normalized);
      }
      continue;
    }
    if (isImportantLine(normalized) && keyLines.length < MAX_KEY_LINES) {
      keyLines.push(normalized);
    }
  }

  if (keyLines.length === 0) {
    for (const line of rawLines) {
      const normalized = normalizeLine(line);
      if (!normalized) continue;
      keyLines.push(normalized);
      if (keyLines.length >= Math.min(MAX_KEY_LINES, 3)) break;
    }
  }

  const uniqueKeyLines = [...new Set(keyLines)];
  const omittedLines = Math.max(0, rawLines.filter((line) => normalizeLine(line).length > 0).length - uniqueKeyLines.length);
  const rawHash = createHash('sha256').update(normalizedRaw, 'utf8').digest('hex').slice(0, 16);
  const rawBytes = Buffer.byteLength(normalizedRaw, 'utf-8');

  return {
    summary,
    keyLines: uniqueKeyLines,
    traceLines,
    omittedLines,
    rawHash,
    rawBytes,
  };
}

export async function persistCompactedToolOutput(
  options: PersistCompactedToolOutputOptions,
): Promise<void> {
  const outputDir = options.outputDir || '.devmind';
  const compacted = compactToolOutput(options.rawText);
  const record = {
    timestamp: new Date().toISOString(),
    command: options.command,
    stage: options.stage,
    ...compacted,
    metadata: options.metadata || {},
  };

  const logPath = path.join(outputDir, 'context', 'TOOL_OUTPUTS.jsonl');
  await ensureDir(path.dirname(logPath));
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf-8');
}
