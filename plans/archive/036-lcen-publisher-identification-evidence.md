# Plan 036: Publish per-field detection evidence for the LCEN publisher-identification finding

Added 2026-09-10. Operator-approved on 2026-09-10: all six defaults of the
design `docs/research/lcen-identification-finding-design.md` stand exactly as
written, and this plan implements those defaults and nothing more. Resolves
GitHub issue #161. Planned against HEAD `a045101` on `main`; the design was
written against `340ac39` and its drift is re-checked below.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW to MEDIUM. No emit condition, rule id, severity, or locked
  contract changes; the risk is confined to the fixture refresh ratchet and
  to writing reviewed client copy well.
- **Depends on**: none. No active plan touches these files.
- **Category**: full-audit finding quality, legal-reporting honesty
- **Completed at**: 2026-09-10. Live real-scan review (trade-off 32) on the
  operator-authorized full audit of `lescorderies.com` (audit
  `032e2d58-f612-4348-be56-9549ff10c452`, 27 pages): the site publishes a
  checksum-valid SIREN 487901282 and TVA FR48487901282 on its
  mentions-legales page, so the finding correctly stayed silent, no LCEN
  block or coverage sentence renders in either language (verified by text
  extraction of both rendered PDFs and a visual page review), and the
  checked-page evidence payload is live in the scan artifact
  (`scan.mentionsLegales.checkedPages`, homepageFallback false). The firing
  path stays covered by the spa-demo fixture pair. The legal exposure
  section states published criteria and observed facts only, with the
  legal-counsel disclaimer.

## Why this matters

The rule `lcen-mentions-legales-missing` already fires end to end when none
of SIREN, RCS, or TVA is found, but its stored evidence says only
`{ siren: null, rcs: null, tva: null }`. That record cannot answer the two
questions a client's lawyer asks: exactly what did the check look at, and
does an absence here mean an absence anywhere. The research note
(`docs/research/lcen-website-identification-check-2026-09-09.md`, lines 59
to 73) draws the defensible boundary: retain the pages and evidence the scan
checked, disclose the coverage, and never state breach. Today that boundary
lives partly in prose strings and not at all in the finding's own evidence.
This plan moves the checked-page fact and the per-field presence record into
the finding where they can be defended, and adds the reviewed coverage
sentences next to the observation.

## Binding decisions (operator, 2026-09-10, all design defaults)

1. **Field cut line: widen nothing.** SIREN, RCS, and TVA stay the only
   extracted fields, and therefore the only `detectably present` rows.
   Telephone is explicitly the first candidate widening and is recorded as
   out of scope below. A row moves from `absent-not-proven` to
   `detectably present` only when a reviewed deterministic extractor for
   that exact field lands in the tree; wording, severity, or copy changes
   never move a row.
2. **One rule, id unchanged.** `lcen-mentions-legales-missing`
   (`packages/core/src/normalize/normalize-custom.ts:16`). The dashboard
   hook, the model diversion, the manual SIREN resolution, and the reviewed
   copy all keep working with no further change.
3. **Severity: `serious` for total absence, unchanged.** The locked row is
   `packages/core/src/normalize/severity.ts:127`. No `moderate` per-field
   variant exists in this slice, so the fallback-gate interaction the design
   records (`packages/core/src/cost-gating/brokenness.ts:44`,
   `packages/interface/src/pipeline/analysis-stage.ts:272`, `:346`) is
   untouched.
4. **Copy budget approved.** The FR and EN coverage sentences are part of
   this plan, written before the normalize change lands (trade-off 71,
   `docs/decisions/trade-offs.md:3581`). The operator reviews the added
   sentences at commit-review time; that gate stays with the operator.
5. **Coverage disclosure: both placements.** The methodology section states
   the check's coverage once per report; the finding description carries the
   same boundary next to the observation, so the finding stays honest read
   alone.
6. **Full audits only.** Prospecting grows no checks. The emit condition is
   byte-identical before and after this plan, so prospecting sees exactly
   the findings it saw before; hotel prescans emit no findings at all
   (trade-off 35). No gating code is added or removed.

## Current state (verified against `a045101`)

