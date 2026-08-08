# Odysseus: Milestone 8 scope update and screening/full audit tier decisions

**Purpose of this document.** This is an addendum to `docs/odysseus-project-brief-v2.md`, written after a commercial-side planning session on 2026-08-07. It should be read alongside that brief. A Claude Code instance reading this cold should be able to pick up milestone 8 work with the revised scope below, without needing the conversation that produced it.

---

## 1. Decisions made in this session

### 1.1 No video walkthrough

The 5 to 10 minute recorded video walkthrough, previously listed as part of the full audit deliverable in brief section 3.3, is dropped entirely. Delivery for both tiers is PDF report only. Remove references to the video walkthrough from section 3.2 (pricing table) and 3.3 (what the client receives) of the brief.

### 1.2 Screening and full audit run off one crawl, not two

Previously open question, now resolved: there is no tier-based crawl scope. Every audit runs the same full crawl, same `maxPages` and `maxDepth` config, regardless of which tier the client ultimately buys. The two tiers are generated as two report views from the same underlying `findings.json`, not two different scans.

Practical effect: `runAuditStage` and the crawl/scan pipeline need no tier parameter. Tier only matters at report generation time, where it selects which sections and which level of detail get rendered.

Crawl limits (`MAX_CRAWL_DEPTH`, `maxPages`) stay driven by cost and time considerations only, never by what the client paid for. Current defaults (depth 5, roughly 17 pages on the sas-fernande.fr test run) are a reasonable working baseline. Tune later based on how scan time scales on messier real sites, independent of any pricing decision.

### 1.3 Manual accessibility checklist: most of it becomes automated, folded into milestone 8

The two-entry `docs/manual-accessibility-checklist.md` (placeholder-as-label passes axe, heading-order is best-practice not WCAG) is being extended, and most of what would have required a human pass instead becomes a deterministic check. This work is folded into milestone 8 (custom checks), not a separate milestone. Milestone 8 scope is now:

**Original milestone 8 scope, unchanged:**

- meta and canonical tag checks
- JSON-LD structured data
- sitemap and robots.txt
- hreflang
- heading hierarchy
- redirect chains

**Added to milestone 8 scope, from this session:**

- **Keyboard traps.** Tab through every interactive element on a page via Playwright, record focus order, flag if focus never advances (trap) or the tab order diverges badly from visual/DOM order.
- **Focus order.** Same tab-through pass, compare focus sequence against visual layout order.
- **Form error handling.** Trigger validation by submitting required fields empty, check whether the resulting error message is programmatically associated with the field (`aria-describedby`, `aria-invalid`, `role="alert"`) versus only conveyed visually (color change alone).
- **Video captions.** Check for `<track kind="captions">` on native `<video>` elements. For embedded players (YouTube, Vimeo), query the relevant embed API for caption availability where feasible.
- **Alt text quality heuristic** (see 1.4 below for why this one is heuristic-only, not a full manual-equivalent check).

All of the above must go through the same deterministic-detection discipline as every other check in the tool: real findings, real selectors, no invented content. These are genuine automated checks, not an LLM standing in for judgment, with the single exception noted in 1.4.

Update `docs/manual-accessibility-checklist.md` to strike the items now covered by automated checks, and keep only what remains genuinely outside automated reach (if anything does, once the above ships and gets validated against real sites).

### 1.4 Alt text meaningfulness: heuristic only, stays deterministic

Judging whether alt text is genuinely meaningful (versus merely present, which axe already checks) is a judgment call, not a detection, and doesn't fit the governing rule that deterministic scanners detect and the LLM only explains. Rather than adding an LLM-based quality judgment (which was considered and rejected this session as a rule exception not worth taking on right now), alt text quality is a **heuristic red-flag check only**, staying fully deterministic:

- Filename-pattern alt text (e.g. `IMG_4021.jpg`, `DSC00123.png`)
- Generic placeholder text (`image`, `photo`, `picture`, and similar low-information strings)
- Empty alt text on a non-decorative image (image not marked `role="presentation"` or `alt=""` intentionally per context)
- Identical alt text repeated across multiple visually different images

This catches the worst, most commercially embarrassing offenders without claiming to judge editorial quality. The report methodology section should state plainly that alt text below what this heuristic catches may still benefit from a manual review, rather than implying full coverage.

### 1.5 Client-facing language: drop "manual verification" claims

Since the checklist items in 1.3 move to automated detection, the full audit tier can no longer honestly be marketed as including a "manual accessibility verification" pass, as currently worded in brief sections 3.2 and 3.3. This is not a copy nitpick: the report credibility risk section of the brief (section 10) specifically flags that one claim which doesn't hold up under a client's own check damages the whole offer, and "was this actually manually checked" is exactly the kind of thing a skeptical prospect might ask.

**Decided this session:** replace "manual accessibility verification" wherever it appears in sections 3.2 and 3.3, and in any proposal page copy, with **"extended accessibility pass."** This is accurate (it is a genuinely extended set of checks beyond the base scan) without implying a human reviewed anything specific. Example usage: "full audit includes an extended accessibility pass covering keyboard navigation, focus order, form handling, and caption presence." Do not claim human review of anything that isn't actually humanly reviewed.

### 1.6 Report tier content split

Both tiers render from the same `findings.json`. The split is in what the report template shows, decided this session as follows:

**Screening report:**

- Executive summary
- Overall risk badge
- Top findings by severity (critical and serious only, not full detail)
- For the new milestone 8 checks (traps, focus order, forms, captions, alt text heuristic): **mention as counts or categories only** (e.g. "3 keyboard navigation issues detected across the site," "2 forms with inaccessible error handling"), with no page-level detail, no selectors, no remediation guidance
- No theme grouping
- No before/after render diff evidence
- No "what to do first" summary

