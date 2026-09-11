# Plan 039: Carry the public site's design language into the report and the outreach preview

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9d5383e..HEAD -- packages/report packages/site/app/globals.css docs/report DESIGN.md PRODUCT.md docs/decisions/trade-offs.md .impeccable/config.json plans/README.md`
> Stop if report styles, the v2 preview renderer, or the site's token block
> in `globals.css` moved without a plan or trade-off entry explaining it.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH (client deliverable, render identity, approvals)
- **Depends on**: 023 (baseline it supersedes), 037 (v2 preview), 038 (site
  direction); operator attendance at steps 3 and 7
- **Category**: design, report, outreach preview
- **Planned at**: commit `9d5383e`, 2026-09-11
- **Issue**: none; operator-requested 2026-09-11

## Why this matters

The public site at odysseusaudit.com was critiqued, fixed, and recast with the
Impeccable skill on 2026-09-11 (plan 038 and the live passes after it) and the
operator accepted the result. The two documents a prospect or client actually
holds, the paid PDF report and the outreach preview, still wear the older
Nocturne look (dark `#161826` ground, violet accent, Inter). A prospect who
reads the preview, visits the site, and then buys the report meets three
different visual identities for one product.

`DESIGN.md`, "Carrying this design into the report", already records this
intent and lists what transfers (cool-paper and ink tokens, possibly Avenir
Next, the dossier card and its row rules, the schematic grammar) and what does
not (motion, sticky and container-query layout, OS-driven dark mode). This
plan is the gated redesign `docs/report/report-design-system.md` requires
("a future revision re-runs plan 023's gate; it does not happen inline"),
following plan 023's method with the site as the reference world.

## Binding decisions

1. **Look changes, content and structure do not.** No change to report or
   preview wording (`strings/*`, `strings.ts`, `strings-v2.ts`,
   `proof-card-copy.ts`), section order, the section registry, what each
   section contains, preview card selection, the preview's element order, the
   pagination contract's meaning, the 60-page warning, or any locked
   contract. Template markup changes only to add or rename class hooks a
   visual treatment needs, each file listed in its commit.
2. **Critique first, read-only.** Step 2 runs Impeccable `critique` and
   `audit` over the current rendered report and preview as evidence only. No
   Impeccable command edits report or preview files before the operator's
   direction pick in step 3.
3. **The site is the reference, not a copy source.** `packages/site` stays
   standalone (it imports nothing from the workspace and nothing imports it).
   Tokens are transcribed by hand from `packages/site/app/globals.css` and
   `DESIGN.md` "Site" sections into the report's own sources, each with a
   comment naming its site origin. Trade-off 9 stands: hand-maintained CSS
   from the flat sources in `docs/report/design/`, no Tailwind.
4. **Print is its own medium.** Nothing from the site's motion system,
   hover states, sticky or container-query layout, or `prefers-color-scheme`
   switching enters the PDF. The PDF uses one fixed scheme picked at step 3.
   The web preview may follow the site's light/dark switch only if the
   operator picks that at step 3; its PDF export stays fixed.
5. **Severity stays a severity scale.** The dossier's red/blue/green row
   rules mean problem/evidence/action, never severity (DESIGN.md "The Dossier
   Rule Set"). The report's four severity shades keep their meaning and
   ordering; if the ground changes they are re-tuned for contrast on the new
   ground (the existing print-safe pairs in `design-tokens.ts` are the
   starting point), and the divergence from the dashboard's 1:1 severity
   shades is recorded, not silently introduced. The dashboard is not touched.
6. **Docs first, then CSS.** Order: `docs/report/report-design-system.md`,
   `docs/report/report-design-tokens.md`, flat sources under
   `docs/report/design/`, then `packages/report/src/styles/nocturne.css`
   (rename only if the operator asks; a rename touches every import and the
   docs), `paged.css`, `template/design-tokens.ts`,
   `outreach-preview/styles-v2.ts`. The design-system document's direction
   contract and its "not open for reinterpretation" clause are re-stamped
   with the new baseline and date.
7. **Print determinism is the acceptance gate, not taste.** Every invariant
   plan 023 listed still passes in meaning: paged invariants, glyph hinting
   under `REPORT_PDF_CHROMIUM_ARGS` (trade-off 19), `pdf-text-integrity`,
   `pdf-overflow-gate`, the axe self-test at zero violations, guillemets
   U+00A0 (trade-off 29), `spacing-tokens`, `letter-spacing`, annex
   pagination (trade-offs 17 and 32). A font change keeps self-hosted files
   and `font-display: block`. Visual-regression baselines are updated
   deliberately in the same commit as the CSS that moves them, never by
   regenerating on a red suite. If the checklist's print inversion (section
   05, `print-inversion.e2e.test.ts`) loses its reason because the whole
   report goes light, the test is rewritten to assert the new documented
   behaviour and the change is recorded, never deleted silently.
