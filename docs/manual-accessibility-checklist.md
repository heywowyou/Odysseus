# Manual accessibility review checklist

Automated scanning catches roughly 30 to 40 percent of WCAG issues.
This file records what Odysseus provably cannot detect, so an
accessibility audit is not sold as if the scanner covers everything.

Every entry here was confirmed against a real scan, not assumed.

**2026-08-07 planning note** (`docs/milestone-8-scope-addendum.md`
section 1.3): most of the "to verify" list below is scoped to become
genuinely automated milestone 8 checks (keyboard traps, focus order,
form error handling, video captions) rather than a manual pass, plus a
heuristic red-flag check for alt text quality that stays deliberately
partial rather than becoming an LLM editorial judgment.

**Updated 2026-08-08:** milestone 8's *original* custom-check scope
(meta/canonical/JSON-LD/sitemap/hreflang/heading-hierarchy/redirects,
plus mixed-content and noindex-on-public-page) has shipped and been
verified against a real site, and the heading-hierarchy-skips entry
below is struck accordingly. The behavioral checks the 2026-08-07
addendum *added* to milestone 8 (keyboard traps, focus order, form
error handling, video captions, alt-text heuristic) are still not
built - the "to verify" list below is otherwise unchanged, since
claiming coverage before those specific checks exist and are validated
would repeat the exact overstatement this file exists to prevent.

## Confirmed detection gaps

### Placeholder used as the only label
An input with a `placeholder` and no `<label>`, `aria-label`, or
`aria-labelledby` passes axe's `label` rule, because accessible-name
computation treats the placeholder as sufficient. It is still a real
usability failure: the text disappears on focus, is often low
contrast, and is unreliable with screen magnification.
Confirmed on fixtures/spa-demo, 2026-08-02.

### ~~Heading hierarchy skips~~ - resolved 2026-08-08
`heading-order` is tagged best-practice in axe, not WCAG, so it is
outside the tag set Odysseus scans, and Lighthouse's own `heading-order`
audit lives under the excluded `accessibility` category. Now covered by
a dedicated custom check instead of re-enabling either
(`heading-hierarchy-skip`, `multiple-h1`, `no-h1` in
`packages/core/src/normalize/normalize-head-metadata.ts`), verified
against `fixtures/spa-demo`'s seeded h1-to-h3 skip and against a real
site.

## To verify

- Keyboard traps
- Focus order and visible focus indicators
- Alt text quality (present but unhelpful passes automated checks)
- Form error messaging and error identification
- Reading order versus visual order
