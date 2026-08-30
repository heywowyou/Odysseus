/**
 * The one published price for the full audit, and the one way to spell it.
 *
 * It lives in `core` rather than in `report` because more than one package has
 * to agree about it. The outreach preview renders it; plan 010's prose
 * validator, which lives in `llm`, has to recognise it in order to reject any
 * other figure. `llm` depends on `core` and nothing else in the workspace, so a
 * price held in `report` would be unreachable there and would get re-typed as a
 * literal - which is exactly how two documents end up quoting two prices.
 *
 * `ODYSSEUS_REAUDIT_PRICE_EUR_HT` deliberately stays where it is, in
 * `packages/report/src/template/html-utils.ts`. It is only ever rendered by the
 * paid report, and moving it would edit the paid path for no benefit.
 *
 * The formatter does not use `Intl.NumberFormat` directly. French ICU emits a
 * narrow no-break space (U+202F) as the thousands separator, which trade-off 29
 * records as a missing-glyph risk in our own PDF rendering, and which ICU has
 * changed before - it used to be U+00A0. A price whose bytes depend on the
 * host's ICU version is not a code-owned constant, and it cannot be asserted
 * exactly. Normalizing to U+00A0 fixes both problems at once.
 */

/** EUR, excluding VAT. Flat and published; see `docs/rules/offer-positioning.md`
 *  section 1, and trade-off 13 for why it is not a range or a risk band. */
export const ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT = 1600;

const NARROW_NO_BREAK_SPACE = ' ';
const NO_BREAK_SPACE = ' ';

/** The full-audit price as a client would read it, in the same shape the paid
 *  report already uses for the re-audit price, so the two never disagree about
 *  how money is spelled. */
export function formatFullAuditPrice(language: 'fr' | 'en'): string {
  const amount = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB')
    .format(ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT)
    .replaceAll(NARROW_NO_BREAK_SPACE, NO_BREAK_SPACE);
  return language === 'fr' ? `${amount}${NO_BREAK_SPACE}€ HT` : `EUR ${amount} excl. VAT`;
}
