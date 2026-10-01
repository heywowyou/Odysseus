import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkFormErrorHandling } from './form-error-handling.js';

/** `onRequest` reports the method and path, never just "something arrived":
 *  a safety assertion that counts every request cannot tell a real escaped
 *  form submission from a 404 probe or a speculative connection, and issue 16
 *  could not be triaged until the two were distinguishable. */
function startStaticServer(
  routes: Record<string, string>,
  onRequest?: (method: string, url: string) => void,
): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      onRequest?.(req.method ?? '', req.url ?? '');
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

/** Waits until the observed count has stopped moving, rather than sleeping a
 *  fixed span and hoping the window was long enough. A fixed sleep makes a
 *  safety assertion timing-dependent in exactly the direction that hides a
 *  defect: under load the escape can land after the sleep and the test passes. */
async function countWhenQuiet(getCount: () => number, quietMs = 250, maxMs = 3_000) {
  const deadline = Date.now() + maxMs;
  let count = getCount();
  let lastChange = Date.now();
  while (Date.now() < deadline && Date.now() - lastChange < quietMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const next = getCount();
    if (next !== count) {
      count = next;
      lastChange = Date.now();
    }
  }
  return count;
}

describe('checkFormErrorHandling against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  /** `beforeTeardown` runs with the page still open, which is the only way a
   *  safety assertion about escaped requests means anything: closing the
   *  context cancels whatever the page still had pending, so a check that
   *  counted hits after teardown would report a clean result for a request
   *  the teardown itself killed. A real scan leaves the page open for the
   *  passes that follow this one, so the test must too. */
  async function checkHtml(html: string, beforeTeardown?: () => Promise<void>) {
    const { server, origin } = await startStaticServer({ '/': html });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      const result = await checkFormErrorHandling(page, origin);
      await beforeTeardown?.();
      return result;
    } finally {
      await context.close();
      server.close();
    }
  }

  it('records a native validation error, which the browser itself announces', async () => {
    const html = `<body>
      <style>input:invalid { border: 2px solid red; }</style>
      <form id="newsletter">
        <input type="email" name="email" required />
        <button type="submit">Subscribe</button>
      </form>
    </body>`;

    const result = await checkHtml(html);

    expect(result.forms).toHaveLength(1);
    const field = result.forms[0]?.fields[0];
    expect(field?.visuallyChanged).toBe(true);
    expect(field?.nativelyInvalid).toBe(true);
  });

  it('detects a visual-only error: a script paints the border in a novalidate form', async () => {
    const html = `<body>
      <style>.error { border: 2px solid red; }</style>
      <form id="newsletter" novalidate>
        <input type="email" name="email" required />
        <button type="submit">Subscribe</button>
      </form>
      <script>
        document.getElementById('newsletter').addEventListener('submit', (event) => {
          event.preventDefault();
          for (const input of event.target.querySelectorAll('[required]')) {
            if (input.value === '') input.classList.add('error');
          }
        });
      </script>
    </body>`;

    const result = await checkHtml(html);

    expect(result.forms).toHaveLength(1);
    expect(result.forms[0]?.fields).toHaveLength(1);
    const field = result.forms[0]?.fields[0];
    expect(field?.visuallyChanged).toBe(true);
    expect(field?.nativelyInvalid).toBe(false);
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
    let submissions = 0;
    const destination = await startStaticServer({ '/submit': 'ok' }, (method, url) => {
      if (method === 'POST' && url === '/submit') submissions += 1;
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

      // The request must never have reached the server at all, not merely
      // have resolved quickly.
      let observed = -1;
      await checkHtml(html, async () => {
        observed = await countWhenQuiet(() => submissions);
      });

      expect(observed).toBe(0);
    } finally {
      destination.server.close();
    }
  });

  it('SAFETY: blocks a submit handler whose network call lands after the check has finished inspecting', async () => {
    let submissions = 0;
    const destination = await startStaticServer({ '/submit': 'ok' }, (method, url) => {
      if (method === 'POST' && url === '/submit') submissions += 1;
    });
    try {
      // Deferring the call is what makes this deterministic rather than
      // timing-dependent: the request is guaranteed to be created after the
      // triggering evaluate call has already returned. Stubbing the page's
      // network entry points cannot help here (they are restored by then), so
      // this form is covered only by the request-blocking route, and only if
      // that route is still installed. Tearing it down the moment evaluate
      // resolved escaped 10 times out of 10; holding it until the page goes
      // quiet escapes 0 times out of 10.
      const html = `<body>
        <form id="unsafe">
          <input type="text" name="name" required />
          <button type="submit">Send</button>
        </form>
        <script>
          document.getElementById('unsafe').addEventListener('submit', (e) => {
            e.preventDefault();
            setTimeout(() => fetch('${destination.origin}/submit', { method: 'POST' }), 50);
          });
        </script>
      </body>`;

      let observed = -1;
      await checkHtml(html, async () => {
        observed = await countWhenQuiet(() => submissions);
      });

      expect(observed).toBe(0);
    } finally {
      destination.server.close();
    }
  });

  it('SAFETY: never submits via a real trusted click either (regression guard - this check must never click the submit button)', async () => {
    let submissions = 0;
    const destination = await startStaticServer({ '/submit': 'ok' }, (method, url) => {
      if (method === 'POST' && url === '/submit') submissions += 1;
    });
    try {
      const html = `<body>
        <form action="${destination.origin}/submit" method="POST">
          <input type="text" name="name" required />
          <button type="submit">Send</button>
        </form>
      </body>`;

      let observed = -1;
      await checkHtml(html, async () => {
        observed = await countWhenQuiet(() => submissions);
      });

      expect(observed).toBe(0);
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