- The scanner extracts SIREN checksum-validated and SIRET-aware, editor
  section first (`packages/scanner/src/checks/mentions-legales.ts:19`,
  `:26`, `:172`), plus RCS paired with its registry city and TVA, by pure
  regex on the one page whose URL resolves as the mentions-legales target
  (`packages/scanner/src/scan-page.ts:351` to `:362`). When no URL matches
  the heuristic, the check falls back to the homepage so absence still
  surfaces (`packages/scanner/src/scan-site.ts:950` to `:952`).
- Normalization emits exactly one `FindingCandidate` when all three
  identifiers are absent (`packages/core/src/normalize/normalize-custom.ts:25`
  and `:26`, fed from `packages/core/src/normalize/normalize.ts:234`).
  `rawEvidenceForPage` today holds `{ siren, rcs, tva }`
  (`normalize-custom.ts:40`), all `null` in every fired finding.
- The rule maps to `serious` (`severity.ts:127`, read through
  `severityFromCustom` at `severity.ts:265`), is diverted from every model
  pass (`packages/llm/src/diversion.ts:66`), highlights the dashboard alert
  (`packages/interface/src/dashboard/routes/audit-detail-model.ts:80`),
  resolves by a supplied SIREN source URL
  (`packages/report/src/template/lcen-resolution.ts:35`), and carries
  reviewed FR and EN remediation copy
  (`packages/report/src/template/remediation/fr.ts:218`,
  `packages/report/src/template/remediation/en.ts:196`) plus a French label
  and gloss (`packages/report/src/template/rule-translations.ts:332`).
- The report already renders a deterministic LCEN block when the finding is
  present (`packages/report/src/template/sections/legal-exposure.ts`,
  `renderLcenBlock`, trade-off 28) with its own observed-and-limit strings,
  and the methodology section already carries a general coverage disclosure
  (`packages/report/src/template/sections/methodology.ts:460`, built by
  `buildCoverageDisclosure`). Neither names what the identification check
  itself covered.
- The trade-off 71 source-derived test demands reviewed FR and EN
  remediation copy for every severity-mapped custom rule
  (`packages/report/src/template/remediation/remediation.test.ts`), so copy
  must exist in the same change set, not after it.
- The spa-demo control already carries a checksum-valid SIREN (732 829 320),
  RCS Bordeaux, and a TVA number
  (`fixtures/spa-demo/mentions-legales.html:21` to `:23`), so it is the
  silent control; the full-scan fixture test asserts its resolution
  (`packages/scanner/src/artifacts/write-audit.e2e.test.ts:100`). There is
  no firing fixture anywhere.

### Design drift check, this session

Two commits after the design's HEAD touched the fallback-gate neighborhood
(`1940e3e`, `a045101`), moving lines only: the design's
`analysis-stage.ts:259` and `:333` are now `:272` and `:346`; the design's
`normalize-custom.ts:27` emit condition sits at `:26`; trade-off 32's entry
now starts at `docs/decisions/trade-offs.md:1312`, not `:1302`. Every other
premise matches the live code character for character. No STOP condition
fires.

## Locked contracts and renumbering

**No locked contract changes.** `FindingCandidate.rawEvidenceForPage` is
`Record<string, unknown>` (`packages/core/src/normalize/candidate.ts:67`),
and the locked `Finding.rawEvidence` that absorbs it is
`Record<string, unknown>` (`packages/core/src/types/findings.ts:134`), so
the widened payload is additive data under an open shape. `severity.ts` and
`llm-output.ts` are not touched. If implementation ever seems to require
editing a locked file, that is a STOP condition below, not a workaround.

**Nothing renumbers.** Trade-off 32 (`docs/decisions/trade-offs.md:1312`)
forces regeneration when a normalize change drops or reorders findings. This
plan changes none of the identity inputs: the emit condition
(`normalize-custom.ts:26`), the dedupe key (`sha256(source|ruleId|"")`,
`packages/core/src/normalize/dedupe.ts:34`), the candidate push order
(`normalize.ts:234`), and the findingId assignment
(`packages/core/src/normalize/finding-id.ts:31`) are all byte-identical
before and after. Description and evidence are payload only. Stored analyses
stay valid and nothing needs `--regenerate-structure`. The plan's step 5
verifies this on the refreshed fixtures instead of assuming it.

