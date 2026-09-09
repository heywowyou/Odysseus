# LCEN publisher-identification finding upgrade: design

Date: 2026-09-09. Written for issue #161 (advisor plan 031), planned at commit
`71da99a`, written against HEAD `340ac39`. Inputs read in full this session:
`docs/research/lcen-website-identification-check-2026-09-09.md` (the research
note), `docs/rules/obligation-basis.md` (sections 7 and 8bis govern the
wording), and `docs/rules/operator-obligations.md` section 2. This document
is a design; it changes no scanner, rule, fixture, or copy.

**The finding already exists (validity change, stated first so no reader
believes the rule is missing).** The rule `lcen-mentions-legales-missing`
ships end to end. The scanner extracts SIREN (checksum validated, SIRET
aware, editor-section first, `packages/scanner/src/checks/mentions-legales.ts:172`),
RCS, and TVA by pure regex on the one page the crawl resolves as the
mentions-legales page (`packages/scanner/src/scan-page.ts:351` to `:362`).
Normalization emits a `FindingCandidate` exactly when none of the three was
found (`packages/core/src/normalize/normalize-custom.ts:25`, fed from
`packages/core/src/normalize/normalize.ts:234`). The rule maps to `serious`
in the locked severity table (`packages/core/src/normalize/severity.ts:127`),
is diverted from every model pass (`packages/llm/src/diversion.ts:64` to
`:68`), is highlighted in the dashboard
(`packages/interface/src/dashboard/routes/audit-detail-model.ts:80`), carries
reviewed FR and EN copy (`packages/report/src/template/remediation/fr.ts:218`,
`packages/report/src/template/remediation/en.ts:196`, gloss at
`packages/report/src/template/rule-translations.ts:332`), and can be
suppressed by a supplied SIREN source URL
(`packages/report/src/template/lcen-resolution.ts:35`). The remaining gap,
the whole subject of this design, is the article 1-1 field list beyond the
three-identifier proxy, the per-field absent-versus-not-proven distinction,
and coverage disclosure wording.

**Drift check result and adaptations.** The plan's drift check shows one
changed file since `71da99a`:
`packages/interface/src/dashboard/routes/audit-detail-model.ts`. The change
is issue #162's additive `fallbackNoticeText` helper (line 105); the
publisher-identification constant is unchanged and moved from line 78 to
line 80, so this document cites `audit-detail-model.ts:80`. The same issue
amended trade-off 23 (`docs/decisions/trade-offs.md:887`): the audit fallback
gate is now wired, so `packages/interface/src/pipeline/analysis-stage.ts:259`
evaluates `isAuditFallbackEligible` and a fallback analysis is stamped
`generationMode: 'static-fallback'` (`analysis-stage.ts:333`). The plan's
maintenance note that severity interacts with that gate is therefore live
code today; decision 3 carries the consequence. No other premise shifted: the
research note's lines 59 to 73 match the plan's quote verbatim, and the emit
condition, severity row, diversion, copy, and resolution hook all match the
live code. No STOP condition fired.

## Operator decisions required

1. **Field cut line.** Which article 1-1 fields the upgraded detection
   covers; the section 2 table is the menu. Default: widen nothing in the
   first slice; the three extracted identifiers stay the only `detectably
   present` set, and the upgrade is evidence plus disclosure. Telephone
   numbers are the first candidate widening, but every added field needs its
   own reviewed detector before its row may move. With zero widening, the
   rest of this design stands unchanged.
2. **One rule or several.** Default: one rule, id unchanged
   (`lcen-mentions-legales-missing`, `normalize-custom.ts:16`), with
   per-field evidence in `rawEvidenceForPage`. A page either carries an
   identification block or does not; one id keeps the dashboard hook, the
   model diversion, the manual SIREN resolution, and the reviewed copy
   working with no further change.
3. **Severity.** The row in the locked `CUSTOM_CHECK_SEVERITY` table
   (`severity.ts:127`). Default: keep `serious` for total absence. A
   per-field partial finding, if ever wanted, is proposed as `moderate` and
   needs explicit approval here. Consequence now live after issue #162: a
   site whose only finding is this `serious` rule is not fallback-eligible
   (`brokenness.ts:44`), so its audit always pays the model passes; a
   `moderate` variant could let a thin audit fall back to the static honest
   section instead (`analysis-stage.ts:259`, `:333`). Anyone changing the
   severity must re-read that interaction first.
4. **Remediation copy budget.** Approval of the reviewed FR/EN copy work in
   section 5. Trade-off 71 (`docs/decisions/trade-offs.md:3581`) makes this a
   build blocker, not a nicety. Default: approve the budget now, alongside
   the implementation plan, so copy exists before the normalize change lands.
