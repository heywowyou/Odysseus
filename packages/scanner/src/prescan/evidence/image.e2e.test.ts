import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../browser.js';
import { constrainPng, readPngDimensions } from './image.js';

let browser: Browser;
let page: Page;

async function captureHighEntropyPng(): Promise<Buffer> {
  await page.setContent('<canvas width="1200" height="900"></canvas>');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    let state = 0x12345678;
    for (let index = 0; index < pixels.data.length; index += 4) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      pixels.data[index] = state & 0xff;
      pixels.data[index + 1] = (state >>> 8) & 0xff;
      pixels.data[index + 2] = (state >>> 16) & 0xff;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  });
  return page.locator('canvas').screenshot({ type: 'png' });
}

describe('evidence PNG constraints', () => {
  beforeAll(async () => {
    ({ browser } = await launchBrowser());
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    page = await context.newPage();
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('iteratively downscales deterministic high-entropy pixels to the byte cap', async () => {
    const original = await captureHighEntropyPng();
    expect(original.byteLength).toBeGreaterThan(500_000);
    const constrained = await constrainPng(browser, original, {
      maxWidth: 800,
      maxHeight: 600,
      maxBytes: 500_000,
      minWidth: 100,
      minHeight: 75,
    });
    expect(constrained).not.toBeNull();
    expect(constrained!.bytes.byteLength).toBeLessThanOrEqual(500_000);
    expect(readPngDimensions(constrained!.bytes)).toEqual({
      width: constrained!.width,
      height: constrained!.height,
    });
  }, 15_000);

  it('returns an omission when the cap cannot be met above useful dimensions', async () => {
    const original = await captureHighEntropyPng();
    const constrained = await constrainPng(browser, original, {
      maxWidth: 800,
      maxHeight: 600,
      maxBytes: 10,
      minWidth: 300,
      minHeight: 200,
    });
    expect(constrained).toBeNull();
  }, 15_000);
});
