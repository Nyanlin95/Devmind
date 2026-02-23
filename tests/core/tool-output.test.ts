import { describe, it, expect } from '@jest/globals';
import { compactToolOutput } from '../../src/core/tool-output.js';

describe('tool output compactor', () => {
  it('keeps error-first summary and important lines', () => {
    const raw = [
      'Command failed with exit code 1',
      'Running tests...',
      'Error: expected true to be false',
      'at Object.<anonymous> (src/module.ts:42:13)',
      'at processTicksAndRejections (node:internal/process/task_queues:95:5)',
      'Some long noisy line',
    ].join('\n');

    const compacted = compactToolOutput(raw);

    expect(compacted.summary).toContain('Command failed');
    expect(compacted.keyLines.some((line) => line.includes('expected true'))).toBe(true);
    expect(compacted.traceLines.some((line) => line.includes('src/module.ts:42:13'))).toBe(true);
    expect(compacted.rawBytes).toBeGreaterThan(0);
    expect(compacted.rawHash.length).toBe(16);
  });

  it('falls back to first non-empty lines when no error keywords exist', () => {
    const raw = ['   ', 'line one', 'line two', 'line three'].join('\n');
    const compacted = compactToolOutput(raw);

    expect(compacted.summary).toBe('line one');
    expect(compacted.keyLines[0]).toBe('line one');
  });
});
