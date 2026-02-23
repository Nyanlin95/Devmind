import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const readFileSafe = jest.fn() as jest.Mock;

jest.unstable_mockModule('../../src/core/index.js', () => ({
  logger,
  readFileSafe,
  createProfiler: () => ({
    section: async (_name: string, fn: () => Promise<unknown>) => fn(),
    report: () => null,
  }),
}));

let retrieve: typeof import('../../src/commands/retrieve.js').retrieve;

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

describe('retrieve command ranking and routing', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    ({ retrieve } = await import('../../src/commands/retrieve.js'));
  });

  it('prioritizes invariant/constraint sections ahead of generic matches', async () => {
    const agentsLines = [
      'Generic auth implementation notes',
      'Flow and middleware details',
      '',
      'Authentication invariants',
      'Token rotation is required for every refresh',
      'Session rollback constraints documented',
    ];
    const agentsContent = agentsLines.join('\n');

    const genericContent = agentsLines.slice(0, 2).join('\n');
    const invariantContent = agentsLines.slice(3, 6).join('\n');

    const index = {
      sections: [
        {
          id: 'auth.generic',
          title: 'Auth Flow',
          type: 'codebase',
          tags: ['auth', 'flow'],
          priority: 'medium',
          source: 'codebase/auth.md',
          startLine: 1,
          endLine: 2,
          contentHash: hashContent(genericContent),
        },
        {
          id: 'auth.invariants',
          title: 'Auth Invariants',
          type: 'runbook',
          tags: ['auth', 'invariants', 'constraints'],
          priority: 'high',
          source: 'context/auth/summary.md',
          startLine: 4,
          endLine: 6,
          contentHash: hashContent(invariantContent),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'auth flow',
      json: true,
      limit: 2,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.selected.length).toBeGreaterThan(0);
    expect(payload.selected[0].id).toBe('auth.invariants');
    expect(payload.selected[0].criticalityScore).toBeGreaterThan(0);
  });

  it('honors route and level overrides for routed context chunks', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/auth/summary.md')) return 'Auth level 1';
      if (normalized.endsWith('/context/auth/details.md')) return 'Auth level 2';
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'random query',
      route: 'auth',
      level: 2,
      json: true,
      limit: 3,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.routing.routes).toEqual(['auth']);
    expect(payload.routing.escalationLevel).toBe(2);
    expect(payload.routed.map((item: { source: string }) => item.source)).toEqual([
      'context/auth/summary.md',
      'context/auth/details.md',
    ]);
  });

  it('includes decision/hypothesis state logs when state flag is enabled', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    const decisionsLog = JSON.stringify({
      timestamp: '2026-02-23T10:00:00.000Z',
      source: 'task-end',
      decision: 'Keep migration idempotent',
    });
    const hypothesesLog = JSON.stringify({
      timestamp: '2026-02-23T11:00:00.000Z',
      source: 'task-end',
      hypothesis: 'Retry policy of 2 might reduce flake',
      status: 'confirmed',
    });

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/DECISIONS.jsonl')) return decisionsLog;
      if (normalized.endsWith('/context/HYPOTHESES.jsonl')) return hypothesesLog;
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'state check',
      state: true,
      json: true,
      limit: 3,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.state.length).toBe(2);
    expect(payload.state[0].kind).toBe('hypothesis');
    expect(payload.state[0].status).toBe('confirmed');
    expect(payload.state[1].kind).toBe('decision');
  });

  it('loads deterministic HTTP contract context for port/connection failures', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/contracts/http.md')) return '# HTTP Contract\n\nPort mapping table';
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'ECONNREFUSED on upstream port',
      json: true,
      limit: 3,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.routing.contracts).toContain('http');
    expect(payload.contracts.length).toBe(1);
    expect(payload.contracts[0].contract).toBe('http');
    expect(payload.contracts[0].source).toBe('context/contracts/http.md');
  });

  it('loads refactor ledger for rewrite/refactor queries', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/refactor-ledger.md')) {
        return '# Refactor Ledger\n\n## 2026-02-23T12:00:00.000Z | task\n- Decision: Keep middleware signature (ctx,next)\n';
      }
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'refactor middleware helpers',
      json: true,
      limit: 2,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(typeof payload.ledger).toBe('string');
    expect(payload.ledger).toContain('Refactor Ledger');
    expect(payload.ledger).toContain('middleware signature');
  });

  it('loads UI contract and design system context for UI token queries', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/contracts/ui.md')) return '# UI Contract\n\nToken rules';
      if (normalized.endsWith('/design-system.json')) {
        return JSON.stringify({
          name: 'Acme UI',
          version: '1.0.0',
          tokenSources: ['src/styles/tokens.css'],
          allowedComponentImports: ['@/components/ui'],
        });
      }
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'ui token hydration issue',
      json: true,
      limit: 3,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.routing.routes).toContain('ui');
    expect(payload.routing.contracts).toContain('ui');
    expect(payload.contracts.map((item: { contract: string }) => item.contract)).toContain('ui');
    expect(payload.designSystem).toBeTruthy();
    expect(payload.designSystem.title).toBe('Design System Context');
    expect(payload.designSystem.content).toContain('Acme UI');
  });

  it('loads motion contract for animation queries', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/contracts/motion.md')) return '# Motion Contract\n\nReduced motion';
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'framer motion timeline jitter',
      json: true,
      limit: 3,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.routing.routes).toContain('ui');
    expect(payload.routing.contracts).toContain('motion');
    expect(payload.contracts.map((item: { contract: string }) => item.contract)).toContain('motion');
  });

  it('treats design token queries as UI context, not auth token context', async () => {
    const agentsContent = 'Core section line';
    const index = {
      sections: [
        {
          id: 'core.section',
          title: 'Core',
          type: 'codebase',
          tags: ['core'],
          priority: 'medium',
          source: 'codebase/overview.md',
          startLine: 1,
          endLine: 1,
          contentHash: hashContent('Core section line'),
        },
      ],
    };

    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('/index.json')) return JSON.stringify(index);
      if (normalized.endsWith('/AGENTS.md')) return agentsContent;
      if (normalized.endsWith('/context/contracts/ui.md')) return '# UI Contract';
      if (normalized.endsWith('/design-system.json')) return JSON.stringify({ name: 'UI', version: '1.0.0' });
      throw new Error(`Unexpected read: ${filePath}`);
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await retrieve({
      output: '.devmind',
      query: 'design token spacing',
      json: true,
      limit: 3,
    });
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    logSpy.mockRestore();

    expect(payload.routing.routes).toContain('ui');
    expect(payload.routing.routes).not.toContain('auth');
    expect(payload.routing.contracts).toContain('ui');
    expect(payload.routing.contracts).not.toContain('auth');
  });
});
