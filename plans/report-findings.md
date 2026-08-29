# Recurring full-scan and report review

Started 2026-08-27. Latest review baseline: commit `3c3c90b` on `main`.

## Purpose and lifecycle

This is the single recurring review ledger for completed full scans and their
client-facing reports, regardless of website. It answers four questions in one
place:

1. What would the client or business owner understand and decide?
2. Can the client's IT provider locate, own, and verify the work?
3. Is the legal framing bounded, sourced, and non-conclusive?
4. What should Odysseus improve before the next report is delivered?

The newest review is recorded first. The active roll-up contains unresolved
cross-report issues so a reader does not have to reconstruct them from every
run. A resolved item moves to the review history or is deleted from the active
roll-up once a regenerated report proves the correction.

This ledger records evidence and product findings. It does not override
`CLAUDE.md`, the legal sources in `docs/`, milestone order, or the deliberately
deferred implementation queue in
[`docs/report/report-feedback-deferred-items.md`](../docs/report/report-feedback-deferred-items.md).
Before implementation, re-verify the item against current HEAD and create a
focused plan if one is needed.

Status values:

- `open`: reproduced and actionable.
- `decision`: evidence is sound, but product direction must be selected first.
- `monitor`: a trigger or another real report is required.
- `fixed, regenerate`: current code appears corrected, but the reviewed PDF is
  older and must not be used to judge the fix.

Effort is `S`, `M`, or `L`. Fix risk describes the chance of changing report
meaning or behavior, not the seriousness of the underlying issue.

## Current delivery verdict

**Updated 2026-08-29. The P0 delivery gate is lifted.** RF-02 through RF-06 are
fixed in code, covered by tests, and confirmed in a freshly rendered pair of
Haaitza PDFs read end to end. The analysis was regenerated with
`--regenerate-structure` against
`artifacts/haaitza.com/2026-08-26T17-51-41Z` (required by trade-off 32, since a
normalize change renumbers findings), and both languages were rendered from it.
Confirmed absent from both documents: a client-specific criteria verdict
("Criteres reunis" / "Criteria met"), the Demarches Simplifiees exemption route,
any sanction or fine amount, any citation of LCEN article 6-III, and any
stringified `null`, `undefined` or unfilled CSS token. Confirmed present: the
obligation status column reads "Effectif et parcours observes" / "Headcount and
flow observed" and the section closes by saying it reproduces criteria and
public registry data with no added legal interpretation and that counsel is
still needed; the accessibility statement is offered as an optional best
practice outside the Article 47 regime rather than as an obligation; and the
real-user table is headed "75E PERCENTILE" / "75TH PERCENTILE".

P1 and P2 entries below remain open, including two the read-through re-confirmed
in the new PDFs (RF-16) and one it newly surfaced (RF-17). Neither blocks
delivery. What the P0 fixes do is recorded in trade-off 40: derived documents now
carry a `findingsProvenance` stamp and fail closed without one; the report no
longer states a client-specific criteria verdict, names an exemption filing
route, or prints a client-specific sanction amount; superseded LCEN article
6-III is gone from the recommendation path; accessibility-statement publication
is conditioned on an independently established Article 47 regime; and CrUX field
values are labelled 75th percentile rather than median.

The original evidence, unchanged: the Haaitza PDFs generated before these fixes
confirmed client-specific EAA conclusions, an unsupported exemption route, a
sanction amount, an unconditional legal action for the accessibility statement,
and an incorrect statistical label. RF-04 was a cross-client blocker in the LCEN
rendering path even though Haaitza published a detected identifier and did not
trigger that rule.

## Active roll-up

