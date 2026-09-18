import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactStore } from './artifact-store.js';

/**
 * Local-disk ArtifactStore for offline corpus runs and tests: the same
 * get/put/list/delete contract as the Scaleway store, rooted at one
 * directory. A benchmark run against saved audits stores private candidates
 * on this machine instead of requiring bucket credentials. Keys are joined
 * under the root after rejecting paths that would escape it, and writes land
 * through a temp-file rename so a reader never observes a partial object.
 */
export class LocalDirArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error(`artifact key escapes the local store root: ${key}`);
    }
    return target;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fsp.readFile(this.resolveKey(key));
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.tmp-${process.pid}-${randomUUID()}`;
    await fsp.writeFile(temp, bytes);
    await fsp.rename(temp, target);
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const key = path.relative(this.root, full).split(path.sep).join('/');
          if (key.startsWith(prefix)) keys.push(key);
        }
      }
    };
    await walk(this.root);
    keys.sort();
    return keys;
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolveKey(key), { force: true });
  }
}