8. **Approvals are respected.** The stylesheet is part of render identity
   (trade-offs 44 and 65). Previously approved reports keep their digests;
   any report rendered after this lands needs a fresh approval round. Already
   published previews are stored byte for byte and are not republished or
   rewritten; only new renders get the new look.
9. **The font is a licence question before it is a taste question.**
   Avenir Next may be embedded in the PDF and inlined in the preview only if
   the operator confirms its licence covers PDF embedding and web embedding
   in a document served from a bucket. Otherwise Inter stays and the
   `.impeccable/config.json` Inter ignore stays. If Avenir Next is adopted,
   the files are copied into `packages/report/src/fonts` (never imported from
   `packages/site`), and the now-dead Inter ignore is removed.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Detector evidence run | `node .agents/skills/impeccable/scripts/detect.mjs --json --no-config <html>` | exit 0 clean, exit 2 findings |
| Render fixture PDFs | `pnpm exec tsx packages/cli/src/index.ts report fixtures/test-audits/small-site --all` (and `large-rule-families`, `multi-page`) | FR and EN PDFs, page count printed |
| Render a stored audit | `pnpm exec tsx packages/cli/src/index.ts report <artifacts/...audit-dir> --language fr` (then `en`) | PDFs under `<audit-dir>/reports/` |
| Report unit loop | `pnpm exec vitest run --project unit packages/report/src` | pass |
| Report invariant loop | `pnpm exec vitest run --project e2e packages/report/src/template/paged-invariants.e2e.test.ts packages/report/src/template/glyph-hinting.e2e.test.ts packages/report/src/template/pdf-text-integrity.e2e.test.ts packages/report/src/template/pdf-overflow-gate.e2e.test.ts packages/report/src/template/checklist-visual-regression.e2e.test.ts packages/report/src/template/print-inversion.e2e.test.ts` | pass |
| Axe loops | `pnpm exec vitest run --project e2e packages/report/src/template/render-html.axe.e2e.test.ts packages/report/src/outreach-preview/render-html-v2.axe.e2e.test.ts` | pass |
| Gate | `pnpm run format && pnpm run check && pnpm run test:all` | exit 0 apart from the pre-existing reds in issues #174 and #178 |

The report package has no test script; run root Vitest with exact paths.
Record the pre-existing reds from issues #174 and #178 at step 1 so they are
not mistaken for regressions later.

## Steps

### Step 1: Preconditions and baseline

Read `docs/session/current-session.md` and reconcile it (stream C was left
`ready-for-commit`; confirm against `git log` whether it landed). Start a
stream section for this plan. Confirm a clean tree for `packages/report`,
`docs/report`, and `.impeccable`. Run the unit and e2e loops once and record
the baseline result, including known reds. Render the baseline PDFs (three
fixtures, both languages; plus one stored audit under `artifacts/` that has a
validated analysis, if one exists locally) and the v2 preview HTML from
`outreach-preview/test-fixtures.ts`. Record page counts.

**Verify**: baseline PDFs, preview HTML, page counts, and test results are
written to the session log. No source file changed.

### Step 2: Impeccable critique and audit (read-only evidence pack)

