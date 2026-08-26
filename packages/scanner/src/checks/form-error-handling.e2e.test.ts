import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkFormErrorHandling } from './form-error-handling.js';

function startStaticServer(
  routes: Record<string, string>,
  onRequest?: () => void,
): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      onRequest?.();
      const body = routes[req.url ?? '/'];
      if (body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkFormErrorHandling against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function checkHtml(html: string) {
    const { server, origin } = await startStaticServer({ '/': html });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await checkFormErrorHandling(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('detects a visual-only error: border changes on submit but no aria association', async () => {
    const html = `<body>
      <style>input:invalid { border: 2px solid red; }</style>
      <form id="newsletter">
        <input type="email" name="email" required />
        <button type="submit">Subscribe</button>
      </form>
    </body>`;

    const result = await checkHtml(html);

    expect(result.forms).toHaveLength(1);
    expect(result.forms[0]?.fields).toHaveLength(1);
    const field = result.forms[0]?.fields[0];
    expect(field?.visuallyChanged).toBe(true);
    expect(field?.ariaInvalidTrue).toBe(false);
    expect(field?.hasAssociatedErrorText).toBe(false);
    expect(field?.hasAlertRegionInForm).toBe(false);
  });

  it('detects a genuinely accessible error: aria-invalid and aria-describedby set on submit', async () => {
    const html = `<body>
      <style>input:invalid { border: 2px solid red; }</style>
      <form id="newsletter">
        <input type="email" name="email" required aria-describedby="email-error" />
        <span id="email-error"></span>
        <button type="submit">Subscribe</button>
        <script>
          document.getElementById('newsletter').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.querySelector('input[name=email]');
            input.setAttribute('aria-invalid', 'true');
            document.getElementById('email-error').textContent = 'Email is required';
          });
        </script>
      </form>
    </body>`;

    const result = await checkHtml(html);

    const field = result.forms[0]?.fields[0];
    expect(field?.ariaInvalidTrue).toBe(true);
    expect(field?.hasAssociatedErrorText).toBe(true);
  });

  it('skips forms with no empty required fields', async () => {
    const html = `<body>
      <form>
        <input type="email" name="email" required value="already-filled@example.com" />
        <button type="submit">Subscribe</button>
      </form>
    </body>`;

    const result = await checkHtml(html);

    expect(result.forms).toEqual([]);
  });

  it('SAFETY: never lets a real network request escape, even from a form with no validation gate at all', async () => {
    let destinationHits = 0;
    const destination = await startStaticServer({ '/submit': 'ok' }, () => {
      destinationHits += 1;
    });
    try {
      const html = `<body>
        <form id="unsafe">
          <input type="text" name="name" required />
          <button type="submit">Send</button>
        </form>
        <script>
          // Deliberately no client-side validation gate at all - fires
          // on any submit event regardless of field values, exactly the
          // narrow gap the request-blocking route in
          // checkFormErrorHandling exists to close.
          document.getElementById('unsafe').addEventListener('submit', (e) => {
            e.preventDefault();
            fetch('${destination.origin}/submit', { method: 'POST' });
          });
        </script>
      </body>`;

      await checkHtml(html);

      // Give any (blocked) fetch a moment to have resolved/failed before
      // asserting - the request should never have reached the server at
      // all, not merely resolved quickly.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(destinationHits).toBe(0);
    } finally {
      destination.server.close();
    }
  });

  it('SAFETY: never submits via a real trusted click either (regression guard - this check must never click the submit button)', async () => {
    let destinationHits = 0;
    const destination = await startStaticServer({ '/submit': 'ok' }, () => {
      destinationHits += 1;
    });
    try {
      const html = `<body>
        <form action="${destination.origin}/submit" method="POST">
          <input type="text" name="name" required />
          <button type="submit">Send</button>
        </form>
      </body>`;

      await checkHtml(html);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(destinationHits).toBe(0);
    } finally {
      destination.server.close();
    }
  });

  it('restores normal network access after the check completes (route is unrouted)', async () => {
    const { server, origin } = await startStaticServer({
      '/': `<body><form><input required /><button type="submit">Go</button></form></body>`,
      '/after.json': '{"ok":true}',
    });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(origin);
      await checkFormErrorHandling(page, origin);

      const response = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.ok;
      }, `${origin}/after.json`);

      expect(response).toBe(true);
      await context.close();
    } finally {
      server.close();
    }
  });
});
