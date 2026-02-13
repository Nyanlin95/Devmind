import * as fs from 'fs/promises';
import * as path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { ensureDir } from './fileio.js';

interface CacheWriteOptions {
  compressAboveBytes?: number;
  pretty?: boolean;
}

async function tryRead(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function atomicWrite(filePath: string, data: Buffer): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, data);
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // Best effort; rename below will still surface hard failures.
  }
  await fs.rename(tempPath, filePath);
}

export async function readCacheJson<T>(jsonPath: string): Promise<T | null> {
  const jsonBuf = await tryRead(jsonPath);
  if (jsonBuf) {
    try {
      return JSON.parse(jsonBuf.toString('utf-8')) as T;
    } catch {
      return null;
    }
  }

  const gzipBuf = await tryRead(`${jsonPath}.gz`);
  if (!gzipBuf) return null;
  try {
    const unzipped = gunzipSync(gzipBuf).toString('utf-8');
    return JSON.parse(unzipped) as T;
  } catch {
    return null;
  }
}

export async function writeCacheJson(
  jsonPath: string,
  value: unknown,
  options: CacheWriteOptions = {},
): Promise<void> {
  const pretty = options.pretty ?? false;
  const compressAboveBytes = options.compressAboveBytes ?? 512 * 1024;
  const content = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  const buffer = Buffer.from(content, 'utf-8');

  await ensureDir(path.dirname(jsonPath));

  if (buffer.byteLength >= compressAboveBytes) {
    const gzPath = `${jsonPath}.gz`;
    await atomicWrite(gzPath, gzipSync(buffer));
    await fs.rm(jsonPath, { force: true });
    return;
  }

  await atomicWrite(jsonPath, buffer);
  await fs.rm(`${jsonPath}.gz`, { force: true });
}