| ID | Priority | Status | Main reader | Finding | Effort | Fix risk | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-02 | P0 | fixed | All | Derived analyses and PDFs are not bound to a digest or normalization fingerprint of the current findings; old outputs can survive renormalization and look current. | M | Medium | High |
| RF-03 | P0 | fixed | Legal, client | The report says the client meets EAA criteria, names an exemption filing route, and prints a specific sanction amount. | S to M | Medium | High |
| RF-04 | P0 | fixed | Legal | The French appendix declares an LCEN obligation “non respectée”, while other current recommendation text still cites superseded article 6-III. | S | Low | High |
| RF-05 | P0 | fixed | Client, IT | CrUX 75th-percentile field values are labelled “median value”. | S | Low | High |
| RF-06 | P0 | fixed | Legal, client | A missing accessibility statement is turned into an unconditional legal publication action without first establishing that the Article 47 regime applies. | S to M | Medium | High |
| RF-07 | P1 | open | Client, IT | Executive severity can be inflated by findings that need context, especially intentional `noindex` pages and third-party-owned components. | M | Medium | High |
| RF-08 | P1 | open | Client, IT | A priority theme can combine unrelated legal and technical findings while omitting a remediation for one or more included finding IDs. | M | Medium | High |
| RF-09 | P1 | open | Client, IT | Report-wide development-day totals imply an estimation model that the canonical deferred queue says does not yet exist. | S now, L for model | Low to high | High |
| RF-10 | P1 | monitor | Client, IT | Older reports contain duplicate Lighthouse successor and legacy audits; the latest Haaitza report does not reproduce the duplicate pair. | M | Medium | High |
| RF-11 | P1 | decision | Client | The full technical appendix can dominate the report and bury the decision document. | M to L | Medium | High |
| RF-13 | P1 | decision | Client, design | Pagination contradicts the canonical design contract and produces mixed sections plus pages that are mostly empty. | M | Medium | High |
| RF-15 | P1 | open | Client, IT | The six displayed priorities are numbered 1, 2, 3, 4, 5, and 9 after occurrence weighting, with no explanation for the missing ranks. | S to M | Low | High |
| RF-01 | P2 | open | Client, operations | Audit artifacts have no explicit lifecycle state distinguishing a completed crawl from an analysed, rendered, and approved deliverable. | M | Low | High |
| RF-12 | P2 | open | Client | The cover names accessibility, performance, SEO, and GEO but omits privacy and security even when that category is present. | S | Low | High |
| RF-14 | P2 | open | IT | “Worst page” displays only the worst numeric value, not the page, so the column label promises more than the table provides. | S to M | Low | High |
| RF-16 | P2 | open | Client, legal | The legal page exposes the internal token `(siren:extracted)` and leaves a French employee-band value inside the English report. | S | Low | High |
| RF-17 | P2 | open | Client, operations | The closing provenance line says the report was “generated on” the scan date and stamps the scanning build, not the render date or the rendering build, so two renders of one audit are indistinguishable and a re-render looks older than it is. | S | Low | High |

## Detailed product findings

### RF-01: deliverable lifecycle is implicit

**Evidence.** Haaitza audit `7af7a670-1322-4e94-8a46-2f680de3c670`
completed at `2026-08-26T19:22:27.709Z`. It initially contained the manifest,
normalized findings, and page evidence but no analysis or report. French and
English analyses and PDFs were generated manually on 2026-08-27. The earlier
`17-37-02Z` directory remains an incomplete attempt without a manifest, and
the `01-55-06Z` run stopped at its configured 100-page cap.

**Impact.** A person selecting the newest directory can reasonably believe a
full client report exists when only scanner output exists. Manual directory
inspection was required to distinguish the crawl, failed attempt, capped run,
analyses, rendered PDFs, and the separate approval state.

**Improvement.** Give every run an explicit lifecycle such as `scanned`,
`analysed`, `rendered`, and `approved`, with visible timestamps and artifact
paths. The history screen and CLI should distinguish a completed crawl from a
completed deliverable. Report generation should fail closed when a required
stage is missing.

### RF-02: derived-output freshness is not guaranteed