**Full audit report:**

- Everything above, plus full theme grouping with effort and impact per theme
- Full page and selector detail for every finding, including the milestone 8 checks
- Before/after render diff evidence (raw versus rendered screenshots)
- The non-technical "what to do first" summary
- Full findings appendix

**Business reasoning for the split (session decision, not previously in the brief):** this mirrors a pattern already built into the report template for minor findings (`minorAggregateNote`: "these findings are real but secondary... full page and selector detail is available on request"). Showing screening clients that problems exist, in named categories with real counts, keeps the screening tier's core value intact (it must remain checkable and real, not vague). Withholding the specific location and fix detail behind the full audit purchase preserves the actual reason to upgrade: knowing a problem exists is not the same as being able to act on it without paying for the detail. This also reduces the risk of a client using a EUR 290 screening report as a free-form todo list they hand to their own developer without paying for the full audit.

---

## 2. What this means for the report template and schema

Not fully specified here, left for the build session to work out concretely, but the direction is clear:

- The findings schema and severity mapping do not need a tier field. Tier is a report-rendering decision, not a detection-time decision.
- The report template needs a tier parameter that controls section inclusion and detail depth, likely reusing the existing aggregation pattern used for minor findings (count and category shown, full detail withheld) and applying that same pattern to the new milestone 8 checks specifically for the screening view.
- New finding categories or rule IDs will be needed for keyboard traps, focus order, form error handling, video captions, and the alt text heuristic, fitting into the existing severity mapping (`packages/core/src/normalize/severity.ts`) rather than a separate scale.

**Shipped 2026-08-08.** All five behavioral rule IDs landed first
(`keyboard-trap`, `focus-order-mismatch`, `form-error-not-associated`,
`video-missing-captions`, `alt-text-quality-heuristic`, added to
`severity.ts` only after asking, per its locked-file status), then the
report tier split. `packages/report/src/types.ts` exports `ReportTier =
'screening' | 'full'`; `RenderHtmlInput.tier` and
`GenerateReportInput.tier` both default to `'full'` when omitted, so
no caller from before this milestone needed to change. Section
inclusion is branched in `render-html.ts`'s `renderBody`, not scattered
per-section: screening renders cover, TOC, statistics, executive
summary (without "what to do first"/quick wins, both of which reference
themes this tier never shows), a new
`packages/report/src/template/sections/screening-findings.ts` (critical
and serious findings named and counted with no page/selector detail,
plus the five rule IDs above reduced to a bare per-rule count, exactly
this section's example copy), and methodology unchanged (the legal
citation is core value at every tier, not detail withheld for the
upsell). Full audit keeps every section it had before. The rule ID list
that decides what counts as "extended accessibility pass" for the
screening view is duplicated in `screening-findings.ts` from
`severity.ts`'s `CUSTOM_CHECK_SEVERITY` table rather than imported,
matching the "tier is a report-rendering decision, not a
detection-time one" framing above and the small-duplicated-table
precedent `methodology.ts` already uses for `EFFECTIF_BAND_LABELS_EN`.
Threaded through `odysseus report --tier <screening|full>` on the CLI,
`runReportStage`, and a `tier` field on the stored report document
(`ReportDocumentFields.tier`, `getLatestReport`'s new optional tier
parameter, and an optional `?tier=` query param on the dashboard's
report-download route), all defaulting to `'full'` for the same
backward-compatibility reason. Also fixed as part of this pass: the
`automatedCoverageCaveat` report string (both languages) previously
claimed keyboard navigation, focus order, alt text quality, form error
handling, and video captioning "require manual verification, delivered
as a separate service" - stale the moment those five became automated
checks, and exactly the overstatement section 1.5 above warns against.
Corrected to name the extended accessibility pass and narrow the
manual-verification claim to what is actually still manual (reading
order versus visual order). See
`docs/manual-accessibility-checklist.md` for the item-by-item detection
gap status.

---

## 3. Decided in follow-up: copy, pricing, and publication

### 3.1 Replacement copy: locked

"Extended accessibility pass" is the client-facing term, see 1.5 above. Update every occurrence of "manual accessibility verification" in the brief and any proposal or marketing copy.

### 3.2 Pricing band: kept as is, no revisit trigger

The narrower gap between screening and full audit (now mostly report depth rather than a genuinely separate manual verification pass) does not justify revisiting the 1,200 to 1,900 EUR band. The brief's original pricing logic was never based on labor cost: section 3.2 already states the band is set by business impact and legal exposure, not hours or page count. That justification holds regardless of how much of the verification is automated. What actually protects the price is the full audit report staying meaningfully deeper than screening, which section 1.6's tier split (theme grouping, full selector detail, before/after evidence, the non-technical summary) already secures. No further review of the price band is scheduled. Do not reopen this without a specific trigger (e.g. consistent client pushback that the deliverable isn't worth the price, which is already a listed kill-criterion in brief section 12).

### 3.3 Publish the range, not the number

Publish "1,200 to 1,900 EUR depending on site risk level" on the proposal page and any public pricing page. This removes the main friction point for a cold prospect (not knowing if the service is even in their budget before engaging) while keeping the anchoring value of setting the specific number from their own risk band after the scan runs. Full price opacity mainly serves negotiated enterprise sales cycles, which the brief already excludes as a target market (section 4, deliberate non-targets). Update brief section 3.2's "still open" list to remove this item as resolved.
