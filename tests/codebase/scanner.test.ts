import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock dependencies before import
jest.unstable_mockModule('../../src/core', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/codebase/parsers/typescript.js', () => ({
  parseFile: jest.fn().mockReturnValue([]),
  parseSourceFile: jest.fn().mockReturnValue([]),
  CodeExport: {},
}));

let scanDirectory: typeof import('../../src/codebase/scanners/filesystem.js').scanDirectory;
let detectLanguage: typeof import('../../src/codebase/scanners/filesystem.js').detectLanguage;
let extractExports: typeof import('../../src/codebase/scanners/filesystem.js').extractExports;

describe('FileSystem Scanner', () => {
  let tempDir: string;

  beforeAll(async () => {
    ({ scanDirectory, detectLanguage, extractExports } =
      await import('../../src/codebase/scanners/filesystem.js'));

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'devmind-scanner-'));

    await fs.promises.mkdir(path.join(tempDir, 'src'));
    await fs.promises.mkdir(path.join(tempDir, 'node_modules'));
    await fs.promises.mkdir(path.join(tempDir, 'utils'));

    await fs.promises.writeFile(
      path.join(tempDir, 'src', 'index.ts'),
      'export const start = () => {};',
    );
    await fs.promises.writeFile(
      path.join(tempDir, 'node_modules', 'lib.js'),
      'export const lib = 1;',
    );
    await fs.promises.writeFile(
      path.join(tempDir, 'utils', 'helper.js'),
      'export function help() {}',
    );
    await fs.promises.writeFile(path.join(tempDir, '.DS_Store'), 'junk');
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('should detect languages correctly', () => {
    expect(detectLanguage('test.ts')).toBe('TypeScript');
    expect(detectLanguage('index.js')).toBe('JavaScript');
    expect(detectLanguage('script.py')).toBe('Python');
    expect(detectLanguage('service.kt')).toBe('Kotlin');
    expect(detectLanguage('tool.kts')).toBe('Kotlin Script');
    expect(detectLanguage('mobile.dart')).toBe('Dart');
    expect(detectLanguage('deploy.sh')).toBe('Shell');
    expect(detectLanguage('schema.sql')).toBe('SQL');
    expect(detectLanguage('unknown.xyz')).toBe('Unknown');
  });

  it('should scan directory recursively but ignore node_modules', () => {
    const result = scanDirectory(tempDir);

    expect(result.name).toBe(path.basename(tempDir));
    expect(result.children).toBeDefined();

    const src = result.children?.find((c) => c.name === 'src');
    expect(src).toBeDefined();

    const nm = result.children?.find((c) => c.name === 'node_modules');
    expect(nm).toBeUndefined();

    const ds = result.children?.find((c) => c.name === '.DS_Store');
    expect(ds).toBeUndefined();
  });

  it('should extract simple regex exports from fallback', () => {
    const code = `
        export const FOO = 1;
        export function bar() {}
        fun doWork() {}
        class Worker
        class UserModel {}
        function deploy() {}
        create table users (id int);
        `;
    const exports = extractExports(code);
    expect(exports).toContain('FOO');
    expect(exports).toContain('bar');
    expect(exports).toContain('doWork');
    expect(exports).toContain('Worker');
    expect(exports).toContain('UserModel');
    expect(exports).toContain('deploy');
    expect(exports).toContain('users');
  });
});
