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
partial rather than becoming an LLM editorial judgment. This file is
not updated to strike those items yet: the checks are not built, and
claiming automated coverage before it exists and is validated against
a real site would repeat the exact overstatement this file exists to
prevent. Update this file once milestone 8 ships, not when it is
merely scoped.

## Confirmed detection gaps

### Placeholder used as the only label
An input with a `placeholder` and no `<label>`, `aria-label`, or
`aria-labelledby` passes axe's `label` rule, because accessible-name
computation treats the placeholder as sufficient. It is still a real
usability failure: the text disappears on focus, is often low
contrast, and is unreliable with screen magnification.
Confirmed on fixtures/spa-demo, 2026-08-02.

### Heading hierarchy skips
`heading-order` is tagged best-practice in axe, not WCAG, so it is
outside the tag set Odysseus scans. It is also excluded on the
Lighthouse side: Lighthouse's own `heading-order` audit lives under the
`accessibility` category, which is excluded from finding emission this
milestone (see `LIGHTHOUSE_EXCLUDED_CATEGORIES` in constants.ts). To be
covered by a custom check.

## To verify

- Keyboard traps
- Focus order and visible focus indicators
- Alt text quality (present but unhelpful passes automated checks)
- Form error messaging and error identification
- Reading order versus visual order