What does change is the normalization-source fingerprint, so the trade-off
68 ratchet requires `pnpm fixtures:refresh` and the observed-rule inventory
requires `pnpm fixtures:rules` (`package.json:29`). Real-scan review before
the work is called done is trade-off 32's own requirement and is the
operator step in the done criteria, exactly as plan 035 kept its live gate.

## Scope and non-goals

- In scope: the evidence payload and description of the one existing rule,
  the FR and EN coverage copy (remediation entries, methodology section,
  finding description), the firing spa-demo fixture, the fixture refresh,
  and one short trade-offs entry.
- Not in scope: any field widening, including telephone (the first candidate
  for a later slice, and only with its own reviewed deterministic detector);
  any `moderate` per-field variant or severity change; any change to
  `findMentionsLegalesUrl` resolution semantics; TVA's statutory home (the
  design asserts proxy use only); dashboard changes (its bilingual
  observed-and-limit card already exists);
  `regimes.ts` and the LCEN legal-exposure block (trade-off 28 stands as
  is); prospecting checks and cost gates; any locked contract; any live
  third-party scan.

## Steps

1. **Reviewed remediation copy first (report, trade-off 71 gate).** Add one
   coverage sentence to each existing entry, drawn from the wording below:
   `remediation/fr.ts:218` and `remediation/en.ts:196`. The rule
   translations gloss (`rule-translations.ts:332`) stays as it is. Keep
   `remediation.test.ts` green without lowering any check. The added
   sentences are the design's approved copy budget; the executor presents
   the exact added French and English sentences to the operator and does not
   commit before sign-off. Copy exists in the tree before step 2 lands.
2. **Evidence payload and honest description (core, scanner).** Extend the
   additive payload per the design: one presence entry per article 1-1 row
   of the design's detector-status table (extracted value or null; with zero
   widening, SIREN, RCS, and TVA carry the only ever-populated keys and the
   rest are null by construction), plus the checked-page list: the resolved
   mentions-legales URL, or an explicit homepage-fallback marker when
   `scan-site.ts:950` used it, and the visited URLs the resolution searched.
   Plumb the checked-page list through `MentionsLegalesExtraction`
   (`packages/scanner/src/checks/mentions-legales.ts:12`) and
   `MentionsLegalesCheckInput` (`normalize-custom.ts:18`), filled by
   scan-site at resolution time and persisted with the page result
   (`scan-page.ts:592`). Derive the finding description's coverage sentence
   from the payload, never hand-written per report. Emit condition, rule id,
   title, category, and severity lookup stay byte-identical. Unit tests:
   payload shape, emit condition still fires only on total absence, silent
   control still returns an empty array, description names the checked page.
3. **Methodology coverage sentence (report).** Add one bilingual strings key
   pair (`strings/types.ts`, `strings/fr.ts`, `strings/en.ts`) and render it
   in the methodology section (`sections/methodology.ts`) once per report,
   only when the finding is present, with the checked-page fact read from
   the finding's own evidence payload. Extend `methodology.test.ts`.
4. **Firing spa-demo fixture (scanner).** Add a page to `fixtures/spa-demo`
   whose URL resolves as a mentions-legales target and carries no SIREN, RCS
   or TVA anywhere, forming the required pair with the existing silent
   control (`fixtures/spa-demo/mentions-legales.html:21` to `:23`). Exercise
   the firing case through the shared e2e dev server
   (`scripts/vitest-e2e-global-setup.mjs`) by pointing `scanPage`'s existing
   `mentionsLegalesUrl` option at the new page, so `findMentionsLegalesUrl`'s
   first-match semantics are not touched; assert one candidate with the
   widened payload, and none for the control. If a full `scanSite` firing
   case ever seems to require changing resolution semantics, that is a STOP
   condition.
5. **Fixture refresh, inventory, and the no-renumber proof.** Run
   `pnpm fixtures:refresh` (trade-off 68) and `pnpm fixtures:rules`
   (`package.json:29`). Diff the refreshed real-scan fixtures and confirm
   the change is fingerprint and payload only: no finding dropped, no
   finding reordered, no findingId shifted. Any drop or reorder is a STOP
   condition. Then run the verification commands below.
6. **Docs.** One short trade-offs entry (next free number, 78) recording the
   durable rules: checked pages live in evidence, not prose; only a landed
   deterministic extractor moves a detector-status row; and full audits are
   where this finding's client-facing disclosure renders. Add the matching
   one-line charter index entry. The design document already holds the
   detector-status table; do not duplicate it.

