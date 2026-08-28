import type { Browser, Page } from 'playwright';
import type { RankedHotelFailure } from '@odysseus/core';
import { constrainPng, type PngImage } from './image.js';

export interface CapturedFailureCandidate extends PngImage {
  fact: RankedHotelFailure;
}

const OUTLINE_ID = 'odysseus-evidence-outline';
const CALLOUT_ID = 'odysseus-evidence-callout';

async function captureOne(
  browser: Browser,
  page: Page,
  fact: RankedHotelFailure,
): Promise<CapturedFailureCandidate | null> {
  if (fact.selector.includes(' >>> ')) return null;
  const locator = page.locator(fact.selector);
  if ((await locator.count()) !== 1 || !(await locator.isVisible())) return null;
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null || box.width <= 0 || box.height <= 0) return null;

  const padding = 28;
  const calloutRoom = 34;
  const width = Math.min(viewport.width, Math.max(240, Math.ceil(box.width + padding * 2)));
  const height = Math.min(
    viewport.height,
    Math.max(160, Math.ceil(box.height + padding * 2 + calloutRoom)),
  );
  const x = Math.max(
    0,
    Math.min(viewport.width - width, Math.floor(box.x + box.width / 2 - width / 2)),
  );
  const y = Math.max(
    0,
    Math.min(viewport.height - height, Math.floor(box.y - padding - calloutRoom)),
  );
  if (width <= 0 || height <= 0) return null;

  try {
    await page.evaluate(
      ({ selector, callout, outlineId, calloutId }) => {
        const matches = document.querySelectorAll(selector);
        if (matches.length !== 1) throw new Error('Evidence target became ambiguous');
        const element = matches[0] as HTMLElement;
        const rect = element.getBoundingClientRect();
        const outline = document.createElement('div');
        outline.id = outlineId;
        Object.assign(outline.style, {
          position: 'fixed',
          left: `${Math.floor(rect.left)}px`,
          top: `${Math.floor(rect.top)}px`,
          width: `${Math.ceil(rect.right) - Math.floor(rect.left)}px`,
          height: `${Math.ceil(rect.bottom) - Math.floor(rect.top)}px`,
          zIndex: '2147483646',
          boxSizing: 'border-box',
          border: '4px solid #d61f45',
          background: 'transparent',
          pointerEvents: 'none',
        });
        document.documentElement.append(outline);
        const label = document.createElement('div');
        label.id = calloutId;
        label.textContent = callout;
        Object.assign(label.style, {
          position: 'fixed',
          left: '4px',
          top: `${Math.max(4, element.getBoundingClientRect().top - 30)}px`,
          zIndex: '2147483647',
          padding: '5px 8px',
          color: '#ffffff',
          background: '#d61f45',
          font: '700 14px sans-serif',
          lineHeight: '18px',
          pointerEvents: 'none',
        });
        document.documentElement.append(label);
        label.style.left = `${Math.max(
          4,
          Math.min(
            element.getBoundingClientRect().left,
            window.innerWidth - label.getBoundingClientRect().width - 4,
          ),
        )}px`;
      },
      {
        selector: fact.selector,
        callout: `WCAG ${fact.wcagCriteria.join(', ') || '!'}`,
        outlineId: OUTLINE_ID,
        calloutId: CALLOUT_ID,
      },
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const raw = await page.screenshot({
      type: 'png',
      clip: { x, y, width, height },
      animations: 'disabled',
      caret: 'hide',
    });
    const constrained = await constrainPng(browser, raw, {
      maxWidth: 800,
      maxHeight: 600,
      maxBytes: 1024 * 1024,
      minWidth: 32,
      minHeight: 32,
    });
    return constrained === null ? null : { ...constrained, fact };
  } catch {
    return null;
  } finally {
    await page
      .evaluate(
        ({ outlineId, calloutId }) => {
          document.getElementById(outlineId)?.remove();
          document.getElementById(calloutId)?.remove();
        },
        { outlineId: OUTLINE_ID, calloutId: CALLOUT_ID },
      )
      .catch(() => undefined);
  }
}

export async function captureFirstMeasuredFailure(
  browser: Browser,
  page: Page,
  ranked: readonly RankedHotelFailure[],
): Promise<CapturedFailureCandidate | null> {
  for (const candidate of ranked) {
    const captured = await captureOne(browser, page, candidate);
    if (captured !== null) return captured;
  }
  return null;
}
