import { describe, expect, it } from 'vitest';
import { ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT, formatFullAuditPrice } from './pricing.js';

describe('the full-audit price', () => {
  it('is the one published figure', () => {
    expect(ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT).toBe(1600);
  });

  // Exact bytes, because a downstream validator has to recognise this string
  // and because these are the bytes a prospect reads.
  it('renders the French form', () => {
    expect(formatFullAuditPrice('fr')).toBe('1 600 € HT');
  });

  it('renders the English form', () => {
    expect(formatFullAuditPrice('en')).toBe('EUR 1,600 excl. VAT');
  });

  it('never emits the narrow no-break space ICU would default to', () => {
    // U+202F is a missing-glyph risk (trade-off 29) and ICU has changed which
    // separator it uses, so an unnormalized price is not reproducible.
    for (const language of ['fr', 'en'] as const) {
      expect(formatFullAuditPrice(language)).not.toContain(' ');
    }
  });

  it('is deterministic', () => {
    expect(formatFullAuditPrice('fr')).toBe(formatFullAuditPrice('fr'));
  });
});