Put the evidence under `.impeccable/critique/` (same convention as the site
runs) and a summary in the session log:

1. Page PNGs of the baseline PDFs (cover, metadata sheet, one section start,
   one findings section, checklist, appendix, glossary) and of the preview at
   320px, 768px, and 1280px, both languages.
2. Impeccable `critique` over the rendered report and preview, and
   Impeccable `audit` over the preview HTML (it is a screen document served
   to prospects). Use `PRODUCT.md` and `DESIGN.md` as the context the skill
   reads; do not run `/impeccable init`.
3. The detector with `--no-config` against
   `packages/report/src/template/report.reference.html`, one rendered report
   HTML, and one rendered preview HTML. Classify every finding
   `applicable-to-print`, `applicable-to-preview-screen`, or `not-applicable`
   with a one-line reason. Screen-only rules (hover, animation, viewport
   overflow on the PDF) are expected in the last column.
4. A site-to-report token map: every site token in `globals.css` and the
   `DESIGN.md` "Site" sections, its proposed report or preview counterpart,
   and a transfer verdict (`transfers`, `transfers-retuned-for-print`,
   `does-not-transfer`) with a reason, following `DESIGN.md` "Carrying this
   design into the report".
5. The open report residuals already recorded
   (`docs/report/report-feedback-deferred-items.md`,
   `docs/report/audit-rehearsal-notes.md`) that a visual change would close.

**Verify**: the pack exists; `git status` shows no change outside
`.impeccable/critique/` and the session log.

### Step 3: Operator direction round

Present the pack and ask, through the host's structured question tool, with a
plain-language explanation and an options table for each:

1. **Ground**: light cool paper (site light scheme), dark near-navy (site
   dark scheme), or light report with a dark cover only. Recommend light
   cool paper: it is a printed document, and the site's light scheme is its
   default reading surface.
2. **Font**: Avenir Next (only if the licence covers PDF and web embedding,
   binding decision 9) or keep Inter.
3. **Severity shades**: re-tune for the chosen ground (recommended) or keep
   the current values where contrast allows.
4. **Preview on screen**: fixed scheme matching the PDF, or follow the
   visitor's light/dark preference like the site.
5. **Dossier motif**: whether the finding cards in the report and the three
   preview proof cards adopt the dossier card treatment (raised card, row
   rules for problem/evidence/action).

Record the pick as a direction contract (thesis, own-world, story, first
viewport, form) and list every Impeccable ban consciously kept.

**Verify**: a written operator pick in the session log. Without it, stop.

### Step 4: Revise the canonical design documents

Update, in this order: `report-design-system.md` (direction contract,
re-stamped reinterpretation clause, colour roles, type ramp, spacing, cover,
metadata sheet, checklist, footer and counter treatment),
`report-design-tokens.md`, the two flat sources in `docs/report/design/`.
Draft the trade-off entry. Amend, in the same slice, every sentence that
calls the Nocturne design locked in a way that would contradict the new
baseline: trade-off 65 (superseded by the new entry), trade-off 79's durable
rules, `CLAUDE.md`'s impeccable bullet and trade-off 79 line (stay under the
`check-agent-docs.mjs` ceiling), and the `styles-v2.ts` header comment's
derivation list.

**Verify**: `pnpm run docs:check` exits 0; the docs and flat sources describe
one system.

### Step 5: Implement the report restyle

Apply the documents to `nocturne.css`, `paged.css`, and `design-tokens.ts`,
then fonts if changed (`@font-face` with `font-display: block`, re-run glyph
hinting). Adjust template files only for class hooks. Update the checklist
visual-regression baseline and any glyph fixtures in the same commit as the
CSS that moves them. Impeccable refinement commands (`typeset`, `colorize`,
`layout`, `polish`) may be used now, but every value they propose goes into
the flat sources and docs first, and the post-edit hook's findings on report
files are triaged, not auto-applied.

**Verify**: report unit loop, invariant loop, and report axe loop pass;
`git diff --stat` shows nothing outside Scope.

### Step 6: Implement the preview restyle

