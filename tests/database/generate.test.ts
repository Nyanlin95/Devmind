import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
};

const ensureDir = jest.fn(async () => {});
const writeFileSafe = jest.fn(async () => {});
const readFileSafe = jest.fn(async () => {
  throw new Error('missing');
});
const failCommand = jest.fn();

const createExtractor = jest.fn();
const convert = jest.fn();
const ensureWorkspaceAgentsBootstrap = jest.fn(async () => {});
const runAutosave = jest.fn(async () => {});

const templateSave = jest.fn(async () => {});
const createMemoryStructure = jest.fn(async () => {});
const initializeMemoryFiles = jest.fn(async () => {});
const copyTemplateFiles = jest.fn(async () => {});
const calculateSchemaHash = jest.fn(() => 'hash-1');
const generateLearnings = jest.fn(() => []);
const formatLearnings = jest.fn(() => '# learnings');

jest.unstable_mockModule('../../src/core/index.js', () => ({
  logger,
  ensureDir,
  writeFileSafe,
  readFileSafe,
  failCommand,
}));

jest.unstable_mockModule('../../src/database/extractors/index.js', () => ({
  createExtractor,
  UnifiedSchemaConverter: { convert },
}));

jest.unstable_mockModule('../../src/database/generators/templates.js', () => ({
  TemplateGenerator: class {
    save = templateSave;
  },
}));

jest.unstable_mockModule('../../src/database/generators/learning-generator.js', () => ({
  LearningGenerator: class {
    generateLearnings = generateLearnings;
    formatLearnings = formatLearnings;
  },
}));

jest.unstable_mockModule('../../src/database/commands/memory.js', () => ({
  MemoryInfrastructure: class {
    createMemoryStructure = createMemoryStructure;
    initializeMemoryFiles = initializeMemoryFiles;
    copyTemplateFiles = copyTemplateFiles;
    calculateSchemaHash = calculateSchemaHash;
  },
}));

jest.unstable_mockModule('../../src/generators/unified.js', () => ({
  ensureWorkspaceAgentsBootstrap,
}));

jest.unstable_mockModule('../../src/commands/autosave.js', () => ({
  runAutosave,
}));

let generate: typeof import('../../src/database/commands/generate.js').generate;

describe('database generate command', () => {
  beforeAll(async () => {
    ({ generate } = await import('../../src/database/commands/generate.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (createExtractor as unknown as any).mockResolvedValue({
      extract: jest.fn(async () => ({ tables: [] })),
      close: jest.fn(async () => {}),
    });
    convert.mockReturnValue({
      tables: [],
      databaseType: 'postgresql',
      schemaName: 'public',
    });
  });

  it('uses MongoDB extractor when URL is mongodb scheme', async () => {
    await generate({
      output: '.devmind',
      url: 'mongodb://localhost:27017/devmind',
    });

    expect(createExtractor).toHaveBeenCalledWith(
      'mongodb',
      'mongodb://localhost:27017/devmind',
      expect.any(Object),
    );
  });

  it('uses Firebase extractor when firebase project is provided', async () => {
    await generate({
      output: '.devmind',
      firebaseProject: 'demo-project',
      firebaseKey: '/tmp/service-account.json',
    });

    expect(createExtractor).toHaveBeenCalledWith(
      'firebase',
      'dummy',
      expect.objectContaining({
        projectId: 'demo-project',
        serviceAccountPath: '/tmp/service-account.json',
      }),
    );
  });

  it('rethrows failures when throwOnError is enabled', async () => {
    (createExtractor as unknown as any).mockRejectedValue(new Error('boom'));

    await expect(
      generate({
        output: '.devmind',
        url: 'postgresql://localhost:5432/app',
        throwOnError: true,
      }),
    ).rejects.toThrow('boom');

    expect(failCommand).not.toHaveBeenCalled();
  });
});