5. **Coverage disclosure placement.** Methodology section, finding
   description, or both. Default: both. The methodology section states the
   check's coverage once per report; the finding description carries the same
   boundary next to the observation, so the finding stays honest read alone.
6. **Where the finding may fire.** Prospecting scans or full audits only.
   Default: full audits only. Prospecting must not grow checks; its cost
   gates assume the current check set, and a legal-adjacent finding in cold
   outreach raises the wording bar for no prospecting benefit.

## Article 1-1 field detector status

Field list from the research note, lines 14 to 28; the anonymous-editor
exception (note lines 30 to 35) permits host identification only and is a
scope question, not a detector. Extraction today is page-scoped:
`extractMentionsLegales` runs only on the page whose URL matches the
operator-resolved mentions-legales URL (`scan-page.ts:351`), so even the
extracted rows are detectably present on the checked page, never proven
site-wide; that is exactly the boundary section 3 quotes.

| Field | Who it identifies | Detector status today | Honest classification |
| --- | --- | --- | --- |
| Name (nom) | natural person | not extracted | absent-not-proven |
| Given names (prénoms) | natural person | not extracted | absent-not-proven |
| Domicile | natural person | not extracted | absent-not-proven |
| Telephone number | natural person | not extracted | absent-not-proven |
| RCS or RNE registration number, where applicable | natural person | extracted (SIREN and RCS patterns) | detectably present |
| Company or business name (dénomination or raison sociale) | legal person | not extracted | absent-not-proven |
| Registered office (siège social) | legal person | not extracted | absent-not-proven |
| Telephone number | legal person | not extracted | absent-not-proven |
| Registration number, where applicable | legal person | extracted (SIREN and RCS patterns) | detectably present |
| Share capital (capital social), where applicable | legal person | not extracted | absent-not-proven |
| Registered-office address, where applicable | legal person | not extracted | absent-not-proven |
| Publication director or co-director | the editor | not extracted | absent-not-proven |
| Editorial manager, where applicable | the editor | not extracted | absent-not-proven |
| Host name or company name | host | not extracted | absent-not-proven |
| Host address | host | not extracted | absent-not-proven |
| Host telephone number | host | not extracted | absent-not-proven |
| Identity and address of a party that stores data it processes directly when editing the service, where applicable | data-storage party | not extracted | absent-not-proven |
| VAT number (TVA intracommunautaire) | proxy signal only, not an article 1-1 I field in the note's list | extracted | detectably present (proxy signal) |

The SIREN pattern is checksum validated and SIRET aware
(`mentions-legales.ts:19` to `:25`); the RCS pattern pairs the registry with
its city. Classification rule, written out so no future reader upgrades a row
without changing the detector first: a row is `detectably present` only while
deterministic code in the tree extracts that exact value on a visited page;
every row without such a detector is `absent-not-proven` by construction.
Rewording a finding, changing its severity, or writing new copy never
upgrades a row; a reviewed deterministic extractor is the only path from
`absent-not-proven` to `detectably present`. The TVA row is kept because the
emit condition accepts it (`normalize-custom.ts:27`), but the design does not
assert it as an article 1-1 I field; its statutory home is research work for
the note.

## Detection boundary (quoted verbatim)

Quoted from `docs/research/lcen-website-identification-check-2026-09-09.md`,
lines 59 to 73, verified character for character against the file this
session, including the typographic quotation marks:

> ## Safe audit observation and detection boundary
>
> The defensible observation is limited to what the scan can establish, for
> example: “No publisher-identification information or recognised registration
> identifier was found on the first-party pages visited.” A missing page whose
> link text says `Mentions légales` is not enough on its own, because the law
> requires availability of information rather than a specific page label.
>
> The scanner should retain the pages, links and extracted evidence it checked,
> and disclose its coverage. Legal information may be on a page that was not
> visited, an external booking route, or an inaccessible document. It should not
> say that an operator has no legal notices, is acting illegally, is in breach,
> or faces a specified sanction. It should state the legal criterion, the
> information not found in the scanned material, and recommend confirmation
> with a qualified legal adviser.

## Proposed rule shape

Additive `FindingCandidate` changes only; no locked contract is touched
(`packages/core/src/types/findings.ts`,
`packages/core/src/normalize/severity.ts`,
`packages/core/src/types/llm-output.ts`).

- **Rule id unchanged.** `lcen-mentions-legales-missing`
  (`normalize-custom.ts:16`). One id keeps the dashboard highlight
  (`audit-detail-model.ts:80`), the diversion (`diversion.ts:64`), the manual
  resolution (`lcen-resolution.ts:35`), and the reviewed copy working.
- **Finding stays page-scoped.** Emitted only from the mentions-legales page
  resolution, one candidate per audit, exactly as today.
