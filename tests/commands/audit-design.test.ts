import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

jest.unstable_mockModule('../../src/core/index.js', () => ({
  readFileSafe: async (filePath: string) => fs.readFile(filePath, 'utf-8'),
}));

let collectDesignAuditFindings: typeof import('../../src/commands/audit-design.js').collectDesignAuditFindings;

describe('design audit motion checks', () => {
  beforeAll(async () => {
    ({ collectDesignAuditFindings } = await import('../../src/commands/audit-design.js'));
  });

  it('reports motion risks and missing reduced-motion handling', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devmind-motion-audit-'));
    const designSystemPath = path.join(root, 'design-system.json');
    await fs.writeFile(
      designSystemPath,
      JSON.stringify({
        name: 'ui',
        version: '1.0.0',
        motion: {
          reducedMotionRequired: true,
          maxDurationMs: 900,
          forbidInfiniteAnimations: true,
        },
      }),
      'utf-8',
    );

    const fileContents = new Map<string, string>([
      [
        'src/components/AnimatedCard.tsx',
        `
          import { motion } from 'framer-motion';
          const styles = { transition: 'all 250ms ease' };
          const cls = "animate-spin";
          const x = "animation: pulse 2s infinite;";
          const y = "transition-duration: 1200ms;";
        `,
      ],
    ]);

    const findings = await collectDesignAuditFindings(root, designSystemPath, fileContents);

    const rules = findings.map((f) => f.rule);
    expect(rules).toContain('motion-transition-all');
    expect(rules).toContain('motion-infinite-animation');
    expect(rules).toContain('motion-duration-budget');
    expect(rules).toContain('motion-reduced-motion');

    await fs.rm(root, { recursive: true, force: true });
  });
});
