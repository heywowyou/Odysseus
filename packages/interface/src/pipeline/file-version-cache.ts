/**
 * A value derived from a file, recomputed only when the file changes
 * (issue #511). The audit page and its report panel poll every five
 * seconds; re-reading and re-hashing report PDFs and re-parsing
 * findings.json on each poll cost tens of megabytes of reads a minute and
 * blocked the event loop during PDF renders. A file whose size and
 * modification time are unchanged is answered from memory; any rewrite
 * changes one of them and is read again.
 */

import { promises as fs } from 'node:fs';

interface Entry<T> {
  size: number;
  mtimeMs: number;
  value: T;
}

/** Undefined when the file is missing or unreadable, or `derive` throws. */
export function createFileVersionCache<T>(
  derive: (bytes: Buffer) => T,
): (filePath: string) => Promise<T | undefined> {
  const entries = new Map<string, Entry<T>>();
  return async (filePath) => {
    try {
      const stat = await fs.stat(filePath);
      const cached = entries.get(filePath);
      if (cached !== undefined && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
        return cached.value;
      }
      const value = derive(await fs.readFile(filePath));
      entries.set(filePath, { size: stat.size, mtimeMs: stat.mtimeMs, value });
      return value;
    } catch {
      entries.delete(filePath);
      return undefined;
    }
  };
}
