import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileVersionCache } from './file-version-cache.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-version-cache-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('createFileVersionCache (issue #511)', () => {
  it('derives an unchanged file once, and again after it is rewritten', async () => {
    let derivations = 0;
    const read = createFileVersionCache((bytes) => {
      derivations += 1;
      return bytes.toString('utf-8').length;
    });
    const file = path.join(dir, 'findings.json');
    await fs.writeFile(file, '[1,2]');

    expect(await read(file)).toBe(5);
    expect(await read(file)).toBe(5);
    expect(derivations).toBe(1);

    await fs.writeFile(file, '[1,2,3]');
    // A rewrite within the filesystem's timestamp granularity still changes
    // the size here; the next read derives again.
    expect(await read(file)).toBe(7);
    expect(derivations).toBe(2);
  });

  it('answers undefined for a missing file or a derivation that throws', async () => {
    const read = createFileVersionCache((bytes) => JSON.parse(bytes.toString('utf-8')) as unknown);
    expect(await read(path.join(dir, 'absent.json'))).toBeUndefined();
    const broken = path.join(dir, 'broken.json');
    await fs.writeFile(broken, '{');
    expect(await read(broken)).toBeUndefined();
  });
});