- **Evidence carries the upgrade.** `rawEvidenceForPage` today holds
  `{ siren, rcs, tva }` (`normalize-custom.ts:40`). The upgrade extends the
  payload to one presence entry per section 2 row (extracted value or null)
  plus the checked-page list: the resolved mentions-legales URL and the URLs
  scanned to resolve it. The research note (line 67) asks the scanner to
  retain the pages, links, and extracted evidence it checked; this payload is
  that requirement held in evidence, not in prose.
- **Severity mechanism unchanged.** `severityFromCustom` (`severity.ts:265`)
  reads the locked row (`severity.ts:127`); the call site does not change.
  Any severity change is decision 3 and is a locked-file change requiring the
  operator's ok.
- **The model still never sees it.** The finding stays diverted
  (`diversion.ts:64`), so no schema, prompt, or alias change is needed. If a
  second rule id were ever approved, the diversion predicate would need the
  new id, and `packages/report` must keep importing the predicate rather than
  duplicating it (trade-off 8).

## Remediation copy budget

- **Rule id unchanged (decision 2 default).** The existing entries
  (`remediation/fr.ts:218`, `remediation/en.ts:196`) gain one coverage
  sentence each from section 6; the gloss (`rule-translations.ts:332`) needs
  no change. Estimate: 2 hours including review of the added sentence in both
  languages.
- **Per-field partial variant approved (decision 3 non-default).** A second
  rule id needs a `CUSTOM_CHECK_SEVERITY` row (locked file), FR and EN
  remediation entries, and rule-translations entries. Estimate: 2 to 3 hours
  additional. The source-derived test demands reviewed copy in both languages
  for every severity-mapped id before build (trade-off 71), so the work is
  budgeted before the normalize change lands, never discovered at
  report-render time; that late discovery is the exact incident shape
  trade-off 71 records, a full audit having already paid for its crawl and
  model passes before the report refused to render.
- **French reviewer.** The operator reviews the French text; no one else in
  the project reviews French. A native-speaker pass before the first client
  shipment is recommended but is the operator's call.

## Coverage disclosure wording

Proposed client copy, bilingual, fact-stating only: what was checked, that
legal information may exist elsewhere, and the lawyer recommendation. It
never states that the client has no legal notices, is in breach, or faces a
sanction, per obligation-basis section 8bis ("what the scanner may say") and
the boundary quoted above.

French, for the finding description and the methodology section:

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

When decision 1 widens the field cut, the parenthetical identifier list and
the checked-pages sentence are rewritten to name what the scanner checks that
day. Coverage sentences derive from the checked-page list in the evidence
payload, never written by hand per report.

## Fixture faults and inventory

- **Control (exists today).** `fixtures/spa-demo/mentions-legales.html:21` to
  `:23` deliberately carries a checksum-valid SIREN (732 829 320), the RCS
  Bordeaux mention, and a TVA number. The fixture is therefore not
  identification-free; keep it as the silent (no-finding) control.
- **Fault to add.** A spa-demo page whose URL resolves as the
  mentions-legales target and carries no SIREN, RCS, or TVA anywhere. Its
  name and serving mechanics are follow-up plan choices; the design fixes the
  required pair, one firing case and one silent case, so the emit condition
  and the evidence payload are both exercised.
- **Mandatory rebuilds after the normalize change.** `pnpm fixtures:refresh`
  re-derives every curated real-scan directory in `fixtures/audits.json` and
  stamps the fingerprint `fixture-freshness.test.ts` ratchets;
  `pnpm fixtures:rules` (`package.json:29`,
  `scripts/build-observed-rule-inventory.mjs`) rebuilds the committed
  observed-rule inventory. Trade-off 68 (`docs/decisions/trade-offs.md:3412`)
  makes the refresh a red-test ratchet rather than a chore, and trade-off 32
  (`docs/decisions/trade-offs.md:1302`) is why fixture-only verification is
  not enough for a normalization change: real-scan review is required before
  the change is called done.

## What this design does not decide

- The field cut line (decision 1), and so how many section 2 rows ever move
  to `detectably present`.
- The severity of a per-field partial variant (decision 3) and any change to
  the locked severity table itself.
- Approval of the copy budget (decision 4) and the final reviewed wording of
  the section 6 sentences.
- Whether prospecting scans ever emit the finding (decision 6).
- The mechanics of the new spa-demo fault page: naming, routing, resolution.
- Where the TVA identifier sits in the statute; the note does not list it as
  an article 1-1 I field, and this design asserts nothing beyond proxy use.
- Any dashboard, report-template, or regimes.ts change: the existing LCEN
  obligations block (trade-off 28) already renders the criterion
  deterministically and stays as it is.
