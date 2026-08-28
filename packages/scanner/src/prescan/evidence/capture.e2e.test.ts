import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import type { RankedHotelFailure } from '@odysseus/core';
import { launchBrowser } from '../../browser.js';
import { captureFirstMeasuredFailure } from './capture.js';

let browser: Browser;
let page: Page;

function failure(selector: string): RankedHotelFailure {
  return {
    source: 'axe',
    ruleId: 'color-contrast',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    pageRole: 'booking',
    pageUrl: 'https://fixture.invalid/book',
    selector,
    factRef: `fact_${'a'.repeat(24)}`,
    priority: 2,
    selectionReason: 'booking-call-to-action',
  };
}

describe('measured failure capture', () => {
  beforeAll(async () => {
    ({ browser } = await launchBrowser());
    const context = await browser.newContext({ viewport: { width: 320, height: 240 } });
    page = await context.newPage();
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('clips to the viewport and restores the exact DOM annotation state', async () => {
    await page.setContent(`
      <style>body { margin: 0; height: 900px } #target { position: absolute; left: 285px; top: 210px; width: 80px; height: 50px; color: #777; }</style>
      <button id="target" style="border: 1px solid black">Book</button>
    `);
    const beforeStyle = await page.locator('#target').getAttribute('style');
    const captured = await captureFirstMeasuredFailure(browser, page, [failure('#target')]);
    expect(captured).not.toBeNull();
    expect(captured!.width).toBeGreaterThanOrEqual(240);
    expect(captured!.height).toBeGreaterThanOrEqual(160);
    expect(captured!.width).toBeLessThanOrEqual(320);
    expect(captured!.height).toBeLessThanOrEqual(240);
    expect(await page.locator('#target').getAttribute('style')).toBe(beforeStyle);
    expect(await page.locator('#odysseus-evidence-callout').count()).toBe(0);
    expect(await page.locator('#odysseus-evidence-outline').count()).toBe(0);
  });

  it('skips hidden, detached, ambiguous, and iframe-only targets', async () => {
    await page.setContent(`
      <button class="ambiguous">One</button><button class="ambiguous">Two</button>
      <button id="hidden" style="display:none">Hidden</button>
      <iframe srcdoc="<button id='inside'>Inside</button>"></iframe>
    `);
    expect(await captureFirstMeasuredFailure(browser, page, [failure('.ambiguous')])).toBeNull();
    expect(await captureFirstMeasuredFailure(browser, page, [failure('#hidden')])).toBeNull();
    expect(await captureFirstMeasuredFailure(browser, page, [failure('#detached')])).toBeNull();
    expect(await captureFirstMeasuredFailure(browser, page, [failure('#inside')])).toBeNull();
  });
});
