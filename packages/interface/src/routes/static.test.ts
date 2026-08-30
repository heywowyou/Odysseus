import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveStaticPath } from './static.js';

let publicDir: string;

beforeAll(async () => {
  publicDir = await mkdtemp(path.join(tmpdir(), 'odysseus-static-'));
  await writeFile(path.join(publicDir, 'index.html'), '<div id="root"></div>');
  await mkdir(path.join(publicDir, 'assets'), { recursive: true });
  await writeFile(path.join(publicDir, 'assets', 'index.js'), 'export {};');
});

afterAll(async () => {
  await rm(publicDir, { recursive: true, force: true });
});

describe('resolveStaticPath', () => {
  it('serves the SPA entry at the root', async () => {
    const resolution = await resolveStaticPath(publicDir, '/');
    expect(resolution).toEqual({
      kind: 'file',
      filePath: path.join(publicDir, 'index.html'),
    });
  });

  it('serves hashed assets before any fallback', async () => {
    const asset = path.join(publicDir, 'assets', 'index.js');
    const resolution = await resolveStaticPath(publicDir, '/assets/index.js');
    expect(resolution).toEqual({ kind: 'file', filePath: asset });
  });

  it('falls back to the SPA entry for a client-side audits route', async () => {
    const entry = path.join(publicDir, 'index.html');
    const resolution = await resolveStaticPath(publicDir, '/audits/abc');
    expect(resolution).toEqual({ kind: 'spa-fallback', filePath: entry });
  });

  it('falls back for the bare /audits and /scans prefixes', async () => {
    const entry = path.join(publicDir, 'index.html');
    expect(await resolveStaticPath(publicDir, '/audits')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/scans')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
  });

  it('does not treat prefixes that merely contain the words as app routes', async () => {
    const resolution = await resolveStaticPath(publicDir, '/audits-other.html');
    expect(resolution).toEqual({ kind: 'not-found' });
  });

  it('keeps 404 semantics outside the app routes', async () => {
    const resolution = await resolveStaticPath(publicDir, '/missing.html');
    expect(resolution).toEqual({ kind: 'not-found' });
  });

  it('keeps 404 semantics for app routes when the SPA is not built', async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), 'odysseus-static-empty-'));
    try {
      const resolution = await resolveStaticPath(emptyDir, '/audits');
      expect(resolution).toEqual({ kind: 'not-found' });
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('refuses traversal outside publicDir', async () => {
    const resolution = await resolveStaticPath(publicDir, '/../secrets.txt');
    expect(resolution).toEqual({ kind: 'forbidden' });
  });
});