## Coverage disclosure wording (operator sign-off copy, verbatim from the design)

French, for the methodology section, with the finding description carrying
the English equivalent as its stored read-alone record:

> La vérification automatique a porté sur la page atteinte depuis le lien
> Mentions légales. Aucun identifiant reconnu (numéro SIREN, mention RCS ou
> numéro de TVA) n'y a été trouvé. Des informations légales peuvent exister
> ailleurs, par exemple sur une page non visitée par le contrôle, dans un
> document séparé ou auprès d'un prestataire externe. Cette constatation
> décrit ce que le contrôle a observé et ne constitue pas une conclusion sur
> vos obligations. Nous vous recommandons de confirmer votre situation auprès
> d'un conseil juridique.

English, same placement:

> The automated check covered the page reached from the Mentions légales
> link. No recognised identifier (SIREN, RCS mention, or VAT number) was
> found on that page. Legal information may exist elsewhere, for example on a
> page the scan did not visit, in a separate document, or with an external
> provider. This statement describes what the check observed and is not a
> conclusion about your obligations. We recommend confirming your situation
> with a qualified legal adviser.

Both texts state what was checked and what was not found, allow for legal
information elsewhere, and recommend a lawyer. Neither states breach, a
deadline, or a sanction amount, per `docs/rules/obligation-basis.md` section
8bis ("what the scanner may say") and the we-report-we-do-not-conclude rule
(section 7). No model is involved at any point: the copy is deterministic
template text, and the finding stays diverted (`diversion.ts:66`). When a
future decision widens the field cut, the parenthetical identifier list and
the checked-page sentence are regenerated from the evidence payload of that
day, never edited by hand per report.

## Verification

```bash
pnpm test packages/core/src packages/scanner/src packages/report/src
pnpm run test:e2e
pnpm fixtures:refresh && pnpm fixtures:rules
pnpm run format
pnpm run check
```

`pnpm run test:e2e` covers the spa-demo scanner suites, including the new
firing case and the silent control. The store suites are unaffected and run
only if something downstream of `findings.json` surprises the executor.

## Done criteria

- All six steps landed; the focused suites, the e2e scanner suites, and
  `pnpm run check` are green; `fixture-freshness.test.ts` passes on the
  refreshed stamps.
- The refreshed-fixture diff shows fingerprint and payload changes only;
  the no-renumber proof of step 5 is recorded in the session log.
- The operator has signed off the added FR and EN sentences (step 1) and the
  charter index line (step 6).
- Status `IMPLEMENTED` at that point. `DONE` needs the operator's real-scan
  review per trade-off 32: one full audit of an operator-named, authorized
  site, read in both languages, confirming the finding fires or stays silent
  correctly, the evidence payload holds the checked pages, and the
  methodology sentence and remediation copy render as approved. No live
  third-party scan is authorized by this plan; that authorization is the
  operator's, fresh and named.

## STOP conditions

1. Any change would touch `findings.ts`, `severity.ts`, or `llm-output.ts`
   shapes: say exactly what is needed and stop for the operator. Expected:
   nothing; the payload rides `Record<string, unknown>` fields.
2. The refreshed fixtures show any dropped or reordered finding, or a
   shifted findingId: stop and report (trade-off 32). Expected: none.
3. A full `scanSite` firing fixture would require changing
   `findMentionsLegalesUrl` resolution semantics: stop and propose.
4. The operator's copy review demands more than sentence-level rework, or
   copy sign-off is unavailable: do not land the normalize change without
   reviewed copy in the same change set (trade-off 71). Rework the copy and
   re-present.
5. Any pressure to widen a field, add the `moderate` variant, or move a
   severity row mid-slice: out of scope by binding decisions 1 and 3; stop
   and record as a new decision instead.

## Maintenance notes

- The design's line citations drifted on `analysis-stage.ts` (now `:272`,
  `:346`), `normalize-custom.ts` (emit condition now `:26`), and trade-offs
  (`32` now at `:1312`); this plan cites live `a045101` lines throughout.
- `pnpm test <path>` filters; `pnpm test -- <path>` does not, under pnpm 12.
- The French text above uses the design's punctuation as approved; follow
  the existing string conventions of the file each sentence lands in.
