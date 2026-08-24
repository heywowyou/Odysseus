/**
 * C7 (2026-08-24). The allowlist exists to keep html-validate from
 * duplicating axe's findings and from reporting house style as defects
 * (CLAUDE.md trade-off 1's lesson). These tests exercise that allowlist
 * against real markup run through the real library.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkHtmlValidity } from './html-validity.js';

function startServer(html: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}/` });
    });
  });
}

const doc = (body: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;

describe('checkHtmlValidity', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function run(html: string) {
    const { server, origin } = await startServer(html);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await checkHtmlValidity(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('reports nothing on well-formed markup', async () => {
    const result = await run(doc('<main><h1>Bonjour</h1><p>Texte.</p></main>'));
    expect(result.checked).toBe(true);
    expect(result.issues).toEqual([]);
  }, 30_000);

  it('reports duplicate ids, the gap axe left when it deprecated its own rule', async () => {
    const result = await run(doc('<div id="a"></div><div id="a"></div>'));
    expect(result.issues.map((i) => i.ruleId)).toContain('no-dup-id');
  }, 30_000);

  // The exact overlap CLAUDE.md trade-off 1 describes: html-validate's
  // own wcag/h37 rule is "<img> is missing required alt attribute", which
  // axe already reports as image-alt with its own severity.
  it('never reports an accessibility rule axe already owns', async () => {
    const result = await run(doc('<img src="/x.png"><a href="#"></a>'));
    expect(result.issues.map((i) => i.ruleId).filter((id) => id.startsWith('wcag/'))).toEqual([]);
  }, 30_000);

  it('never reports a house-style preference as a defect', async () => {
    // Lowercase doctype and unquoted attributes: html-validate's
    // recommended preset objects to both; neither is a defect.
    const result = await run('<!doctype html><html lang=fr><head><title>t</title></head><body><p>x</p></body></html>');
    const ids = result.issues.map((i) => i.ruleId);
    expect(ids).not.toContain('doctype-style');
    expect(ids).not.toContain('attr-quotes');
  }, 30_000);

  it('counts every issue even when the listing is capped', async () => {
    const many = Array.from({ length: 30 }, () => '<div id="dup"></div>').join('');
    const result = await run(doc(many));
    expect(result.issueCount).toBeGreaterThan(20);
    expect(result.issues.length).toBeLessThanOrEqual(20);
  }, 30_000);
});
