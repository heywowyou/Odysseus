import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkPlaceholderLabels } from './placeholder-labels.js';

function startStaticServer(html: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkPlaceholderLabels against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function checkHtml(html: string) {
    const { server, origin } = await startStaticServer(html);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await checkPlaceholderLabels(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('reports a field whose only name is its placeholder', async () => {
    const result = await checkHtml(
      `<body><form><input id="email" type="email" placeholder="Votre e-mail"><textarea placeholder="Message"></textarea></form></body>`,
    );
    expect(result.controls).toEqual([
      {
        selector: '#email',
        controlType: 'email',
        placeholder: 'Votre e-mail',
        hasOtherName: false,
      },
      {
        selector: 'body:nth-child(2) > form:nth-child(1) > textarea:nth-child(2)',
        controlType: 'textarea',
        placeholder: 'Message',
        hasOtherName: false,
      },
    ]);
  });

  it('recognises every other name source', async () => {
    const result = await checkHtml(`<body>
      <label for="a">Nom</label><input id="a" placeholder="Dupont">
      <label>Ville <input id="b" placeholder="Paris"></label>
      <span id="c-label">Téléphone</span><input id="c" aria-labelledby="c-label" placeholder="06">
      <input id="d" aria-label="Code postal" placeholder="75001">
      <input id="e" title="Recherche" placeholder="Rechercher">
    </body>`);
    expect(result.controls.map((c) => [c.selector, c.hasOtherName])).toEqual([
      ['#a', true],
      ['#b', true],
      ['#c', true],
      ['#d', true],
      ['#e', true],
    ]);
  });

  it('treats an empty label or a dangling aria-labelledby as no name', async () => {
    const result = await checkHtml(`<body>
      <label for="a"> </label><input id="a" placeholder="Nom">
      <input id="b" aria-labelledby="missing" placeholder="Ville">
    </body>`);
    expect(result.controls.map((c) => [c.selector, c.hasOtherName])).toEqual([
      ['#a', false],
      ['#b', false],
    ]);
  });

  it('skips hidden fields, non-text types and fields without a placeholder', async () => {
    const result = await checkHtml(`<body>
      <input type="hidden" placeholder="x">
      <input type="submit" placeholder="x">
      <input type="checkbox" placeholder="x">
      <input style="display:none" placeholder="x">
      <div hidden><input placeholder="x"></div>
      <input id="plain">
    </body>`);
    expect(result.controls).toEqual([]);
  });
});
