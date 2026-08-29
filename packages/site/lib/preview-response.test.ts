import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_SECURITY_HEADERS, resolvePreviewResponse } from './preview-response';
import { createPreviewReader, PREVIEW_EXPIRY_METADATA_HEADER } from './read-preview';
import type { PreviewReader } from './read-preview';

const fixture = JSON.parse(
  readFileSync(
    // Resolved from this file, not the working directory: the workspace runs
    // Vitest from the repository root and the site's own scripts do not.
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      'fixtures',
      'outreach-preview-keys.json',
    ),
    'utf8',
  ),
) as { cases: { token: string; objectKey: string }[] };

const TOKEN = fixture.cases[0]?.token ?? '';
const OBJECT_KEY = fixture.cases[0]?.objectKey ?? '';
const HTML = '<!doctype html><title>Aperçu</title><p>Bonjour</p>';
const NOW = new Date('2026-09-01T00:00:00.000Z');

function reader(object: { html: string; publicExpiresAt: Date } | null): PreviewReader {
  return { read: () => Promise.resolve(object) };
}

describe('resolvePreviewResponse', () => {
  it('serves a live preview unchanged, with the security headers attached', async () => {
    const response = await resolvePreviewResponse({
      token: TOKEN,
      reader: reader({ html: HTML, publicExpiresAt: new Date('2026-09-20T00:00:00.000Z') }),
      now: NOW,
    });

    expect(response.status).toBe(200);
    expect(response.body).toBe(HTML);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('looks the object up by the derived key and nothing else', async () => {
    const read = vi.fn().mockResolvedValue(null);
    await resolvePreviewResponse({ token: TOKEN, reader: { read }, now: NOW });
    expect(read).toHaveBeenCalledWith(OBJECT_KEY);
  });

  it('answers 404 for an unknown preview', async () => {
    const response = await resolvePreviewResponse({ token: TOKEN, reader: reader(null), now: NOW });
    expect(response.status).toBe(404);
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
  });

  it.each([
    ['malformed', 'not-a-token'],
    ['path traversal', '../../etc/passwd'],
    ['empty', ''],
  ])('answers 404 for a %s token without touching the bucket', async (_name, token) => {
    const read = vi.fn();
    const response = await resolvePreviewResponse({ token, reader: { read }, now: NOW });
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it('gives the same answer and body for malformed, unknown and revoked', async () => {
    const malformed = await resolvePreviewResponse({
      token: 'nope',
      reader: reader(null),
      now: NOW,
    });
    // A revoked preview's object is deleted, so it reads exactly as unknown.
    const revoked = await resolvePreviewResponse({ token: TOKEN, reader: reader(null), now: NOW });
    expect(malformed.status).toBe(revoked.status);
    expect(malformed.body).toBe(revoked.body);
  });

  it('answers 410 once the public lifetime has passed', async () => {
    const response = await resolvePreviewResponse({
      token: TOKEN,
      reader: reader({ html: HTML, publicExpiresAt: new Date('2026-08-30T00:00:00.000Z') }),
      now: NOW,
    });
    expect(response.status).toBe(410);
    expect(response.body).not.toContain(HTML);
  });

  it('treats the expiry instant itself as expired', async () => {
    const atExpiry = await resolvePreviewResponse({
      token: TOKEN,
      reader: reader({ html: HTML, publicExpiresAt: NOW }),
      now: NOW,
    });
    const aMillisecondBefore = await resolvePreviewResponse({
      token: TOKEN,
      reader: reader({ html: HTML, publicExpiresAt: new Date(NOW.getTime() + 1) }),
      now: NOW,
    });
    expect(atExpiry.status).toBe(410);
    expect(aMillisecondBefore.status).toBe(200);
  });

  it('never puts the token in a response body or header', async () => {
    const response = await resolvePreviewResponse({
      token: TOKEN,
      reader: reader({ html: HTML, publicExpiresAt: new Date('2026-09-20T00:00:00.000Z') }),
      now: NOW,
    });
    expect(JSON.stringify(response.headers)).not.toContain(TOKEN);
    expect(response.body).not.toContain(TOKEN);
  });

  it('lets a provider failure surface rather than reporting it as absent', async () => {
    const failing: PreviewReader = {
      read: () => Promise.reject(new Error('provider unavailable')),
    };
    await expect(
      resolvePreviewResponse({ token: TOKEN, reader: failing, now: NOW }),
    ).rejects.toThrow(/provider unavailable/u);
  });

  it('declares a policy the published document can actually satisfy', () => {
    const policy = PREVIEW_SECURITY_HEADERS['content-security-policy'] ?? '';
    // Plan 008's document is inline CSS plus data-URI PNGs and no script.
    expect(policy).toContain('img-src data:');
    expect(policy).toContain("style-src 'unsafe-inline'");
    expect(policy).not.toContain('script-src');
    expect(policy).toContain("frame-ancestors 'none'");
  });
});

describe('createPreviewReader', () => {
  const config = {
    bucket: 'odysseus-previews-test',
    endpoint: 'https://s3.fr-par.scw.cloud',
    region: 'fr-par',
    accessKeyId: 'AKIATESTTESTTEST',
    secretAccessKey: 'secret-not-a-real-key',
  };

  it('signs a virtual-host-style GET for exactly the key it was given', async () => {
    const requests: Request[] = [];
    const fetchImpl = (async (input: unknown): Promise<Response> => {
      requests.push((input as Request).clone());
      return new Response(HTML, {
        status: 200,
        headers: { [PREVIEW_EXPIRY_METADATA_HEADER]: '2026-09-20T00:00:00.000Z' },
      });
    }) as typeof globalThis.fetch;

    const stored = await createPreviewReader({ ...config, fetchImpl }).read(OBJECT_KEY);

    expect(stored?.html).toBe(HTML);
    expect(stored?.publicExpiresAt.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `https://odysseus-previews-test.s3.fr-par.scw.cloud/${OBJECT_KEY}`,
    );
    expect(requests[0]?.headers.get('authorization')).toContain('AWS4-HMAC-SHA256');
  });

  it.each([404, 403])('reads status %i as absent', async (status) => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('', { status }))) as typeof globalThis.fetch;
    await expect(
      createPreviewReader({ ...config, fetchImpl }).read(OBJECT_KEY),
    ).resolves.toBeNull();
  });

  it('treats an object with no usable expiry metadata as absent', async () => {
    const noHeader = (() =>
      Promise.resolve(new Response(HTML, { status: 200 }))) as typeof globalThis.fetch;
    await expect(
      createPreviewReader({ ...config, fetchImpl: noHeader }).read(OBJECT_KEY),
    ).resolves.toBeNull();

    const badHeader = (() =>
      Promise.resolve(
        new Response(HTML, {
          status: 200,
          headers: { [PREVIEW_EXPIRY_METADATA_HEADER]: 'not-a-date' },
        }),
      )) as typeof globalThis.fetch;
    await expect(
      createPreviewReader({ ...config, fetchImpl: badHeader }).read(OBJECT_KEY),
    ).resolves.toBeNull();
  });

  it('throws on a provider error rather than serving a 404', async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('', { status: 500 }))) as typeof globalThis.fetch;
    await expect(createPreviewReader({ ...config, fetchImpl }).read(OBJECT_KEY)).rejects.toThrow(
      /status 500/u,
    );
  });
});
