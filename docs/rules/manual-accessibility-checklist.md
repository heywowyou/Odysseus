# Manual accessibility review checklist

Automated scanning catches roughly 30 to 40 percent of WCAG issues.
This file records what Odysseus provably cannot detect, so an
accessibility audit is not sold as if the scanner covers everything.

Every entry here was confirmed against a real scan, not assumed.

Most of the original "to verify" list became genuinely automated milestone 8
checks rather than a manual pass. Alt-text quality remains a deliberately
partial heuristic instead of an LLM editorial judgment.

**Updated 2026-08-08:** milestone 8's *original* custom-check scope
(meta/canonical/JSON-LD/sitemap/hreflang/heading-hierarchy/redirects,
plus mixed-content and noindex-on-public-page) has shipped and been
verified against a real site, and the heading-hierarchy-skips entry
below is struck accordingly.

**Updated again 2026-08-08:** the addendum's five behavioral checks
(keyboard traps, focus order, form error handling, video captions,
alt-text heuristic) have also shipped, verified against
`fixtures/spa-demo` end to end (not just in isolated unit/e2e tests)
and against the safety-sensitive form-error-handling check specifically
with dedicated zero-network-escape tests. Keyboard traps and form error
messaging are struck below as fully covered. Focus order and alt text
quality are struck as *partially* covered, not fully: each ships a
real, narrower check than the checklist item originally named, see
their entries for exactly what is and isn't caught. Reading order
versus visual order remains untouched - nothing in milestone 8 detects
it.

## Confirmed detection gaps

### ~~Placeholder used as the only label~~ - resolved 2026-09-16
An input with a `placeholder` and no `<label>`, `aria-label`, or
`aria-labelledby` passes axe's `label` rule, because accessible-name
computation treats the placeholder as sufficient. It is still a real
usability failure: the text disappears on focus, is often low
contrast, and is unreliable with screen magnification.
Confirmed on fixtures/spa-demo, 2026-08-02. Now covered by a dedicated
custom check (`packages/scanner/src/checks/placeholder-labels.ts`, rule ID
`placeholder-only-label`, WCAG 3.3.2): a visible text field with a
placeholder and no label, aria-labelledby text, aria-label or title.

### ~~Heading hierarchy skips~~ - resolved 2026-08-08
`heading-order` is tagged best-practice in axe, not WCAG, so it is
outside the tag set Odysseus scans, and Lighthouse's own `heading-order`
audit lives under the excluded `accessibility` category. Now covered by
a dedicated custom check instead of re-enabling either
(`heading-hierarchy-skip`, `multiple-h1`, `no-h1` in
`packages/core/src/normalize/normalize-head-metadata.ts`), verified
against `fixtures/spa-demo`'s seeded h1-to-h3 skip and against a real
site.

### ~~Keyboard traps~~ - resolved 2026-08-08
A real Tab-key walk (`packages/scanner/src/checks/keyboard-navigation.ts`)
detects the same element being focused twice consecutively, the
signature of a genuine trap. Rule ID `keyboard-trap`.

### ~~Focus order~~ - partially resolved 2026-08-08
The same Tab-key walk flags a confusing reorder when the observed focus
sequence moves backward past an earlier element two or more times
(deliberately conservative: a single reorder is common and often
intentional). A jump back to an element the walk skipped while Tab could
not reach it in order (hidden, or moved after the focused element, as an
autoplaying loop carousel does with its slides) is not counted (issue
#562). Rule ID `focus-order-mismatch`. Visible focus indicators
(whether a focused element actually shows a visible outline or ring)
is a different property entirely and is not checked by this or any
other rule; still genuinely manual.

Both keyboard rules stay manual on a page where a dialog open on load (a
consent banner, a marketing popup) kept focus inside itself for the whole
walk (plan 075 J3). The walk then measured the dialog, not the page, so it
gives neither finding and the report discloses the page as not evaluated
for keyboard navigation. A popup that is not a consent banner is closed
with one Escape press and the walk repeated; a consent banner is never
dismissed. The same holds when the window opens after the walk began (a
consent banner shown a few seconds after load): focus pauses on whichever
control the walk had reached, then never returns to the page's own controls.
That pause is not a trap on that control, and the page is recorded as not
evaluated. A trap is an element the walk ends on after it kept focus for
three presses or more; a control that takes two presses and lets Tab go on is
not one.
Inversions are counted within one pass through the page, so the
wrap from the last control back to the first is not a backward jump.

### ~~Alt text quality~~ - partially resolved 2026-08-08
A heuristic red-flag check (`packages/core/src/normalize/normalize-alt-text.ts`,
rule ID `alt-text-quality-heuristic`) catches filename-pattern alt text
("IMG_4021.jpg"), generic placeholders ("image", "photo"), empty alt on
a non-decorative image, and duplicate alt text across different images.
Deliberately partial by design (see the rule's severity.ts comment):
alt text that is grammatically fine, present, and simply doesn't
describe the image still passes, since judging that needs a human or a
vision model, neither of which this pipeline has.

### ~~Form error messaging and error identification~~ - resolved 2026-08-08
`packages/scanner/src/checks/form-error-handling.ts` triggers native
form validation on empty required fields (`reportValidity()` plus a
synthetic, untrusted `submit` event, never a real submission) and
checks whether the resulting error is exposed to assistive technology
via `aria-invalid`, `aria-describedby` pointing at real text, or a
`role="alert"`/`aria-live` region. Rule ID `form-error-not-associated`.

## Undetermined is not a pass

When the browser cannot establish the final resource or content (for example
an image is still a `data:`/placeholder URL, a frame is a bot challenge, or a
check times out), record the check as **undetermined** and leave it out of
the confirmed finding population. Do not convert missing evidence into a
clean result and do not ask report prose to imply that the page passed. The
operator checklist should name the blocked/failed candidate and resolve it
manually or rescan it before making an absence claim.

## To verify

- Reading order versus visual order
