import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ensureDir,
  writeFileSafe,
  readFileSafe,
  fileExists,
  writeJSON,
  readJSON,
  normalizePath,
} from '../../src/core/fileio.js';

describe('FileIO', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'devmind-test-'));
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('should normalize paths', () => {
    const p = 'foo\\bar';
    expect(normalizePath(p)).toBe('foo/bar');
  });

  it('should ensure directory exists', async () => {
    const newDir = path.join(tempDir, 'nested/dir');
    await ensureDir(newDir);
    const exists = fs.existsSync(newDir);
    expect(exists).toBe(true);
  });

  it('should write file safely (creating dirs)', async () => {
    const filePath = path.join(tempDir, 'deep/test/file.txt');
    await writeFileSafe(filePath, 'hello world');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('hello world');
  });

  it('should read file safely', async () => {
    const filePath = path.join(tempDir, 'read.txt');
    await fs.promises.writeFile(filePath, 'read me');
    const content = await readFileSafe(filePath);
    expect(content).toBe('read me');
  });

  it('should check if file exists', async () => {
    const filePath = path.join(tempDir, 'exists.txt');
    expect(await fileExists(filePath)).toBe(false);
    await fs.promises.writeFile(filePath, '');
    expect(await fileExists(filePath)).toBe(true);
  });

  it('should write and read JSON', async () => {
    const filePath = path.join(tempDir, 'data.json');
    const data = { foo: 'bar', num: 123 };
    await writeJSON(filePath, data);
    const read = await readJSON(filePath);
    expect(read).toEqual(data);
  });
});