**Evidence.** Older Haaitza and La Corniche directories contain reports and
analyses generated before later normalization changed their finding sets. In
the reviewed artifacts, the old Haaitza PDF reports 177 findings while the
current normalized file contains 77; the old La Corniche PDF reports 525 while
the current normalized file contains 309. Some analysis finding references no
longer exist in the current files. The new Haaitza PDFs were generated from
the current 79-finding input and do not reproduce the mismatch, but neither
the analysis JSON nor the PDF carries a findings digest that would prove that
relationship later.

**Impact.** A valid-looking PDF can describe evidence that no longer belongs
to the normalized audit beside it. This is a provenance failure, not merely
stale wording, and could invalidate client, IT, and legal decisions.

**Improvement.** Bind each analysis and report to the audit ID, findings schema
version, normalization fingerprint, findings digest, language, analysis ID,
and report renderer version. Refuse rendering or delivery on mismatch. Show a
clear stale state and invalidate derived outputs when normalization changes.

### RF-03: client-specific EAA conclusion, exemption route, and sanction

**Evidence.** Pages 4 and 5 of the new French Haaitza PDF, and page 4 of the
English PDF, label the obligation status “Critères réunis” / “Criteria met”,
say the site meets the criteria for a digital-accessibility obligation,
prescribe a disproportionate-burden filing via Démarches Simplifiées, and
state the EUR 7,500 sanction amount. The caveat recommending legal counsel
appears after the conclusion. `packages/report/src/template/sections/legal-exposure.ts:223`
through `:239` renders the sanction for `in_scope` and `likely_in_scope`.
`docs/obligation-basis.md` and `CLAUDE.md` permit criteria and verified facts,
but prohibit a client-specific legal conclusion or sanction amount. The
approved basis also does not establish Démarches Simplifiées as the filing
route for this exemption.

**Impact.** The report crosses from bounded factual explanation into a
client-specific legal conclusion. A later disclaimer does not undo the status
badge, filing instruction, or sanction statement.

**Improvement.** Replace the status with the verified criteria and unknowns,
without a conclusion that the obligation applies. Remove the unsupported
filing route and sanction figure from client-specific report paths. Keep
general enforcement facts only in approved generic educational material,
backed by primary sources and separated from the client's status.

### RF-04: conclusive and stale LCEN language

**Evidence.** `packages/report/src/template/rule-translations.ts:330` through
`:332` labels the absence of a detected identifier as an LCEN obligation that
is “non respectée”. `packages/core/src/normalize/normalize-custom.ts:37` and
`packages/core/src/reference-stats/recommendation-templates.ts:283` still cite
LCEN article 6-III. The approved basis uses post-SREN article 1-1, I, 2 and
allows only the bounded statement that the scan did not find an identifier.

**Impact.** The generated appendix can make a legal breach finding that the
crawler cannot establish, and stale citations make the conclusion less
defensible.

**Improvement.** Use one deterministic, approved, bounded string everywhere:
the scan did not find a SIREN, RCS, or VAT identifier in the pages reviewed;
the scan may miss it; verify the publication and legal applicability with
counsel. Remove superseded citations from every reachable recommendation path.

### RF-05: CrUX p75 is labelled as a median

**Evidence.** `packages/report/src/template/sections/core-web-vitals-table.ts`
passes `cruxFieldData.lcp.p75`, `.inp.p75`, and `.cls.p75` into the real-user
table, but the table header at line 206 reuses `valueColumnLabel`. That label is
“Valeur médiane” in French and “Median value” in English. The error is visible
in the reviewed Lagnonu, Haaitza, and Palais Gallien PDFs.

**Impact.** A statistically literate client or IT provider is given the wrong
definition of the field measurement. It undermines trust in the rest of the
performance section.

**Improvement.** Give the real-user table its own `75e percentile` / `75th
percentile` label and test both languages. Keep “median” only for the
page-aggregated lab table.

### RF-06: accessibility-statement action lacks a regime condition

