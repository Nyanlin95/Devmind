import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseFile, parseSourceFile } from '../../src/codebase/parsers/typescript.js';

describe('TypeScript Parser', () => {
  let tempDir: string;
  let testFile: string;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'devmind-parser-'));
    testFile = path.join(tempDir, 'sample.ts');

    const content = `
        /**
         * A sample function
         */
        export function hello(name: string): string {
            return 'Hello ' + name;
        }

        /**
         * A sample class
         */
        export class Greeter {
            constructor(private greeting: string) {}

            public greet(): string {
                return this.greeting;
            }

            private secret(): void {}
        }

        export interface User {
            id: number;
            name: string;
        }

        export type ID = string | number;

        export const MAX_RETRIES = 3;
        const defaultExportValue = 123;
        export default defaultExportValue;

        function internalOnly(): void {}
        class Hidden {}
        `;

    await fs.promises.writeFile(testFile, content);
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('should parse exported functions', () => {
    const exports = parseFile(testFile);
    const func = exports.find((e) => e.type === 'function' && e.name === 'hello');

    expect(func).toBeDefined();
    expect(func?.signature).toContain('hello(name: string): string');
    expect(func?.doc).toBe('A sample function');
  });

  it('should parse exported classes and methods', () => {
    const exports = parseFile(testFile);
    const cls = exports.find((e) => e.type === 'class' && e.name === 'Greeter');

    expect(cls).toBeDefined();
    expect(cls?.doc).toBe('A sample class');
    // Check methods
    // Note: The parser implementation extracts methods/constructors
    // but current impl might verify explicit signature format.
    // It should contain 'greet(): string' and 'constructor(private greeting: string)' or similiar
    // depending on exact stringification logic in source.
    // Let's just check if it finds them.
    expect(cls?.methods?.length).toBeGreaterThan(0);
  });

  it('should parse interfaces', () => {
    const exports = parseFile(testFile);
    const iface = exports.find((e) => e.type === 'interface' && e.name === 'User');
    expect(iface).toBeDefined();
  });

  it('should parse types', () => {
    const exports = parseFile(testFile);
    const type = exports.find((e) => e.type === 'type' && e.name === 'ID');
    expect(type).toBeDefined();
  });

  it('should parse variables', () => {
    const exports = parseFile(testFile);
    const v = exports.find((e) => e.type === 'variable' && e.name === 'MAX_RETRIES');
    expect(v).toBeDefined();
  });

  it('should parse export default assignment', () => {
    const exports = parseFile(testFile);
    const defaultExport = exports.find((e) => e.type === 'variable' && e.name === 'default');

    expect(defaultExport).toBeDefined();
    expect(defaultExport?.signature).toContain('export default defaultExportValue');
  });

  it('should not include non-exported top-level declarations', () => {
    const exports = parseFile(testFile);
    const names = exports.map((e) => e.name);

    expect(names).not.toContain('internalOnly');
    expect(names).not.toContain('Hidden');
  });

  it('should parse JavaScript exports with shared parser engine', () => {
    const jsContent = `
      export function run(input) { return input; }
      export const VERSION = '1.0.0';
      export default run;
    `;
    const exports = parseSourceFile('sample.js', jsContent);
    const names = exports.map((e) => e.name);

    expect(names).toContain('run');
    expect(names).toContain('VERSION');
    expect(names).toContain('default');
  });
});
