import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const root = path.join(process.cwd(), 'storage');

export const ensureUserDir = async (phoneId: string) => {
  const dir = path.join(root, phoneId);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
};

const pad4 = (n: number) => n.toString().padStart(4, '0');

export const getNextIndex = async (phoneId: string) => {
  const dir = await ensureUserDir(phoneId);
  const files = await fsp.readdir(dir).catch(() => [] as string[]);
  const indices = files
    .map((f) => (f.match(/^(\d{4})/) ? Number(RegExp.$1) : 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const last = indices.length ? indices[indices.length - 1] : 0;
  return last + 1;
};

export const saveOriginal = async (phoneId: string, data: Buffer, ext: string) => {
  const dir = await ensureUserDir(phoneId);
  const idx = await getNextIndex(phoneId);
  const filename = `${pad4(idx)}.${ext.replace(/^\./, '')}`;
  const full = path.join(dir, filename);
  await fsp.writeFile(full, data);
  return { indexNumber: idx, fullPath: full, filename };
};

export const saveVariant = async (phoneId: string, indexNumber: number, mode: number, data: Buffer) => {
  const dir = await ensureUserDir(phoneId);
  const filename = `${pad4(indexNumber)}_${mode}.png`;
  const full = path.join(dir, filename);
  await fsp.writeFile(full, data);
  return { fullPath: full, filename };
};

export const listUserFiles = async (phoneId: string, offset: number, limit: number) => {
  const dir = await ensureUserDir(phoneId);
  const files = (await fsp.readdir(dir)).sort((a, b) => (a < b ? 1 : -1));
  const page = files.slice(offset, offset + limit);
  return { files: page.map((f) => path.join(dir, f)), total: files.length };
};

export const deleteAllUserData = async (phoneId: string) => {
  const dir = path.join(root, phoneId);
  await fsp.rm(dir, { recursive: true, force: true });
};

export const getLatestOriginal = async (
  phoneId: string
): Promise<{ indexNumber: number; fullPath: string; filename: string } | null> => {
  const dir = await ensureUserDir(phoneId);
  const files = await fsp.readdir(dir).catch(() => [] as string[]);
  const originals = files
    .filter((f) => /^\d{4}\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort((a, b) => (a < b ? 1 : -1));
  if (!originals.length) return null;
  const filename = originals[0];
  const idx = Number(filename.slice(0, 4));
  return { indexNumber: idx, fullPath: path.join(dir, filename), filename };
};