**Evidence.** The latest Haaitza scan records
`accessibility-statement-missing` as a moderate finding. Page 7 of the French
PDF tells the provider to publish a statement “conforme aux obligations
légales”; the English version tells it to publish and link the statement from
every footer. Both cards simultaneously label conformance “Not applicable”.
The page 3 reader guide also sends the provider to a “Déclaration” /
“Statement” section that does not exist in the table of contents. The approved
legal basis says the declaration, status, and feedback mechanism form the
Article 47 trio; they are not automatically an EAA obligation, and the report
must not infer that a private company is covered by Article 47.

**Impact.** A useful inclusion practice is presented like a client-specific
legal requirement. Legal and IT readers cannot tell whether it is mandatory,
conditional, or voluntary.

**Improvement.** Render the legal action only after an independently supported
Article 47 determination. Otherwise label publication as an optional best
practice and keep the automated fact limited to “no statement was found”.

### RF-07: executive severity needs ownership and intent context

**Evidence.** The latest Haaitza scan marks 14 pages critical for
`noindex-on-public-page`; the set includes localized 404 pages, cookie and GDPR
pages, as well as pages that may genuinely be public commercial content. The
current report has contextual prose for some policy pages, but they still
contribute to critical roll-ups. In Lagnonu, a third-party booking widget made
all 65 pages appear to contain a critical finding even though later report text
identified the vendor ownership.

**Impact.** The first pages can overstate controllable business risk. The boss
sees an alarming total while IT later discovers that some items are deliberate
or vendor-owned.

**Improvement.** Split executive totals into confirmed first-party action,
third-party escalation, and verify-intent items. Do not let 404, privacy, or
legal-policy `noindex` findings enter the same critical decision metric as an
unexpectedly hidden booking or content page. Carry owner and intent through
the priority cards and checklist, not only into appendix notes.

### RF-08: themes can lose remediation coverage

**Evidence.** A reviewed Lagnonu priority groups LCEN publication, JSON-LD,
canonical, hreflang, and meta-description finding IDs into one SEO theme. Its
actions address only some of those families. The “remaining work” logic treats
every finding ID named by a priority as covered, and the legal note is attached
to a mixed legal and technical theme.

**Impact.** IT can complete every displayed action while leaving included
findings unresolved. Legal language also appears to qualify a whole mixed
theme, which is difficult for the client to interpret.

**Improvement.** Validate action coverage at rule-family level after the LLM
response. Split legal findings from technical SEO themes. A finding should be
considered covered only when at least one specific action maps to its rule
family, or it should remain in the explicit remaining-work section.

### RF-09: unsupported development-day totals

**Evidence.** Current French and English report strings sum priority effort
bands into a global number of development days. The canonical deferred queue
explicitly says not to add numeric estimates until rule-family cost and
page-value models have evidence, conservative bounds, and tests.

**Impact.** “Non-contractual” does not prevent a client from treating the
range as a budget or delivery commitment. IT may challenge a total that is not
based on architecture, stack, access, or vendor dependencies.

**Improvement.** Remove the aggregate day range now and retain low, medium, and
high effort bands. Reintroduce days only after the deferred domain model exists
and can disclose its assumptions.

### RF-10: duplicate Lighthouse work families

**Evidence.** Reviewed reports contain both `legacy-javascript` and
`legacy-javascript-insight`, and both `modern-http-insight` and `uses-http2`,
with overlapping remediation and page sets. The latest Haaitza findings still
contain `legacy-javascript-insight` on 177 pages; the normalization layer
supports Lighthouse replacement metadata, but historical artifacts show that
metadata is not sufficient for every version pair.

**Impact.** Duplicate rows inflate the report, distort frequency, and can lead
IT to create two tickets for one underlying change.

