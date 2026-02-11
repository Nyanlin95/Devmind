/**
 * File I/O utilities with error handling
 */
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const access = promisify(fs.access);
export async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}
export async function writeFileSafe(filePath, content) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await writeFile(filePath, content, 'utf-8');
}
export async function readFileSafe(filePath) {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}
export async function fileExists(filePath) {
  try {
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
export function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/');
}
export async function writeJSON(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  await writeFileSafe(filePath, content);
}
export async function readJSON(filePath) {
  const content = await readFileSafe(filePath);
  return JSON.parse(content);
}
//# sourceMappingURL=fileio.js.map
