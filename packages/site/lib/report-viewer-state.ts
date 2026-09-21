/**
 * Pure state rules for the one-page-at-a-time example report viewer
 * (lib/report-viewer.tsx). Kept free of pdf.js and the DOM so the paging,
 * deep-link and sizing rules are unit-testable without a browser.
 */

/** ISO A4 portrait, width over height. */
export const A4_ASPECT = 210 / 297;

/** Below this width a fitted page gets too small to read comfortably, so
 * the page may overflow the window height instead of shrinking further. */
export const MIN_READABLE_PAGE_WIDTH = 600;

const PAGE_HASH = /^#page-(\d{1,4})$/u;

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || pageCount < 1) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), pageCount);
}

/** Reads a `#page-12` deep link; anything else means "no preference". */
export function parsePageHash(hash: string): number | null {
  const match = PAGE_HASH.exec(hash);
  if (!match) return null;
  const page = Number(match[1]);
  return page >= 1 ? page : null;
}

export function pageHash(page: number): string {
  return `#page-${page}`;
}

export type PageStep = 'previous' | 'next' | 'first' | 'last';

/** Keyboard keys the viewer answers to while focus is inside it. Arrow keys
 * are only taken when focus is not in a form control, so the section picker
 * keeps its native arrow-key behaviour. */
export function stepForKey(key: string): PageStep | null {
  switch (key) {
    case 'ArrowLeft':
    case 'PageUp':
      return 'previous';
    case 'ArrowRight':
    case 'PageDown':
      return 'next';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

export function applyStep(page: number, step: PageStep, pageCount: number): number {
  switch (step) {
    case 'previous':
      return clampPage(page - 1, pageCount);
    case 'next':
      return clampPage(page + 1, pageCount);
    case 'first':
      return 1;
    case 'last':
      return clampPage(pageCount, pageCount);
  }
}

/** A horizontal touch swipe long enough, and flat enough, to turn a page.
 * Returns null for taps, vertical scrolls and diagonal drags. */
export function stepForSwipe(dx: number, dy: number): PageStep | null {
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'previous';
}

/**
 * CSS width of the rendered page: the whole A4 sheet fits in the space left
 * under the controls when that still leaves a readable page, otherwise the
 * page takes the readable minimum (and the window scrolls a little). Never
 * wider than the frame it sits in.
 */
export function fittedPageWidth(options: {
  frameWidth: number;
  availableHeight: number;
}): number {
  const { frameWidth, availableHeight } = options;
  const heightBound = Math.floor(Math.max(availableHeight, 0) * A4_ASPECT);
  const width = Math.max(heightBound, MIN_READABLE_PAGE_WIDTH);
  return Math.max(Math.min(width, Math.floor(frameWidth)), 1);
}

export interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

/** Section picker entries in document order: one per distinct page, the
 * first named heading on a page winning, so the picker never offers two
 * entries that land on the same sheet. */
export function sectionEntries(entries: readonly OutlineEntry[]): OutlineEntry[] {
  const seen = new Set<number>();
  const result: OutlineEntry[] = [];
  for (const entry of entries) {
    const title = entry.title.replace(/\s+/gu, ' ').trim();
    // A bare section number ("03") is a heading eyebrow, not a name.
    if (!/\p{L}/u.test(title) || seen.has(entry.page)) continue;
    seen.add(entry.page);
    result.push({ ...entry, title });
  }
  return result.sort((a, b) => a.page - b.page);
}

/** The section a page belongs to: the last entry starting at or before it. */
export function sectionForPage(entries: readonly OutlineEntry[], page: number): OutlineEntry | null {
  let current: OutlineEntry | null = null;
  for (const entry of entries) {
    if (entry.page <= page) current = entry;
    else break;
  }
  return current;
}
