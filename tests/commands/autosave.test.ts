import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runAutosave } from '../../src/commands/autosave.js';

describe('autosave decision/hypothesis logging', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devmind-autosave-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('writes structured decision and hypothesis logs when provided', async () => {
    const outputDir = path.join(tempRoot, '.devmind');
    const result = await runAutosave({
      output: outputDir,
      source: 'unit-test',
      note: 'state-drift-check',
      goal: 'Unify middleware signature',
      nonNegotiable: 'Auth claims must keep sub/aud/iss',
      openQuestion: 'Should revocation be gateway-only?',
      decision: 'Use optimistic locking for note updates',
      hypothesis: 'Conflict retries below 3 should stabilize',
      hypothesisStatus: 'open',
      failure: 'ECONNREFUSED when proxy points to old port',
      resolution: 'Aligned upstream port with app listen port',
      noExtract: true,
    });

    expect(result.decisionsLogged).toBe(1);
    expect(result.hypothesesLogged).toBe(1);
    expect(result.ledgerEntriesLogged).toBeGreaterThan(0);
    expect(result.refactorLedgerPath).toContain('refactor-ledger.md');
    expect(result.decisionLogPath).toContain('DECISIONS.jsonl');
    expect(result.hypothesisLogPath).toContain('HYPOTHESES.jsonl');

    const decisionsRaw = await fs.readFile(
      path.join(outputDir, 'context', 'DECISIONS.jsonl'),
      'utf-8',
    );
    const hypothesesRaw = await fs.readFile(
      path.join(outputDir, 'context', 'HYPOTHESES.jsonl'),
      'utf-8',
    );

    const decisionLine = JSON.parse(decisionsRaw.trim().split(/\r?\n/)[0]) as {
      decision: string;
      source: string;
    };
    const hypothesisLine = JSON.parse(hypothesesRaw.trim().split(/\r?\n/)[0]) as {
      hypothesis: string;
      status: string;
      source: string;
    };

    expect(decisionLine.decision).toContain('optimistic locking');
    expect(decisionLine.source).toBe('unit-test');
    expect(hypothesisLine.hypothesis).toContain('Conflict retries');
    expect(hypothesisLine.status).toBe('open');
    expect(hypothesisLine.source).toBe('unit-test');

    const ledgerRaw = await fs.readFile(path.join(outputDir, 'context', 'refactor-ledger.md'), 'utf-8');
    expect(ledgerRaw).toContain('Unify middleware signature');
    expect(ledgerRaw).toContain('Auth claims must keep sub/aud/iss');
    expect(ledgerRaw).toContain('ECONNREFUSED');
  });
});
