import { describe, expect, it } from 'vitest';
import { printableSelector } from './printable-selector.js';

describe('printableSelector', () => {
  it('writes Japanese characters as CSS escapes the selector engine still reads', () => {
    const selector = '.wpcf7-email[placeholder="メール"]';
    const printed = printableSelector(selector);
    expect(printed).toBe('.wpcf7-email[placeholder="\\30E1 \\30FC \\30EB "]');
    expect(printed).not.toMatch(/[　-鿿]/u);
  });

  it('escapes CJK punctuation, Hangul and emoji', () => {
    expect(printableSelector('a[title="予約。"]')).toBe('a[title="\\4E88 \\7D04 \\3002 "]');
    expect(printableSelector('[aria-label="예약"]')).toBe('[aria-label="\\C608 \\C57D "]');
    expect(printableSelector('[title="🏨"]')).toBe('[title="\\1F3E8 "]');
  });

  it('keeps Latin, accented, Greek and Cyrillic selectors unchanged', () => {
    const selector = '#réservation > .menu-item:nth-child(2) [title="Ωμέγα Отель"]';
    expect(printableSelector(selector)).toBe(selector);
  });
});
