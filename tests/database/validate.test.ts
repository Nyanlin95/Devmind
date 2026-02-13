import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
};

const readFileSafe = jest.fn() as jest.Mock;
const createExtractor = jest.fn() as jest.Mock;
const convert = jest.fn() as jest.Mock;
const existsSync = jest.fn() as jest.Mock;

jest.unstable_mockModule('../../src/core/index.js', () => ({
  logger,
  readFileSafe,
  handleError: jest.fn(),
  failCommand: jest.fn(),
}));

jest.unstable_mockModule('../../src/database/extractors/index.js', () => ({
  createExtractor,
  UnifiedSchemaConverter: {
    convert,
  },
}));

jest.unstable_mockModule('fs', () => ({
  existsSync,
}));

let validate: typeof import('../../src/database/commands/validate.js').validate;

describe('validate command', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    ({ validate } = await import('../../src/database/commands/validate.js'));

    existsSync.mockImplementation((filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');

      if (normalized.endsWith('.devmind/devmind.config.json')) return true;
      if (normalized.endsWith('.devmind/CLAUDE.md')) return false;
      if (normalized.endsWith('.devmind/AGENTS.md')) return true;
      if (normalized === 'prisma/schema.prisma') return true;
      return false;
    });
  });

  it('should parse documented tables from AGENTS.md when CLAUDE.md is missing', async () => {
    readFileSafe.mockImplementation(async (filePath: unknown) => {
      const normalized = String(filePath).replace(/\\/g, '/');
      if (normalized.endsWith('.devmind/devmind.config.json')) {
        return JSON.stringify({ outputDir: '.devmind' });
      }
      if (normalized.endsWith('.devmind/AGENTS.md')) {
        return '# Context\n\n### users\n\nSome details';
      }
      throw new Error(`Unexpected file read: ${filePath}`);
    });

    (createExtractor as unknown as any).mockResolvedValue({
      extract: jest.fn(async () => ({
        tables: [{ name: 'users', columns: [{ name: 'id' }], relations: [] }],
      })),
      close: jest.fn(async () => {}),
    });
    convert.mockImplementation((schema) => schema);

    await validate({});

    expect(
      readFileSafe.mock.calls.some(([filePath]) =>
        String(filePath).replace(/\\/g, '/').endsWith('.devmind/AGENTS.md'),
      ),
    ).toBe(true);
    expect(logger.success).toHaveBeenCalledWith('Validation passed!');
    expect(logger.warn).not.toHaveBeenCalledWith('Validation warnings:');
  });
});
