/**
 * Reuses launchBrowser from @odysseus/scanner (the milestone's own
 * decision: reuse the Chromium lifecycle already built there, one browser
 * dependency, not a second Playwright entry point via Puppeteer). The CDP
 * debug port launchBrowser always opens is unused here; it exists for
 * Lighthouse's independent connection at scan time and is harmless idle
 * weight for a plain print-to-PDF.
 */

import { launchBrowser } from '@odysseus/scanner';

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const { browser } = await launchBrowser();
  try {
    const page = await browser.newPage();
    // The HTML is fully self-contained (CSS inlined, screenshots as data
    // URIs), so there is nothing to wait on network-wise; 'load' is enough.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return pdf;
  } finally {
    await browser.close();
  }
}
