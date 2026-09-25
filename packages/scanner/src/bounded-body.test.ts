import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gunzipBounded,
  isServedPlainTextFile,
  readBoundedBytes,
  readBoundedText,
  readTextPrefix,
  ResponseBodyTooLargeError,
} from './bounded-body.js';
import { fetchRobotsText } from './robots.js';
import { checkLlmsTxt } from './checks/llms-txt.js';

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`);
    });
  });
}

describe('bounded body reads (issue #486)', () => {
  it('refuses a streamed body past the ceiling', async () => {
    const origin = await serve((_req, res) => {
      // No content-length: the limit has to be enforced while streaming.
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('x'.repeat(4096));
      res.end('x'.repeat(4096));
    });
    const response = await fetch(`${origin}/big`);
    await expect(readBoundedBytes(response, 1024)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError,
    );
  });

  it('refuses a declared content-length past the ceiling before reading', async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': '8192' }).end('y'.repeat(8192));
    });
    await expect(readBoundedText(await fetch(`${origin}/`), 1024)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError,
    );
  });

  it('returns a body within the ceiling whole', async () => {
    const origin = await serve((_req, res) => {
      res.end('bonjour');
    });
    expect(await readBoundedText(await fetch(`${origin}/`), 1024)).toBe('bonjour');
  });

  it('reads only a prefix when content past the limit may be ignored', async () => {
    const origin = await serve((_req, res) => {
      res.end('a'.repeat(10_000));
    });
    expect(await readTextPrefix(await fetch(`${origin}/`), 100)).toBe('a'.repeat(100));
  });

  it('refuses a gzip bomb without inflating it past the ceiling', () => {
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(() => gunzipBounded(bomb, 1024 * 1024, 'https://example.com/sitemap.xml.gz')).toThrow(
      ResponseBodyTooLargeError,
    );
    expect(gunzipBounded(gzipSync(Buffer.from('<urlset/>')), 1024, 'x').toString()).toBe(
      '<urlset/>',
    );
  });
});

describe('isServedPlainTextFile (issue #495)', () => {
  const headers = (contentType: string) => new Headers({ 'content-type': contentType });

  it('accepts a plain-text file at the requested path', () => {
    expect(
      isServedPlainTextFile(
        'https://hotel.fr/llms.txt',
        { url: 'https://hotel.fr/llms.txt', headers: headers('text/plain') },
        '# Hôtel',
      ),
    ).toBe(true);
  });

  it('refuses a redirect to another path, an HTML type, or a markup body', () => {
    expect(
      isServedPlainTextFile(
        'https://hotel.fr/llms.txt',
        { url: 'https://hotel.fr/', headers: headers('text/plain') },
        '# x',
      ),
    ).toBe(false);
    expect(
      isServedPlainTextFile(
        'https://hotel.fr/robots.txt',
        { url: 'https://hotel.fr/robots.txt', headers: headers('text/html; charset=utf-8') },
        'User-agent: *',
      ),
    ).toBe(false);
    expect(
      isServedPlainTextFile(
        'https://hotel.fr/robots.txt',
        { url: 'https://hotel.fr/robots.txt', headers: headers('text/plain') },
        '\n  <!doctype html><html>',
      ),
    ).toBe(false);
  });
});

describe('well-known files served as stand-ins (issue #495)', () => {
  it('does not count a /llms.txt redirected to the homepage as found', async () => {
    const origin = await serve((req, res) => {
      if (req.url === '/llms.txt') {
        res.writeHead(301, { location: '/' }).end();
        return;
      }
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<!doctype html><title>Hôtel</title>');
    });
    expect((await checkLlmsTxt(origin, 5000)).found).toBe(false);
  });

  it('counts a plain-text /llms.txt as found', async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('# Hôtel\n');
    });
    expect((await checkLlmsTxt(origin, 5000)).found).toBe(true);
  });

  it('does not parse an HTML page served at /robots.txt', async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><div id="app">');
    });
    expect(await fetchRobotsText(origin, 5000)).toBeNull();
  });

  it('returns a plain-text robots.txt', async () => {
    const origin = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nDisallow: /admin\n');
    });
    expect(await fetchRobotsText(origin, 5000)).toBe('User-agent: *\nDisallow: /admin\n');
  });
});
