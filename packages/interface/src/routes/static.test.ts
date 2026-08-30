import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveStaticPath } from './static.js';

let publicDir: string;

beforeAll(async () => {
  publicDir = await mkdtemp(path.join(tmpdir(), 'odysseus-static-'));
  await writeFile(path.join(publicDir, 'index.html'), '<p>old index</p>');
  await mkdir(path.join(publicDir, 'dashboard'), { recursive: true });
  await writeFile(path.join(publicDir, 'dashboard', 'index.html'), '<div id="root"></div>');
});

afterAll(async () => {
  await rm(publicDir, { recursive: true, force: true });
});

describe('resolveStaticPath', () => {
  it('serves the root page as index.html', async () => {
    const resolution = await resolveStaticPath(publicDir, '/');
    expect(resolution).toEqual({
      kind: 'file',
      filePath: path.join(publicDir, 'index.html'),
    });
  });

  it('serves an exact dashboard asset before any fallback', async () => {
    const entry = path.join(publicDir, 'dashboard', 'index.html');
    const resolution = await resolveStaticPath(publicDir, '/dashboard/index.html');
    expect(resolution).toEqual({ kind: 'file', filePath: entry });
  });

  it('falls back to the dashboard entry for a client-side route', async () => {
    const entry = path.join(publicDir, 'dashboard', 'index.html');
    const resolution = await resolveStaticPath(publicDir, '/dashboard/audits/abc');
    expect(resolution).toEqual({ kind: 'spa-fallback', filePath: entry });
  });

  it('treats /dashboard without a trailing slash as the app entry', async () => {
    const entry = path.join(publicDir, 'dashboard', 'index.html');
    const resolution = await resolveStaticPath(publicDir, '/dashboard');
    expect(resolution).toEqual({ kind: 'spa-fallback', filePath: entry });
  });

  it('keeps 404 semantics outside the dashboard prefix', async () => {
    const resolution = await resolveStaticPath(publicDir, '/missing.html');
    expect(resolution).toEqual({ kind: 'not-found' });
  });

  it('keeps 404 semantics for dashboard routes when the app is not built', async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), 'odysseus-static-empty-'));
    try {
      const resolution = await resolveStaticPath(emptyDir, '/dashboard/audits');
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
