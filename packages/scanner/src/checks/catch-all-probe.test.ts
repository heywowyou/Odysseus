import http, { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catchAllTextSignatures } from '@odysseus/core';
import { analyzeRawDocument } from '../raw-document-signals.js';
import {
  MAX_CATCH_ALL_PROBES,
  catchAllProbePrefixes,
  catchAllProbeUrl,
  probeCatchAll,
} from './catch-all-probe.js';

const UA = 'OdysseusAuditBot/1.0 (+https://odysseusaudit.com/bot)';

// One layout for every page; the catch-all keeps the layout and says nothing
// about an error (yonahotel.com, 2026-09-30).
const layout = (main: string) =>
  `<html lang="en"><head><meta name="robots" content="noindex"></head><body><nav>Rooms Spa Contact</nav>${main}</body></html>`;
const shell = layout('<h2>Elsewhere starts Here</h2>');
const rooms = layout('<h1>Deluxe room</h1><p>Thirty square metres over the garden.</p>');

function serve(handler: http.RequestListener): Promise<{ server: Server; origin: string }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Expected TCP server.');
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe('catchAllProbePrefixes', () => {
  it('probes the root and each language prefix once', () => {
    expect(
      catchAllProbePrefixes([
        'https://hotel.example/',
        'https://hotel.example/fr/chambres',
        'https://hotel.example/en/rooms',
        'https://hotel.example/fr/spa',
        'https://hotel.example/restaurant',
        'https://hotel.example/pt-br/quartos',
      ]),
    ).toEqual(['', '/fr', '/en', '/pt-br']);
  });

  it('is bounded', () => {
    const urls = ['de', 'en', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'zh'].map(
      (code) => `https://hotel.example/${code}/`,
    );
    expect(catchAllProbePrefixes(urls)).toHaveLength(MAX_CATCH_ALL_PROBES);
  });
});

describe('probeCatchAll (plan 075 M7)', () => {
  let catchAll: { server: Server; origin: string };
  let honest: { server: Server; origin: string };

  beforeAll(async () => {
    catchAll = await serve((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(req.url === '/en/deluxe-room' ? rooms : shell);
    });
    honest = await serve((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(layout('<h1>Page not found</h1>'));
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => catchAll.server.close(() => resolve()));
    await new Promise<void>((resolve) => honest.server.close(() => resolve()));
  });

  it("matches a stale path's document and not a real page sharing the layout", async () => {
    const probe = await probeCatchAll(
      catchAllProbeUrl(catchAll.origin, '/en', 'a1b2c3d4'),
      5_000,
      UA,
    );
    const signatures = catchAllTextSignatures(
      [probe],
      analyzeRawDocument(layout('<h1>Welcome</h1>')).textSignature,
    );

    expect(signatures.has(analyzeRawDocument(shell).textSignature)).toBe(true);
    expect(signatures.has(analyzeRawDocument(rooms).textSignature)).toBe(false);
  });

  it('records no signature for a site that answers 404', async () => {
    const probe = await probeCatchAll(catchAllProbeUrl(honest.origin, '', 'a1b2c3d4'), 5_000, UA);

    expect(probe.httpStatus).toBe(404);
    expect(probe.textSignature).toBeUndefined();
  });
});
