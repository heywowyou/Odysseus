import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentTypeForPath, resolveStaticPath } from './static.js';
import { isHtmlContentType, SPA_CONTENT_SECURITY_POLICY } from '../security-headers.js';

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

  it('falls back for the dashboard prospects and outreach routes', async () => {
    const entry = path.join(publicDir, 'index.html');
    expect(await resolveStaticPath(publicDir, '/prospects')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/prospects/abc/evidence')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/outreach')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/outreach/drafts')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
  });

  it('falls back for the a-traiter landing page and the renamed outreach routes', async () => {
    // Plan 040 slice 6: the renamed pages live at new top-level prefixes,
    // and the retired /outreach URLs still reach the SPA whose router
    // redirects them.
    const entry = path.join(publicDir, 'index.html');
    expect(await resolveStaticPath(publicDir, '/a-traiter')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/resultats')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/ne-pas-contacter')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
    expect(await resolveStaticPath(publicDir, '/outreach/outcomes')).toEqual({
      kind: 'spa-fallback',
      filePath: entry,
    });
  });

  it('does not treat prefixes that merely contain the words as app routes', async () => {
    const resolution = await resolveStaticPath(publicDir, '/audits-other.html');
    expect(resolution).toEqual({ kind: 'not-found' });
  });

  it('serves the shell for an extensionless unknown dashboard path', async () => {
    const entry = path.join(publicDir, 'index.html');
    const resolution = await resolveStaticPath(publicDir, '/does-not-exist');
    expect(resolution).toEqual({ kind: 'spa-fallback', filePath: entry });
  });

  it('keeps 404 semantics for file-looking paths outside the app routes', async () => {
    const resolution = await resolveStaticPath(publicDir, '/missing.html');
    expect(resolution).toEqual({ kind: 'not-found' });
  });

  it('never serves the dashboard shell for an unknown API endpoint', async () => {
    const resolution = await resolveStaticPath(publicDir, '/api/missing');
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

describe('contentTypeForPath', () => {
  it('serves the favicon files with image types so nosniff browsers accept them', () => {
    expect(contentTypeForPath('/public/assets/favicon-abc.svg')).toBe('image/svg+xml');
    expect(contentTypeForPath('/public/assets/favicon-abc.ico')).toBe('image/x-icon');
  });

  it('keeps unknown extensions as opaque binaries', () => {
    expect(contentTypeForPath('/public/assets/data.bin')).toBe('application/octet-stream');
  });
});

describe('SPA shell content security policy', () => {
  it('gates the policy on the HTML content type the fallback computes', () => {
    expect(isHtmlContentType('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlContentType('text/css; charset=utf-8')).toBe(false);
    expect(isHtmlContentType('text/javascript; charset=utf-8')).toBe(false);
    expect(isHtmlContentType('application/octet-stream')).toBe(false);
  });

  it('keeps the policy scoped to self-hosted assets with no framing', () => {
    expect(SPA_CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(SPA_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });
});