**Improvement.** Maintain a tested successor map for known Lighthouse audit
pairs in addition to metadata-driven replacement if another current scan
reproduces them. Preserve both raw records for provenance, but expose only the
current actionable family in client roll-ups and remediation. The new Haaitza
report contains only `legacy-javascript-insight`, so implementation should wait
for a current reproduction rather than changing normalization from historical
artifacts alone.

### RF-11: the appendix overwhelms the decision document

**Evidence.** The new technical appendix occupies pages 18 through 34 of the
37-page French Haaitza report and pages 18 through 32 of the 35-page English
report. Its first three French pages are primarily the complete 209-URL page
inventory before finding details begin. Earlier appendices occupy
approximately 29 of 47 pages for old Haaitza, 66 of 82 for La Corniche, 12 of
28 for Palais Gallien, and 16 of 38 for Lagnonu. The appendix is valuable and
the design contract currently requires full transparency.

**Impact.** A boss receiving an 82-page report may miss the six decisions that
matter. IT still needs every URL, selector, occurrence, and provenance field.

**Direction options.** Either keep one PDF and add stronger navigation,
component grouping, and compact repeated evidence, or deliver a short
executive report plus a bundled full technical annex with matching audit and
report IDs. The second option is easier for each audience, but changes the
single-report product contract and therefore needs an explicit decision.

### RF-12: cover scope is incomplete

**Evidence.** The cover subtitle is “Audit accessibilité, performance, SEO et
GEO” and its English equivalent. Reports can also contain privacy and security
findings; Lagnonu includes that category, and the latest Haaitza scan has a
Permissions-Policy finding.

**Impact.** The first page understates the delivered scope and makes the later
category look accidental.

**Improvement.** Derive the subtitle or a compact scope line from the categories
actually assessed, while distinguishing “checked with no finding” from “not
checked”.

### RF-13: pagination contract and implementation disagree

**Evidence.** `docs/report-design-system.md:58` through `:59` says numbered
sections may never share a sheet. Current CSS and pagination tests deliberately
allow flowing sections to share pages, with standalone treatment only for
selected sections. The new French and English Haaitza PDFs mix sections 01 and
02 on page 3, sections 02 and 03 on page 4, and sections 03 and 04 on page 5.
Priority 9 occupies only the top quarter of page 8, while English methodology
continues for a few lines on page 17 and leaves most of that page empty. These
pages violate the canonical no-mixed-section and minimum-fill expectations.

**Impact.** The layout is compact but less predictable, and the canonical
design document no longer describes what tests enforce. Fixes will oscillate
until the intended contract is chosen.

**Direction options.** Restore one numbered section per sheet and accept extra
pages, or amend the design contract to permit sharing under explicit widow,
opener, and minimum-fill constraints. Either choice needs stress-PDF tests.

### RF-14: “worst page” is only a value

**Evidence.** `packages/report/src/template/sections/core-web-vitals-table.ts`
computes only the worst metric value and places it under the “Pire page” /
“Worst page” heading. No page URL or page label is retained in that cell.

**Impact.** IT cannot go from the table to the page that needs investigation,
and the label is factually ambiguous.

**Improvement.** Either rename the column “Worst measured value” or preserve
and render the corresponding page in a compact, traceable form.

### RF-15: displayed priority numbers skip from 5 to 9

**Evidence.** Both new Haaitza PDFs promise six ranked priorities, then display
cards and checklist rows numbered 1, 2, 3, 4, 5, and 9. Occurrence weighting
promoted the original rank-9 multimedia theme into the displayed set without
renumbering it or explaining why ranks 6 through 8 are in “Still to address”.

**Impact.** The client can reasonably think three priorities are missing or
the report is corrupt. IT cannot tell whether the number is an execution order,
an original model rank, or a stable identifier.

**Improvement.** Use contiguous display positions for the selected six cards
and keep the original structure rank only as internal provenance, or explain
the two rankings explicitly. Test the checklist and cards with an
occurrence-weighting promotion that crosses the top-six boundary.

### RF-16: internal and untranslated registry provenance reaches the client

