import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('the price published on the public offer page', () => {
  // The marketing site imports nothing from this workspace by design, so the
  // figure on /offre is literal text that cannot be derived from the constant
  // above. The guard therefore lives here, on the side that owns the number: if
  // the price ever changes, this fails rather than leaving a stale figure on the
  // one page a prospect is sent to.
  const offerPage = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../site/app/offre/page.tsx'),
    'utf8',
  );

  /** JSX cannot carry a literal U+00A0 - the no-irregular-whitespace lint rule
   *  forbids it - so the page writes the separators as `&#160;`. Decoding here
   *  is what lets the comparison be against the exact rendered bytes rather
   *  than against a looser pattern. */
  const rendered = offerPage.replaceAll('&#160;', '\u00a0');

  it.each(['fr', 'en'] as const)('matches the %s rendering exactly', (language) => {
    expect(rendered).toContain(formatFullAuditPrice(language));
  });

  // The re-audit price (packages/report/src/template/html-utils.ts,
  // ODYSSEUS_REAUDIT_PRICE_EUR_HT = 450) is a second real, published figure,
  // approved 2026-09-11 to appear alongside the full-audit price on this
  // page; the site cannot import it (package isolation), so it is literal
  // text here too. The guard still rejects any third figure.
  it('quotes only the two published figures, never a third that could contradict them', () => {
    const figures = rendered.match(/[\d\u00a0\u202f,. ]*\d(?:\s?(?:€|EUR))/gu) ?? [];
    const distinct = new Set(figures.map((figure) => figure.trim()));
    expect([...distinct].sort()).toEqual(['1\u00a0600\u00a0€', '450\u00a0€'].sort());
  });
});
