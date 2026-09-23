import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkNapConsistency } from './nap-consistency.js';

let browser: Browser;
let server: Server;
let origin: string;

// A hotel news article quoting a tourist office's number and postcode, while
// the hotel's own details sit in the footer, as on a real audited site.
const ARTICLE = `<html><body>
  <main><p>Renseignements à l'office de tourisme : 02 51 23 16 46, 12800 Naucelle.</p></main>
  <footer><a href="tel:+33251953771">Appelez-nous</a> 1 promenade, 85100 Les Sables</footer>
</body></html>`;

const JSON_LD = [
  {
    parsed: { '@type': 'Hotel', telephone: '+33 2 51 95 37 71', address: { postalCode: '85100' } },
  },
];

beforeAll(async () => {
  ({ browser } = await launchBrowser());
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(ARTICLE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('checkNapConsistency on a news article', () => {
  it('compares the structured data with the footer, not with numbers quoted in the article', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/fr/actu_10_journees-du-patrimoine.html`);
      const result = await checkNapConsistency(page, page.url(), JSON_LD as never);
      expect(result.visiblePhones).not.toContain('0251231646');
      expect(result.phoneMismatch).toBe(false);
      expect(result.postalCodeMismatch).toBe(false);
    } finally {
      await context.close();
    }
  });
});