**Evidence.** The legal page in both new PDFs prints `(siren:extracted)`. The
English report also reproduces `100 à 199 salariés` inside its otherwise
English registry sentence. These are stored provenance values, not polished
client copy.

**Impact.** An implementation token makes the legal section look unfinished,
and the untranslated band weakens the bilingual deliverable at the point where
precision matters most.

**Improvement.** Map provenance enums to approved human-facing labels or omit
the internal token. Preserve the registry value verbatim only when clearly
labelled as a source quotation; otherwise translate the presentation while
retaining the original structured value in evidence.

## Latest review: Haaitza full scan, 2026-08-26

### Provenance and completeness

- Site: `https://haaitza.com/`
- Audit ID: `7af7a670-1322-4e94-8a46-2f680de3c670`
- Started: `2026-08-26T17:51:41.647Z`
- Finished: `2026-08-26T19:22:27.709Z`
- Scanner version: `1467a48`
- Discovery: depth 5, no practical page cap, sitemap supplement enabled,
  `robots.txt` found, 220 discovered entries, 209 visited HTML pages, 11
  external redirects skipped, and no recorded page errors.
- Sitemap: 131 eligible declared pages, 130 scanned, none omitted by a cap,
  no failed sitemap. The one-page difference should be shown and explained in
  a final report rather than silently rounded away.
- Language structure: 114 translation clusters across French, English,
  Spanish, Italian, and Portuguese variants.
- Analysis generated 2026-08-27: one shared 12-theme structure, French and
  English writing passes, overall risk `high`, and eight quick wins in each
  language. The two languages preserve identical ranks and finding-ID groups.
- Confirmed cover identity: commercial name `Haaitza`, legal name
  `SAS HAITZA`.
- PDFs generated 2026-08-27: French
  `artifacts/haaitza.com/2026-08-26T17-51-41Z/reports/2026-08-27T11-35-45Z-fr.pdf`
  (37 pages) and English
  `artifacts/haaitza.com/2026-08-26T17-51-41Z/reports/2026-08-27T11-35-48Z-en.pdf`
  (35 pages).
  Both are tagged, A4, unencrypted, have embedded Unicode fonts, and contain no
  JavaScript or suspicious PDF objects.

### Client or boss view

**Verdict:** the generated report looks professional and makes a large audit
approachable, but it is not safe to deliver. The executive story is useful;
the legal assertions and statistical label are blockers, while priority
numbering and page classification would cause avoidable client questions.

The most decision-relevant evidence is:

- Real-user LCP p75 is `5.361 s`, rated poor. INP p75 is `249 ms`, needing
  improvement. CLS p75 is `0.05`, which is good.
- Lab findings affect almost the whole estate: LCP on 209 pages, FCP on 208,
  and Speed Index on 205. The report should explain the likely shared-template
  leverage instead of presenting 600 separate page problems.
- Content is absent from raw HTML on two commercially meaningful French pages,
  which creates search and non-JavaScript visibility risk.
- Five restaurant pages across languages have images without alternative text.
- Some critical `noindex` results are plainly 404 or policy pages, while others
  are content pages. These require classification before they reach the risk
  headline.
- The report places the mixed 22-page indexing theme first and performance
  fifth even though poor real-user LCP and lab LCP affect the whole site. Low
  effort may justify that order, but deliberate 404 and policy exclusions must
  be separated before the boss is told this is the first action.
- The six selected priorities are numbered 1 through 5 and then 9. That looks
  like missing content, not a deliberate occurrence-weighting decision.
- The cover, reading guide, summary, checklist, remaining-work section, and
  appendix give distinct audiences useful entry points. The cover still omits
  privacy and security from its stated scope.

### IT department view

**Verdict:** the report is technically useful and the appendix is traceable,
but the priority actions remain too generic for a 209-page shared-template
site. IT still has to infer component ownership, the worst test page, and the
verification procedure. The p75/median error must be corrected before using
the performance table as a baseline.

