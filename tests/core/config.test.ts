import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fileio before import
jest.unstable_mockModule('../../src/core/fileio.js', () => ({
  fileExists: jest.fn(),
  readJSON: jest.fn(),
  ensureDir: jest.fn(),
}));

// Dynamic imports are required after unstable_mockModule
let loadConfig: typeof import('../../src/core/config.js').loadConfig;
let getOutputDir: typeof import('../../src/core/config.js').getOutputDir;
let fileExists: jest.Mock;
let readJSON: jest.Mock;

describe('Config', () => {
  beforeEach(async () => {
    ({ loadConfig, getOutputDir } = await import('../../src/core/config.js'));
    const fileioMock = await import('../../src/core/fileio.js');
    fileExists = fileioMock.fileExists as any;
    readJSON = fileioMock.readJSON as any;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default config if no file found', async () => {
    (fileExists as unknown as any).mockResolvedValue(false);
    const config = await loadConfig();
    expect(config.outputDir).toBe('.devmind');
    expect(config.codebase?.ignore).toContain('node_modules');
  });

  it('should load config from specific path', async () => {
    (fileExists as unknown as any).mockResolvedValue(true);
    (readJSON as unknown as any).mockResolvedValue({ outputDir: 'custom' });

    const config = await loadConfig('custom.json');

    expect(fileExists).toHaveBeenCalledWith('custom.json');
    expect(readJSON).toHaveBeenCalledWith('custom.json');
    expect(config.outputDir).toBe('custom');
  });

  it('should fall back to default files if path not provided', async () => {
    // Simulating checking .devmindrc.json (false), .cohererc.json (true)
    (fileExists as unknown as any).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    (readJSON as unknown as any).mockResolvedValue({ outputDir: 'legacy' });

    const config = await loadConfig();

    expect(fileExists).toHaveBeenCalledTimes(2); // .devmindrc, .cohererc
    expect(config.outputDir).toBe('legacy');
  });

  it('should throw ConfigError if file exists but is invalid', async () => {
    (fileExists as unknown as any).mockResolvedValue(true);
    (readJSON as unknown as any).mockRejectedValue(new Error('Invalid JSON'));

    await expect(loadConfig('bad.json')).rejects.toThrow('Invalid config file: bad.json');
  });

  it('should get output dir from config', () => {
    expect(getOutputDir({ outputDir: 'out' })).toBe('out');
    expect(getOutputDir({})).toBe('.devmind');
  });
});
