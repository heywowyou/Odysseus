import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { walkKeyboardNavigation } from './keyboard-navigation.js';

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

describe('walkKeyboardNavigation against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function walkHtml(html: string) {
    const { server, origin } = await startStaticServer(html);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await walkKeyboardNavigation(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('walks a normal page forward through every tabbable element in DOM order, no trap', async () => {
    const html = `<body>
      <a href="/a">First</a>
      <a href="/b">Second</a>
      <button>Third</button>
    </body>`;

    const result = await walkHtml(html);

    expect(result.tabbableCount).toBe(3);
    // First three Tab presses should visit ids 0, 1, 2 in order.
    expect(result.focusSequence.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it('excludes disabled, aria-hidden, and tabindex=-1 elements from the tabbable set', async () => {
    const html = `<body>
      <a href="/a">Included</a>
      <button disabled>Disabled</button>
      <button tabindex="-1">Not tabbable</button>
      <button aria-hidden="true">Hidden</button>
      <button>Also included</button>
    </body>`;

    const result = await walkHtml(html);

    expect(result.tabbableCount).toBe(2);
  });

  it('detects a real keyboard trap: focus stuck on the same element across consecutive Tab presses', async () => {
    const html = `<body>
      <a href="/a">Before</a>
      <button id="trap">Trapped here</button>
      <a href="/b">Never reached</a>
      <script>
        document.getElementById('trap').addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            e.target.focus();
          }
        });
      </script>
    </body>`;

    const result = await walkHtml(html);

    // Once focus lands on the trapped button (tabbable id 1), every
    // subsequent Tab press must re-report the same id.
    const trapIndex = result.focusSequence.indexOf(1);
    expect(trapIndex).toBeGreaterThanOrEqual(0);
    expect(result.focusSequence[trapIndex + 1]).toBe(1);
    expect(result.focusSequence[trapIndex + 2]).toBe(1);
  });

  it('reflects a real positive-tabindex reorder in the observed focus sequence', async () => {
    const html = `<body>
      <a href="/a" tabindex="2">DOM-first, tab-second</a>
      <a href="/b" tabindex="1">DOM-second, tab-first</a>
      <a href="/c">DOM-third, natural order</a>
    </body>`;

    const result = await walkHtml(html);

    // Chromium visits explicit positive tabindex values in ascending
    // order before any tabindex="0"/implicit element - id 1 (tabindex=1)
    // should be focused before id 0 (tabindex=2).
    const firstTwo = result.focusSequence.slice(0, 2);
    expect(firstTwo).toEqual([1, 0]);
  });

  // Plan 075 J3: a popup open on load that keeps focus inside itself.
  const focusHoldingDialog = (attributes: string) => `<body>
      <div ${attributes}>
        <button id="d1">Accept</button>
        <button id="d2">Close</button>
      </div>
      ${Array.from({ length: 12 }, (_, i) => `<a href="/p${i}">Page link ${i}</a>`).join('\n')}
      <script>
        const dialog = document.querySelector('[data-holder]');
        const controls = [...dialog.querySelectorAll('button')];
        controls[0].focus();
        dialog.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const next = controls[(controls.indexOf(document.activeElement) + 1) % controls.length];
            next.focus();
          }
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !dialog.hasAttribute('data-consent')) {
            dialog.remove();
            document.body.focus();
          }
        });
      </script>
    </body>`;

  it('records the dialog that holds focus, and walks the page again after Escape closes it', async () => {
    const result = await walkHtml(
      focusHoldingDialog('data-holder role="dialog" aria-modal="true" id="promo"'),
    );

    expect(result.tabbableContainers.slice(0, 2)).toEqual(['#promo', '#promo']);
    expect(result.tabbableContainers.slice(2).every((container) => container === null)).toBe(true);
    expect(result.escapeRetried).toBe(true);
    // The second walk reaches the page's own links (ids 2 onwards).
    expect(result.focusSequence.some((id) => id !== null && id >= 2)).toBe(true);
  });

  it('never dismisses a consent banner, and leaves the held walk for core to set aside', async () => {
    const result = await walkHtml(focusHoldingDialog('data-holder data-consent id="didomi-host"'));

    expect(result.tabbableContainers.slice(0, 2)).toEqual(['#didomi-host', '#didomi-host']);
    expect(result.escapeRetried).toBeUndefined();
    expect(new Set(result.focusSequence)).toEqual(new Set([0, 1]));
  });

  it('returns an empty walk for a page with nothing tabbable', async () => {
    const result = await walkHtml('<body><p>No interactive elements here.</p></body>');
    expect(result.tabbableCount).toBe(0);
    expect(result.focusSequence).toEqual([]);
  });
});