Highest-leverage work families:

1. Diagnose shared LCP, FCP, Speed Index, and unused asset causes across the
   common templates. Compare the lab results with the real-user LCP p75.
2. Add discernible names to repeated gallery and video links. The scan records
   1,140 occurrences on 69 pages, indicating a component-level fix rather than
   hundreds of page edits.
3. Add captions or an equivalent accessible media treatment to video content
   found on 80 pages.
4. Correct reciprocal `hreflang` relationships. The scan records 418
   occurrences across 73 pages and several language-pair finding groups.
5. Fix the recurring narrow-screen overflow patterns on 43 pages, beginning
   with home pages, galleries, news, restaurants, and embedded social blocks.
6. Triage indexing intent page by page, especially the category, presentation,
   restaurant, and internal SEO pages. Keep deliberate 404 and policy-page
   exclusions out of the corrective queue.
7. Add or repair structured data on the shared templates: JSON-LD is absent on
   176 pages and invalid on 21.

Every ticket should carry the rule family, shared component or template,
representative URLs, affected languages, owner, expected result, and the
targeted rescan command or deterministic assertion.

The rendered report improves handoff by preserving finding IDs, selectors,
file lists, representative URLs, language clusters, and deterministic
remaining-work actions. However, it spends roughly three appendix pages on
the full 209-URL inventory before the findings, labels a numeric value as
“Worst page”, and gives no direct rescan or acceptance test. Performance is
summarized as one 209-page priority when IT needs the shared asset/template
causes and a representative worst URL.

### Legal department view

**Verdict:** reject the generated legal section for client delivery. The scan
facts are useful, but the report turns them into the client-specific status
“Criteria met”, prescribes an exemption filing route, and states a sanction
amount. A later recommendation to consult counsel does not neutralize those
claims.

The scan found a legal-notice page and SIREN `498173988`, so there is no LCEN
missing-identifier finding in this run. That is a verified scan fact, not a
legal sufficiency opinion. The PDF correctly reproduces the detected legal
name only after operator confirmation, but then exposes the internal
`siren:extracted` provenance token.

The final report must also say:

- Automated accessibility coverage is partial and requires the manual
  checklist before any conformance conclusion.
- The missing accessibility statement is a detected absence. Whether the
  Article 47 publication trio applies has not been established by this scan.
- The current priority action incorrectly calls publication a legal obligation
  while its own conformance field says “Not applicable”.
- A transactional flow was detected, but regime criteria, company facts, and
  exemptions must remain distinct; do not turn them into a client-specific
  obligation, deadline, or sanction conclusion.
- The single Permissions-Policy finding is a technical hardening observation,
  not a complete privacy, cookie-consent, or data-protection audit.

## Rendered report set used in this pass

The newly generated Haaitza PDFs are the primary evidence. Lagnonu and the
prior three-site set remain comparative evidence for recurrence and stress
behavior; they must not be presented as the latest Haaitza result.

| Site and scan | PDF reviewed | Pages | Use in this review |
| --- | --- | ---: | --- |
| Haaitza, `2026-08-26T17-51-41Z` | FR `2026-08-27T11-35-45Z`, EN `2026-08-27T11-35-48Z` | 37 FR, 35 EN | Primary current scan, analysis, legal, content, and layout evidence |
| Lagnonu, `2026-08-24T23-03-25Z` | FR `2026-08-25T16-41-54Z`, EN `2026-08-25T16-41-57Z` | 38 FR, 35 EN | Comparative bilingual layout and theme evidence |
| Haaitza, `2026-08-22T22-07-44Z` | FR `2026-08-24T16-08-00Z` | 47 | Historical comparison only; findings were later renormalized |
| La Corniche, `2026-08-22T22-07-45Z` | FR `2026-08-24T16-08-13Z` | 82 | Historical stress case; findings were later renormalized |
| Palais Gallien, `2026-08-24T13-07-52Z` | FR `2026-08-24T16-15-09Z` | 28 | Comparative compact report and legal-language check |