Apply the same system to `outreach-preview/styles-v2.ts`, keeping its
constraints: a TypeScript string, zero network, inline fonts only, the tile
rows' 320px reflow behaviour, the preview's own print block for the operator
PDF (`pdf-v2.ts`). v1 (`styles.ts`, `render-html.ts`) is retired for
publishing; leave it unchanged unless the operator asks. `preview-lint.ts`,
the v2 schema, card selection, and the site's `preview-response.ts` failure
pages are out of scope.

**Verify**: preview unit tests (`render-html-v2`, `preview-lint`,
`strings-v2-parity`, `language-leak`, `proof-card-copy`) and the v2 axe e2e
pass; the preview renders clean at 320px in French.

### Step 7: Re-critique, validate, operator review

Re-run step 2's critique and detector over the new renders and write a
before/after table (score, findings closed, findings introduced). Render the
three fixtures and the stored audit in both languages; explain every
page-count change. Run the full gate. Walk the operator through the PDFs and
the preview page by page, both languages, against the revised design-system
document.

**Verify**: gate green apart from the recorded pre-existing reds; before/after
table and operator review recorded with paths, page counts, and accepted
residuals.

### Step 8: Record and close

Commit the trade-off entry (what changed, the retired Nocturne look, the
fresh-approval consequence, the severity divergence from the dashboard if
any), update `DESIGN.md`'s "Carrying this design into the report" section to
past tense with a pointer to the new entry, update `.impeccable/config.json`
per binding decision 9, and set this plan's row to `IMPLEMENTED`. `DONE` waits
for the operator's written acceptance.

## Scope

**In scope**: `docs/report/report-design-system.md`,
`docs/report/report-design-tokens.md`, `docs/report/design/**`,
`packages/report/src/styles/**`, `packages/report/src/fonts/**`,
`packages/report/src/template/design-tokens.ts`, template files for class
hooks only, `packages/report/src/outreach-preview/styles-v2.ts`, report and
preview visual baselines, `docs/decisions/trade-offs.md`, `CLAUDE.md` and
`AGENTS.md` sentences about the locked report design, `DESIGN.md`'s report
carry-over section, `.impeccable/config.json`, `.impeccable/critique/**`,
`plans/README.md`.

**Out of scope**: all wording in both languages; section order and registry;
the preview's schema, selection, lint, and element order; locked contracts;
normalization, analysis, scanner, store, llm, cli, interface; the operator
dashboard and its severity tokens; `packages/site` (read only); stored
approvals, digests, and published previews; pricing, legal, and offer copy;
live third-party scans; new dependencies.

## STOP conditions

- The operator is absent at step 3 or 7, defers, or rejects every direction.
- Avenir Next is wanted but its PDF or web embedding licence is unconfirmed.
- A change would alter wording, structure, section order, a locked contract,
  approval semantics, or a stored artifact.
- A glyph-hinting, text-integrity, overflow, or pagination failure survives
  one deliberate correction attempt.
- Page-count movement cannot be explained by the visual change, or the
  60-page warning stops behaving.
- The axe self-test or the preview's 320px reflow cannot reach zero
  violations on the new palette.
- Keeping the site standalone would require the report to import from
  `packages/site`, or the reverse.
- Any step would need a new dependency or a live site action.

## Done criteria

- [ ] Evidence pack (PNGs, critique, audit, classified detector table, token
      map, residuals) exists and drove the direction.
- [ ] Operator direction pick and kept bans recorded.
- [ ] Docs, flat sources, tokens, report CSS, and preview styles describe and
      implement one system; locked-design sentences amended coherently.
- [ ] Wording and structure unchanged (strings files untouched in `git diff`).
- [ ] Report and preview unit, invariant, and axe suites pass;
      `pnpm run check` and `test:all` green apart from recorded pre-existing
      reds.
- [ ] Before/after critique table recorded.
- [ ] Both languages re-rendered, page counts explained, operator review
      recorded.
- [ ] Trade-off entry lands with the fresh-approval consequence.
- [ ] `IMPLEMENTED`, then `DONE` after operator acceptance.
