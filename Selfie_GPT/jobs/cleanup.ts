import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../lib/logger';

const root = path.join(process.cwd(), 'storage');

async function getConfigRetentionDays(): Promise<number> {
  try {
    const cfgPath = path.join(process.cwd(), 'prompts', 'config.json');
    const raw = await fs.readFile(cfgPath, 'utf8');
    const json = JSON.parse(raw) as { retentionDays?: number };
    return Math.max(1, Number(json.retentionDays || 365));
  } catch {
    return 365;
  }
}

async function removeOldFiles(baseDir: string, olderThanMs: number) {
  const now = Date.now();
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(baseDir, e.name);
    if (e.isDirectory()) {
      await removeOldFiles(p, olderThanMs);
      // remove empty user dirs
      const rest = await fs.readdir(p).catch(() => []);
      if (rest.length === 0) {
        await fs.rmdir(p).catch(() => {});
      }
      continue;
    }
    try {
      const stat = await fs.stat(p);
      if (now - stat.mtimeMs > olderThanMs) {
        await fs.unlink(p);
        logger.info({ file: p }, 'cleanup: removed old file');
      }
    } catch {}
  }
}

async function main() {
  const days = await getConfigRetentionDays();
  const ttlMs = days * 24 * 60 * 60 * 1000;
  await fs.mkdir(root, { recursive: true });
  await removeOldFiles(root, ttlMs);
  logger.info({ days }, 'cleanup: completed');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();