Positive qualities observed across the reports:

- A4 PDFs are tagged, consistently branded, bilingual where generated, and
  contain stable page counters and source URLs.
- Deterministic evidence preserves finding IDs, affected pages, occurrences,
  selectors, sources, and WCAG criteria.
- The reports disclose automated-audit limits, field versus lab data, manual
  accessibility gaps, and third-party attribution.
- The new Haaitza reports give clients a useful reading guide, priority cards,
  checklist, remaining-work section, full technical appendix, and consistent
  French/English theme membership.
- No credential-shaped query value was exposed in the reviewed PDFs. The
  current renderer's query-redaction behavior is therefore not an active PDF
  blocker.

## Fixed behavior confirmed or awaiting site-specific regeneration

- The old Lagnonu PDFs concatenate “et 2 autres” / “and 2 more” to a finding
  ID. The shared current helper renders correct spacing in both new Haaitza
  PDFs, so the product defect is closed; regenerate Lagnonu only if that old
  artifact is reused.
- The old La Corniche cover accepted malformed legal-name input too readily.
  Current behavior was confirmed end to end: Haaitza rendering stopped on the
  detected names, then succeeded only after the operator confirmed the exact
  commercial and legal values.
- The old Palais Gallien analysis used client-specific “sanctions” and “legal
  risks” prose. The current legal-consequence guard rejects those phrases.
  RF-03 and RF-04 were open for the same underlying reason: the guard catches
  model prose, but the prohibited wording was coming from deterministic report
  paths the guard never sees. Both are fixed at those paths (trade-off 40).

## Monitored or rejected concerns

- **Credential leakage in PDF URLs:** checked again in both new Haaitza PDFs;
  no credential-shaped URL was reproduced. Do not copy raw query values into
  this ledger; keep the redaction regression test.
- **Appendix URL sub-row splitting from its finding row:** the existing
  deferred queue records this as reproduce-before-changing. It was not promoted
  to the active roll-up because this pass did not establish a stable fixture.
- **Section opener separated from its first content:** visual imbalance was
  observed, but the broader pagination-contract conflict in RF-13 must be
  decided first.
- **Lighthouse element-shaped concentration:** the existing 30 percent trigger
  was not reached by any latest Haaitza normalized finding family. Keep the
  deferred trigger; do not invent a new identity rule from analogy alone.
- **A failed scan as a report:** Haaitza `2026-08-26T17-37-02Z` is an incomplete
  artifact directory, not a completed scan, and was excluded from the review.

## Procedure for the next recurring review

1. List all local manifests by `finishedAt`; do not use directory modification
   time as recency.
2. Select the newest completed intended-scope scan. Record and exclude capped,
   failed, or abandoned attempts explicitly.
3. Verify crawl completeness: visited, skipped, failed, cap-omitted, sitemap,
   robots, timeouts, and language-cluster coverage.
4. Verify every analysis and PDF binds to the selected audit ID and current
   findings fingerprint. If not, stop delivery and open or update RF-02.
5. Review the executive pages as the client, priorities and appendix as IT,
   and every obligation, deadline, exemption, breach, and sanction phrase as
   legal.
6. Review at least one French and one English PDF when both exist. Inspect the
   cover, executive summary, legal section, densest priority page, performance
   table, remaining work, appendix transitions, and final page.
7. Update the active roll-up. Add new evidence to an existing stable ID when it
   is the same defect; create a new ID only for a distinct root cause.
8. Record fixed-but-stale observations until a regenerated artifact proves the
   fix. Record rejected concerns so the next reviewer does not repeat them.
9. Run `pnpm docs:check` and `pnpm run check` after editing this ledger.

Reviewing saved artifacts does not authorize a new live browser scan. Follow
the current charter and operating policy before any future live-site action.
