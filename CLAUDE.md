# Odysseus

> **Shared project charter.** This file is consumed by Claude Code, Codex,
> and ZCode (added 2026-08-29). Its filename is historical: it remains the
> authoritative source for
> durable engineering and product rules. Codex starts from `AGENTS.md`, which
> intentionally points here instead of maintaining a second copy. The shared
> handoff protocol is `docs/agents/handoff.md`; document authority and status
> are mapped in `docs/agents/documentation-map.md`; shared code and prose
> conventions are in `docs/agents/coding-conventions.md`.

Internal tooling for a productized web audit service sold to French small
and mid-size businesses. Two audit types share one engine: technical /
SPA-SEO, and accessibility against WCAG 2.2 AA and EN 301 549.

Full context: `docs/product/odysseus-project-brief.md`. Read it before
proposing any architecture. Normalization behaviour and the reasoning
behind it: `docs/rules/normalization-rules.md`. What the model may see, must
return, and how failures are handled: `docs/rules/llm-layer-rules.md`.

Client-facing legal claims are governed by `docs/rules/obligation-basis.md`;
nothing legal may be stated anywhere in the product unless it appears
there with status `primary`. Odysseus's own regulatory position (AI Act,
electronic invoicing, the perimeter of legal advice, prospecting channel
rules) is `docs/rules/operator-obligations.md`. Prospecting is governed by
`docs/rules/prospect-qualification.md` (who may be scanned and contacted) and
`docs/rules/outreach-rules.md` (what may be said). Pricing and offer framing:
`docs/rules/offer-positioning.md`.

## Non-negotiable rules

1. **Deterministic scanners detect. The LLM explains, groups, prioritizes,
   and translates.** The model may never introduce a finding absent from
   its structured input. This single rule is the credibility of the whole
   business.
2. Every finding traces back to a scanner rule ID and an affected element.
3. All LLM output is validated with Zod. Any response referencing a
   finding ID not present in the input is rejected, logged, and retried.
   See `packages/core/src/types/llm-output.ts`.
4. The LLM never receives raw HTML or full page content. Normalized
   findings plus site context only.
5. Crawling is polite: respect robots.txt, identifiable user agent,
   delay between requests, hard per-page timeout. The
   delay is enforced between scanner passes on a page as well, not only
   between crawl requests.

   **Amended 2026-08-24.** A page cap used to be mandatory
   (`DEFAULT_MAX_PAGES` 20); it is now opt-in (`--max-pages`, `MAX_PAGES`)
   and off by default, after a real audit silently under-reported a site
   by more than a third. Politeness is otherwise unchanged. Do not
   silently reintroduce a default cap. Full incident and reasoning:
   `docs/decisions/trade-offs.md`, "Non-negotiable rule 5 amendment".
6. Never overstate legal exposure in any generated text. Accessibility
   obligations depend on company size and sector. State the criterion,
   not a verdict on whether a law applies to a given client. This is the
   "we report, we do not conclude" rule: reproduce the criteria, state
   the company's own registry data, describe where the case law stands
   including the current split between courts, and recommend confirming
   scope with a lawyer. Never state that a specific business is bound,
   never give a deadline, never state a sanction amount for that client,
   never present scope as settled. Binds report templates and the
   outreach LLM prompt equally. Full rule and legal basis:
   `docs/rules/obligation-basis.md` section 7 and `docs/rules/operator-obligations.md`
   section 2.

## Locked contracts, do not modify without asking

- `packages/core/src/types/findings.ts` — findings model v1
- `packages/core/src/normalize/severity.ts` — severity mapping
- `packages/core/src/types/llm-output.ts` — LLM schema and guards
  (`themeSchema.category` gained `'privacy'` on 2026-08-24, an approved
  change; see trade-off 31)

Every downstream layer reads these shapes. Changing them invalidates
stored audits and breaks monitoring diffs. If a change is genuinely
needed, say so and stop. Do not change them and continue.

## Known trade-offs, do not silently reverse

Full write-ups (root cause, alternatives tried and rejected, measured
effect) live in `docs/decisions/trade-offs.md`, same numbering. Each line
below is the one governing "do not X" imperative; read the linked entry
before touching the area it covers. A suffix such as `trade-offs.md#24`
means numbered entry 24, not a literal Markdown heading anchor.

1. Axe already covers WCAG 2.2 AA; Lighthouse's `accessibility` category
   is excluded to avoid duplicate findings, and `best-practices` has no
   home among the four locked `FindingCategory` values. Do not re-enable
   either category for finding emission without an argued change; add to
   `LIGHTHOUSE_EXCLUDED_AUDITS` only overlap confirmed against real
   output. → trade-offs.md#1
2. `prune-screenshots.ts`'s `selectPageDirsToKeep`/`pruneScreenshots` is
   the single implementation deciding which screenshots survive a scan.
   Do not reimplement selection logic elsewhere. → trade-offs.md#2
3. Dedupe (`computeDedupeKey`, cross-page) and
   `aggregateSamePageOccurrences` (same-page, fine groups only) are two
   separate passes with different keys. Do not merge them, and do not add
   selector normalization (stripping `:nth-child()` etc merges genuinely
   distinct elements). → trade-offs.md#3
4. Non-HTML resources are dropped by extension before enqueueing
   (`links.ts`), with a Content-Type fallback in `crawl.ts`. Never crawl
   binary resources as pages. → trade-offs.md#4
5. `persistAudit` upserts by `auditId` (a re-run is a retry);
   `persistAnalysis` inserts (a re-run is a distinct, legitimate
   document). Do not change either's semantics. → trade-offs.md#5
6. Two cost gates control LLM calls: a conservative audit fallback and a
   stricter prospecting-worthiness gate, both scoring on `SEVERITY_ORDER`
   over distinct findings. Do not remove either without revisiting
   `docs/rules/llm-layer-rules.md` section 10. → trade-offs.md#6
7. `structure-output-schema.ts`/`writing-output-schema.ts` are hand-
   mirrored Zod-v3 copies needed only because the SDK helper requires
   zod v4. Never treat them as the validation authority — the real Zod
   schemas' `.parse()` is what runs. Delete the mirrors only if `core`
   moves to zod v4. → trade-offs.md#7
8. Findings the LLM can't give good advice about (wrapper pages,
   noindex-legal pages) are diverted before the structure pass via
   `packages/llm/src/diversion.ts`'s `partitionFindings`, not explained
   away with a prompt instruction. `packages/report` must import that
   function, never duplicate the predicate. `legalRelevance` is built in
   code, never written by the model. → trade-offs.md#8
9. `packages/report`'s CSS is hand-maintained from the readable flat
   design sources in `docs/report/design/`, not Tailwind. Do not reintroduce a
   Tailwind build step without checking the existing design system first;
   derive tokens from source CSS, never invent them. → trade-offs.md#9
10. Render-diff/axe/Lighthouse run across `SCAN_CONCURRENCY` lanes; the
    crawl stays sequential; Lighthouse calls are serialized behind an
    in-process queue (confirmed `perf_hooks` collision). Do not remove
    that queue without re-confirming the collision is gone.
    → trade-offs.md#10
11. Legal content (Argument B) is a deterministic splice from
    `assessObligations()`, byte-identical-validated, never model prose.
    Do not revert to a "be careful" prompt instruction instead of
    withholding the pen. → trade-offs.md#11
12. Single-tier commercial model: no paid screening tier, flat full-audit
    price, free outreach preview instead. `ReportTier` is gone everywhere.
    The preview is not a lighter report tier — give it its own render
    path and its own RGPD article 14 disclosures. → trade-offs.md#12
13. Full audit price is EUR 1,600 HT (raised from EUR 300 HT
    2026-08-16), a pricing decision only, not a scope change. The Stripe
    link amount is updated by hand. → trade-offs.md#13
14. SEO/GEO checks use a new `geo` `FindingCategory` (purely additive),
    not folded under `seo`. Citability of factual statements is
    explicitly out of scope for a heuristic — that's an LLM-explains job,
    not a scanner check. → trade-offs.md#14
15. The business-impact reference-stat table
    (`packages/core/src/reference-stats/stats.ts`) is compiled TS, not
    JSON — it's edited content, not operator config. Only rows the
    research doc tags "safe to cite by name" are encoded; never add an
    aggregate market-size figure or an unverified year.
    → trade-offs.md#15
16. Reference-stat citation selection in the report is fully
    deterministic (`selectReferenceStats` called at render time), never a
    model choice. `Theme.category` has no `'geo'` option. Outreach
    (9c) must never import `@odysseus/core`'s stat table — stricter "no
    statistics" rule applies there. → trade-offs.md#16
17. No annex group in the PDF is ever forced onto one page with
    `break-inside: avoid`, regardless of finding count — only bounded
    per-row atomicity is safe. Do not reintroduce group-level atomicity
    without a real mechanism for bounding rendered height first.
    → trade-offs.md#17
18. Milestone 8.6 detections (security headers, AI-crawler robots check,
    structured-data validation, CrUX field data) all use `source:
    'custom'` into the existing dedupe/severity machinery. CrUX requires
    `globalThis.fetch` passed explicitly (library throws in Node
    otherwise). → trade-offs.md#18
19. The PDF glyph-splitting defect is Chromium print-to-PDF font hinting,
    fixed via `REPORT_PDF_CHROMIUM_ARGS` (`--font-render-hinting=none`)
    applied only to the report's own Chromium launch, not the scanner's.
    → trade-offs.md#19
20. Five report-template fixes from a full read-through (broken
    `--space-5` token, uncoloured Impact/Conformité, unfilled manual
    fields via `prefillAuditManualFields`, contradictory lab-vs-CrUX Core
    Web Vitals numbers, repeated annex URL lists). Do not reintroduce a
    `var(--space-*)` reference without a matching declaration —
    `spacing-tokens.test.ts` guards this. → trade-offs.md#20
21. Sector-targeted reference-stat research lives in
    `docs/research/sector-reference-stats/`, one file per sector. Only
    wire in rows with confirmed methodology; an absence of a scalable
    stat (e.g. hospitality accessibility-to-conversion) is the correct
    conservative answer, not a gap to paper over. → trade-offs.md#21
22. `estimateRevenueImpact` is wired only for `scales-down` citations with
    a Sirene-reliable turnover, applied exactly once against full
    turnover — never scaled by a measured gap, page count, or finding
    count. Result is floored to 2 significant figures. Do not relax
    `scales-down` eligibility to cover a context-only stat.
    → trade-offs.md#22
23. `computeBrokennessScore`/`isAuditFallbackEligible`/
    `isProspectingWorthy` are real as of 9b but `isAuditFallbackEligible`
    is still not wired into the pipeline — documented gap, not silently
    solved. Restaurants (56.10A) stay disabled in the NAF allowlist; do
    not enable by analogy to hotels without the same legal review.
    → trade-offs.md#23
24. Language variants of one page are collapsed into a single finding
    using the site's own hreflang declarations only (two gates:
    self-inclusion, one-URL-per-language) — never URL-prefix guessing.
    Clusters are computed once in `write-audit.ts` and stored on the
    manifest, not recomputed per consumer. → trade-offs.md#24
25. `FindingCategory` gained `privacy` (approved locked-contract change)
    covering both security-header and cookie/tracker concerns as one
    client-facing story. → trade-offs.md#25
26. Six 2026-08-24 detection checks (cookie/tracker consent, WCAG 1.4.10
    reflow, accessibility-statement presence, third-party origin
    inventory, NAP consistency, HTML structural validity via an
    `ALLOWED_RULES` allowlist that excludes all `wcag/*` rules to avoid
    axe duplication). NAP compares only phone/postal code, never street
    names. → trade-offs.md#26
27. The structure pass sees dense `x1..xN` alias finding IDs
    (`finding-alias.ts`), not real ones, so there are no numeric gaps for
    the model to "complete." Do not reintroduce a prompt instruction
    about ID gaps — there's nothing left to explain. → trade-offs.md#27
28. The LCEN identification obligation (article 1-1, I, 2, post-SREN) is
    spliced deterministically from `regimes.ts` via `renderLcenBlock`,
    never routed through `assessObligations()` (no scope test), and never
    renders a sanction amount. → trade-offs.md#28
29. Three client-visible copy fixes: the exec-summary "commercial not
    legal" note now reflects what `legalRelevance` actually knows;
    French guillemets use U+00A0 (guarded by
    `guillemet-spacing.test.ts`), never U+202F (missing-glyph risk in
    PDF). → trade-offs.md#29
30. Lighthouse resource audits (images etc) collapse to one site-wide
    finding via `FindingCandidate.dedupeIdentity` overriding selector
    identity — allowlist only audits whose items describe one action over
    a set of files; selector/URL-based identity was tried and measured
    worse. → trade-offs.md#30
31. `render-diff.ts` uses `load` + a bounded best-effort
    `networkidle` wait (`RENDER_SETTLE_TIMEOUT_MS`), never a hard
    `waitUntil: 'networkidle'` requirement — it can hang indefinitely on
    a real site. Language subtrees are recorded `discovered-not-scanned`,
    never silently dropped by a link filter. `hreflang-missing` must
    actually have an emitter, not just severity/copy — sweep periodically
    for other dressed-but-dead rule ids. The writing pass is guarded
    against stating legal consequences
    (`legal-consequence-guard.ts`). → trade-offs.md#31
32. A normalize-layer change that drops/reorders findings renumbers every
    later finding ID — any analysis generated against the old
    `findings.json` must be regenerated (`analyze
    --regenerate-structure`), never reused. Lighthouse's `document-title`
    SEO audit duplicates axe's own rule of the same name — keep it in
    `LIGHTHOUSE_EXCLUDED_AUDITS` and re-run
    `generate-reachable-rule-ids.mjs` after any such change. A generic
    `h1..h6 { break-after: avoid }` rule must not apply to
    `.remaining-category h5` — use the bounded `.remaining-category-head`
    wrapper instead. CWV metric tie-breaks return no metric on a genuine
    tie, never fall back to LCP by list order. → trade-offs.md#32
33. eTLD+1 comes from `tldts` with `allowPrivateDomains`, never from a
    hand-rolled parser and never from ICANN-only `tldts-icann`. A shared
    registrable domain means chain only when it is absent from
    `hotel-vendor-hosts.ts`; a vendor or federation host means independent
    hotels routed to review, decided by the curated list rather than by group
    size. Grouping counts the whole run before classifying any row, and only a
    domain held by exactly one establishment is ever an identity key.
    → trade-offs.md#33
34. Real-scan test fixtures under `fixtures/test-audits/` are committed with
    the client removed, built only by `scripts/deidentify-audit.mjs`. Never
    gitignore them (a green suite then describes data no other machine has),
    and never commit a real one as-is. Never hand-edit a fixture in place -
    rebuild it, so the script's read-back leak check and page-collision check
    both run. Real hostnames stay wherever they point at local gitignored
    `artifacts/` directories. The site-agnostic observed-rule inventory is
    rebuilt with `pnpm fixtures:rules`; it must never encode which audit
    emitted a rule. → trade-offs.md#34
35. The hotel prescan is a distinct path over shared scanner primitives:
    `prescanSite` never calls `runAuditStage`, `scanSite`, `scanPage`, or
    Lighthouse, and its artifacts live under a separate `prescans/` root.
    Metrics come from buffered `PerformanceObserver`s plus Playwright
    `response` events, never Resource Timing; every metric is approximate on
    a real site (measured: request counts, bytes, CLS, blocking time and LCP
    all drift between runs, while axe facts do not), so scoring bands metrics
    and never treats one as exact. Captured evidence bytes are approximate for
    the same reason (amended 2026-08-29): assert that two runs select the same
    failure and that each ref matches its own hash, never that they produce
    identical pixels. Page roles order on
    path depth before lexicographic, so a translated subtree never displaces the
    page it translates. A prescan is inserted, never upserted, and emits no
    `prospects` event - that collection is the AFNIC funnel's, and the Atout
    France export carries no SIREN column (a hotel's own site often publishes
    one; see trade-off 41). → trade-offs.md#35
36. Hotel outreach evidence is a strict contract over two logical assets - a
    raw/rendered composite and a measured failure crop - plus three to five
    allowlisted summaries. Its schema has no place for selectors, exact URLs,
    rule or finding IDs, free prose, legal conclusions, or statistics. Do not
    widen the contract to expose scanner output. **Amended 2026-08-28 (evidence
    schema v2, prescan v3):** `complete` requires the measured failure crop and
    three summaries; the composite is a bonus, because a server-rendered site
    cannot produce one and the old rule discarded 17 of 25 real hotels that had
    real photographed failures. Do not re-require the composite, and do not
    lower the 20 percent render-gap threshold that governs when one is made.
    → trade-offs.md#36
37. A redirect off the declared domain is classified by counting
    establishments at the target, never by comparing domain names: a target
    several establishments reach or declare is a chain, one exactly one
    establishment holds is that hotel's own and is adopted and re-checked. The
    count spans the whole catalogue, redirect rows plus declared owners, or an
    acquisition reads as a rename. Reconciliation writes a complete new
    generation - one row out per row in - because `listCandidatesToPrescan`
    filters on the qualification version. → trade-offs.md#37
38. Hotel outreach scores are insert-only and versioned, and the selected
    cohort is its own insert-only generation, never a field written back onto
    a score. Worthiness over a prescan is a separate pure predicate
    (`isHotelOutreachWorthy`); do not reuse or edit the shipped cost gates,
    which read `Finding`s a prescan never produces. A missing fact scores zero
    and records an `unknown` reason, never a false, and metrics are banded.
    Weights are approved per version and are never edited in place - broadening
    what a weight reads is a new version. → trade-offs.md#38

39. Hotel role contacts are discovered for the selected cohort only, never for
    the qualified population, and a hotel with no usable address parks with one
    of four typed reasons rather than a null. `discoverRoleContact` is the one
    implementation, which `extractContactAddress` now adapts; it can only ever
    return an allowlisted local part, so a named address is never captured at
    all. The allowlist is ordered and widening it is a new `contactVersion`,
    never an in-place edit. MX is read as a fact about the domain: no SMTP
    probing, no catch-all classification, and a resolver failure is `unknown`,
    never `no-mx`. Suppression is checked before the fetch and again before the
    write. → trade-offs.md#39

40. Every derived document carries a `findingsProvenance` stamp (findings
    schema version, normalization fingerprint, findings digest) and fails
    closed: an analysis, report or artifact carrying none is refused, never
    trusted for being old. `packages/core/src/normalize/findings-provenance.ts`
    is the one place that computes or compares one. Five legal-copy rules bind
    the paid report: no client-specific criteria verdict, no exemption filing
    route, no client-specific sanction figure, no superseded LCEN article 6-III,
    and accessibility-statement publication conditioned on an independently
    established Article 47 regime. `scripts/deidentify-audit.mjs` derives a
    fixture's provenance rather than copying the source's, and the Lighthouse
    failure line names a translated cause, never the tool's own message.
    → trade-offs.md#40

41. The Sirene join runs in the qualification pass, not identity resolution: the
    SIREN comes from the hotel's own published identification, which only the
    site probe has read, so asking earlier could only ever answer
    `no-identifier` (measured: it did, for all 13,301 candidates, while 3,482
    had an identifier on their qualification row). The join is written onto the
    qualification generation and never back onto the candidate, qualification
    is now `v3`, and scoring reads `effectifBandCode` from there. Do not call
    the joiner with `undefined`, and do not read `stock-file-unavailable` as a
    fact about a hotel. `hotel-outreach-v1` is unchanged - its `effectif`
    weight always read this field and was merely starved of input. Amended
    2026-08-29: apply the stock file with `backfillSirene`, which contacts
    nobody, never by re-running `qualifyHotels`, which would re-probe 13,301
    live sites to attach data already stored on every row. It re-decides only
    rows whose join returned a band, recovers `domainAdoptedAfterRedirect` from
    the stored notes when it does, refuses to run without the stock file, and
    takes no `--limit` because a partial generation is never correct.
    → trade-offs.md#41

42. The outreach preview is a separate document kind, never a tier of the paid
    report: its input contract (`packages/core/src/types/outreach-preview.ts`)
    shares no type with `GenerateReportInput`, and strict objects plus closed
    vocabularies are what reject finding IDs, selectors, exact URLs and
    statistics - do not spread a report input into a preview input, and do not
    widen the schema to admit one. The offer price is
    `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT` in `core`, never an input field; images
    are PNG only; argument B is enabled for hotels as a general reading, behind
    `OutreachSourceCapabilities`. The renderer lints its own output and throws.
    → trade-offs.md#42

44. A paid deliverable is the exact current French and English report pair:
    render identity is created before PDF generation, approval is insert-only
    over both verified digests, previews require freshness, and delivery also
    requires the matching current approval. Keep one PDF per language with the
    technical appendix last; priorities use contiguous display ranks,
    deterministic remediation, and ownership context without changing raw
    severity or the locked LLM schema. Numeric effort estimates and Lighthouse
    successor-family dedupe remain deferred until their recorded triggers.
    → trade-offs.md#44

55. WCAG-citation and business-claim guards run in the writing pass's retry
    loop (measured promotion, zero false positives over stored analyses), and
    an always-on shadow reviewer returns evidence-bound prose verdicts without
    ever blocking; it is not promotable to a gate on the current medium model,
    which flags required generic commercial consequences as unsupported.
    → trade-offs.md#55

Node 22, TypeScript strict, pnpm workspace, ESM.
Playwright (Chromium), `@axe-core/playwright`, Lighthouse as a Node
module, Mongoose 9, Zod, Commander, Vitest, pino, `@mistralai/mistralai`.

No Redis, no BullMQ, no Express API, no Next.js dashboard, no public web
interface to the audit engine itself. Those are later phases and are
deliberately not being built.

**Amended 2026-08-31, plan 016.** The single-user operator dashboard is now
served from a hosted EU VPS at `app.odysseusaudit.com`, behind Caddy and a
built-in password session (`packages/interface` auth). It stays a private
single-user interface and gains no public client surface; previews remain
hash-token gated on the standalone site. Decision and rejected
alternatives: trade-offs.md#60. `packages/site` (added 2026-08-07) is not
an exception to this: it is a standalone Next.js marketing/bot-info site
with no access to the queue, the database, or any other package, not a
public front end for the tool.

PDF generation uses Playwright's Chromium, not Puppeteer. One browser
dependency, not two.

Lighthouse cannot accept a Playwright `Page`. Launch Chromium with a
remote debugging port and pass that port to Lighthouse, reusing the same
browser instance used for rendering and the axe pass. Playwright makes
at most two explicit loads per page (once raw, once rendered). Lighthouse
adds its own internal navigation on top of that when run in navigation
mode. That extra load is unavoidable and required to produce trace based
Core Web Vitals (LCP, CLS, INP). Snapshot mode was considered and
rejected because it cannot produce those metrics.

## Packages

- `core` — locked contracts plus pure normalization. No I/O, no database
  driver. This package is defined by the contracts it holds; keep live
  infrastructure out of it.
- `scanner` — owns the Chromium lifecycle, render diff, crawler, axe,
  Lighthouse, config, and the artifacts layout.
- `store` — Mongoose models and connection handling. Nothing else.
- `llm` — the only package that talks to the Mistral API. Peer of
  scanner, not a consumer: it depends on `core` and nothing else in the
  workspace.
- `report` — renders a stored analysis and the findings appendix into a
  branded, bilingual PDF via Playwright's Chromium, reusing `scanner`'s
  browser lifecycle rather than adding Puppeteer as a second dependency.
- `interface` — runs the job queue and a small private HTTP server that
  serves the single-user dashboard. The only package that binds a
  network port.
- `cli` — Commander entry points, thin. Real logic lives in the packages
  above.
- `site` — the public marketing site and bot-information page at
  odysseusaudit.com, added 2026-08-07. A standalone Next.js app deployed
  separately to Vercel, not part of the `tsc -b` build graph the other
  packages share, and does not import from and is not imported by any of
  them. Exists so `ODYSSEUS_USER_AGENT` points at a domain that actually
  resolves, per the crawling-politeness rule.

Eight packages for a tool one person runs is close to the ceiling. If a
ninth is proposed, check that its one-sentence description does not
overlap an existing package before agreeing.

## Artifacts layout

```
artifacts/<hostname>/<ISO-8601-UTC-timestamp>/
  manifest.json
  findings.json
  pages/<slug>-<6-char-url-hash>/
    raw.png
    rendered.png
    scan.json
  analyses/<ISO-timestamp>-<language>.json
```

One `analyses/` file per run rather than one per audit, since multiple
analyses per audit are expected and must not overwrite each other.

Screenshot references are relative to the audit directory, never absolute
paths, so stored findings survive the artifacts root moving or the
database being read from another machine. The manifest and the `audits`
collection share one type, which is what lets `normalize <dir>` re-run
offline against any artifacts folder with no database attached.

Tool versions in the manifest are self-reported by the tools themselves
(`testEngine.version`, `lighthouseVersion`) rather than read from
installed `package.json` files, so they record what actually ran. Not
retrofittable onto stored audits, and the monitoring tier depends on them
to tell a real regression from a scanner upgrade.

## Scope discipline

This is a command-line tool. Do not scaffold an API, a queue, a UI, or a
public-facing scanner unless explicitly asked. Do not add dependencies
without asking first. Prefer standard library and existing dependencies.

When a task is ambiguous, ask rather than assuming. Inventing structure
is worse than pausing.

## Session log

Keep `docs/session/current-session.md` current for the whole of every
repository-work session. It is gitignored and deliberately ephemeral. Start
new logs from `docs/agents/session-template.md`; conversational questions that
do not inspect or change the repository do not need one.

Read it first, before anything else, at the start of a session. If it
exists, a previous session did not finish: reconstruct from it rather
than from the working tree alone.

Write to it continuously, not at the end:

- the session's plan and a checklist, before starting work;
- tick each item the moment it is actually done, not when it is planned;
- any finding worth keeping, at the moment it is found, including
  negative results and things checked and ruled out;
- for anything reconstructed after a crash, record what the evidence for
  it was, so the next reader can tell a verified state from a guessed one.

At the end of a session, fold what is durable into CLAUDE.md, the brief,
or the relevant `docs/` file. Delete the session file only when the working
tree no longer needs its provenance, normally because the coherent work was
committed or explicitly discarded. If implementation is complete but remains
uncommitted, set status `ready-for-commit` and leave the log in place. Nothing
durable should survive only there; the file's presence means the next agent
must reconcile it before starting new work.

The reason is recovery, not bookkeeping: a crashed session leaves a large
uncommitted working tree and no account of which items in it are finished,
which are half-done, and which were deliberately deferred. That state is
expensive to re-derive and easy to re-derive wrongly.

## Pausing before the usage limit

When usage approaches its limit (around 99 percent), stop and park the work
deliberately rather than being cut off mid-change. Being interrupted at an
arbitrary point is what produced the crashed session this file's session-log
rule already exists to recover from, and a large half-applied refactor is the
most expensive thing to hand to the next session.

On approaching the limit:

- do not start anything new: no new milestone, no multi-file refactor, no
  fresh scan, no long measurement run;
- bring the working tree to a state that builds and typechecks, even if that
  means finishing one edit or reverting one;
- update `docs/session/current-session.md` so it states exactly what is done,
  what is in flight, and what the next concrete step is;
- commit what is coherent when the user or active workflow authorizes a
  commit; otherwise mark the log `ready-for-commit` and say plainly what is
  left uncommitted and why;
- then stop and report, rather than beginning another unit of work.

Resume from the session log after the usage resets, not from the working tree
alone. The point is that the stopping point is chosen, not accidental.

## Testing

Run against `fixtures/spa-demo`, a local client-rendered React app with
deliberately seeded faults. Vitest for unit tests, with scanner output
fixtures committed so tests do not require a browser.

**Live-site authorization, amended 2026-08-27.** The per-named-site
permission this section used to require is withdrawn. It was asked and
re-asked for every batch of a campaign whose whole point is checking
thousands of declared hotel domains, which made it a prompt to click
through rather than a decision anyone was actually taking.

Read-only, no-browser prospecting checks (DNS, TLS, bounded HTTP) against
a domain a catalogue already declares are standing-authorized, subject to
non-negotiable rule 5, which is unchanged and is what actually protects
the site being checked: robots.txt honoured, identifiable user agent,
delay between requests, hard timeout. Every such batch still runs bounded,
with `--dry-run`, an explicit `--limit`, and a checkpoint.

A *browser* audit of a live third-party site is still a deliberate act,
not a background habit: prefer the fixture, and run Chromium against a
real site when there is a reason to, not by default.

The fixture is two pages and cannot exercise everything. Both bugs found
after Milestone 4 (attachment URLs crawled as pages, positional selectors
defeating dedupe) passed the entire test suite and were visible only in a
real-site scan. Saved artifacts under `artifacts/sas-fernande.fr/` are
real-site reference data; `normalize <dir>` re-runs against them offline
without touching the site.

Tests never call the live Mistral API. The LLM package is tested with
a stubbed client, including the path where retries are exhausted and the
call throws rather than returning a partial analysis. Live verification
is a manual step, and for anything client-facing it means reading the
output as the client would, not just checking that it validated.

**Analysis and PDF authorization, amended 2026-08-27.** Generating or
regenerating an analysis from a saved audit is standing-authorized. The
structured `manifest.json` and normalized `findings.json` may be sent to the
configured Mistral API, and French and English PDFs may be rendered from the
validated stored analyses, without asking for permission each time. This does
not authorize sending raw HTML, page bodies, or screenshots to the model, and
it does not authorize a new live browser scan. Mistral analysis cost is
negligible for this workflow and is not a separate approval gate; still avoid
gratuitous regeneration and preserve the existing cost gates and provenance.

Any fixture dev server started during a session must be stopped before the
session ends. Verify it is stopped with `pgrep` before reporting
completion.

### Real-scan fixtures go stale silently. Refresh them and let a test catch it.

Discovered 2026-08-25: the whole suite was green while
`artifacts/sas-fernande.fr/2026-08-02T17-31-56Z` still reported 78 findings,
months after normalization changes had taken it to 42. `artifacts/` is
gitignored, so nothing versioned these directories, and nothing checked
whether the code that produced them was still the code in the tree. Every
test asserting "78 findings, 61 minor" was describing a pipeline that no
longer existed, and would have handed the next person eight unexplained
failures with no way to tell a real regression from accumulated staleness.

`fixtures/audits.json` is now the single curated list of real-scan
directories the test suite depends on, each with a one-line reason it is
kept - curated, not accumulated, since the list had grown to thirteen
directories with three timestamps for one site and no record of why. Run
`pnpm fixtures:refresh` after any change under `packages/core/src/normalize`
to re-derive every one of them with `normalize <dir>` and stamp each with a
fingerprint of the normalization source that produced it
(`scripts/fixture-fingerprint.mjs`). `fixture-freshness.test.ts` fails the
build the moment a listed fixture's stamp does not match the code in the
tree, so staleness is a red test, not a silent fact discovered by reading
`git log` months later.

Two more tests turn "the report is accurate" from a stated goal into a
measured one, and are worth keeping distinct (`rule-coverage.test.ts`'s own
header comment states this in full): **recall** - the scanner finding a real
issue at all - is bounded by what automated detection can reach, documented
at roughly 30 to 40 percent of WCAG criteria, and no fixture work moves that
number. **Precision** - every finding the report prints being real, correctly
described, and singly counted - is the property actually holding a client
relationship, and is the one held to a near-perfect bar.

- `rule-coverage.test.ts`'s recall ratchet fails when fewer of the tool's
  emittable rules are exercised by any curated fixture than were measured
  last time. A rule with a severity mapping, remediation copy, and report
  wiring but no fixture behind it has never been observed firing - which is
  exactly how `hreflang-missing` (trade-off 31), the LCEN regime
  (trade-off 28), and both cost gates (trade-off 23) went unnoticed for
  months. Raise the floor when coverage improves; never lower it to make a
  red build green.
- The same file's single-rule concentration check is a precision smell: no
  rule may account for more than 30 percent of one audit's findings. It has
  now caught the same underlying defect three times under three different
  names - trade-off 31 (219 of 282 Lagnonu findings in five rules),
  trade-off 30 (102 of 305 haaitza findings in two Lighthouse image audits),
  trade-off 24 (182 of 265 language variants of one page) - and each time
  the cause was the same: the wrong identity chosen for a defect, so one
  instruction printed dozens of times. A rule can legitimately sit above the
  line (`image-alt` on a picture-heavy site, where each image is genuinely a
  separate editorial decision); the threshold exists to make crossing it a
  question asked, not a pattern that ships unnoticed a fourth time.

## Claude Code MCP servers

Start Claude Code sessions in this repo with `codysseus` (alias for
`./scripts/dev.sh`), not a bare `claude`, so `.env` is sourced and the
MCP servers below authenticate correctly.

This launch instruction is Claude Code-specific. Codex, ZCode, and future
agents use the tools exposed by their own host session; they must not assume
these MCP servers are loaded merely because `.mcp.json` exists. The same
data-access and live-navigation approval boundaries still apply whenever
equivalent tools are available. ZCode has no wrapper equivalent to
`codysseus`; where a command needs credentials, source `.env` at the point of
use (`set -a; . ./.env; set +a`), the same pattern Codex already uses.

Three MCP servers are available during development:

- **context7** — current documentation for any library in the stack.
- **mongodb-readonly** — a read-only view into the Atlas cluster, through
  a dedicated read-only database user separate from the app's own
  pro_db_user, for inspecting real findings and audit data while
  debugging.
- **playwright** — a separate Playwright instance for ad hoc, local page
  inspection during development: the dashboard UI, the spa-demo fixture,
  or a real page while writing a milestone 8 custom check. Not wired
  into the scanner package's own Playwright dependency.

Both mongodb-readonly and playwright are set to ask before every call,
not auto-allow. mongodb-readonly can read real audit and prospect data;
playwright can navigate to arbitrary URLs, including live client or
prospect sites. Each call is approved before it runs.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `heywowyou/Odysseus`, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`) map 1:1 to identically-named labels on the
repo. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: a root `CONTEXT-MAP.md` will point to a `CONTEXT.md` per
package under `packages/<name>/`, created lazily as `/domain-modeling`
resolves real terms and decisions, not scaffolded upfront. See
`docs/agents/domain.md`.

## Skill Usage Policy

Installed via the `skills` CLI (`npx skills@latest list` to check the
current set). Like the MCP policy above, these fire on the trigger
condition stated, not on vague "use when helpful" judgment.

This is a repository capability catalog, not proof that every host loaded
every skill. Use a listed skill when it is available in the active agent; if
it is unavailable, state that briefly and follow the underlying repository
documents and guardrails directly.

- **ask-matt** — the user is unsure which of these skills fits their
  situation; use it to route rather than guessing.
- **grill-with-docs** — sharpening a plan or design through interview
  before committing to it, when the result should also produce an ADR or
  glossary entry. Delegates the interview itself to `grilling` and the
  write-down to `domain-modeling`.
- **grilling** — the user wants their thinking on a plan, decision, or
  idea stress-tested, or uses a "grill" trigger phrase; also invoked by
  `grill-with-docs` and by `improve-codebase-architecture`'s step 3
  (walking a chosen deepening candidate to an interface). Unlike
  `grill-with-docs`, model-invokable directly, no explicit `/` command
  required.
- **triage** — working an issue or external PR through the
  needs-triage/needs-info/ready-for-agent/ready-for-human/wontfix state
  machine on `heywowyou/Odysseus`.
- **improve-codebase-architecture** — asked to survey this codebase for
  deepening opportunities and want a visual HTML report to pick from
  before grilling into one.
- **to-spec** — the current conversation has already converged on a design
  and just needs synthesizing into a spec published to GitHub Issues, with
  no further interview.
- **to-tickets** — breaking an agreed plan or spec into tracer-bullet
  tickets with explicit blocking edges, published to GitHub Issues.
- **implement** — implementing a piece of work that already has a spec or
  ticket behind it.
- **wayfinder** — planning work too large for one session as a map of
  decision tickets on GitHub Issues, or resolving the next open ticket in
  an existing map.
- **prototype** — the user wants to sanity-check a state model, logic
  shape, or UI look before committing, and the result is meant to be
  thrown away.
- **diagnosing-bugs** — the user says "diagnose" or "debug this", or
  reports something broken, throwing, failing, or slow, with more than one
  plausible cause (overlaps the sequential-thinking trigger above for that
  case).
- **research** — a topic needs investigating against primary sources and
  the findings written to a Markdown file, matching this repo's existing
  `docs/research/` pattern.
- **tdd** — building a feature or fixing a bug test-first, reinforcing this
  repo's own "write tests with fixtures" testing discipline.
- **domain-modeling** — discussing codebase terminology, or writing/editing
  a `CONTEXT.md` or ADR under the multi-context layout above.
- **codebase-design** — designing or improving a module's interface,
  deciding where a seam goes, or making code more testable — most relevant
  to `core`'s locked-contract boundaries.
- **resolving-merge-conflicts** — an in-progress git merge or rebase has
  conflicts to resolve.
- **improve** (shadcn) — asked to audit the codebase read-only and produce
  prioritized, self-contained plans for another agent to execute later;
  never implements anything itself, unlike `improve-codebase-architecture`
  which grills interactively toward one chosen change.
- **find-skills** (vercel-labs) — the user asks "is there a skill for X" or
  wants a capability none of the skills above cover; verify install count
  and source reputation before recommending one, and read its full
  generated output before treating it as authoritative.

## Style

- `docs/agents/coding-conventions.md` is the complete shared coding and writing
  system. Prettier owns layout; ESLint owns static code-quality rules;
  TypeScript and tests own types and behavior.
- TypeScript strict, no `any`, explicit return types on exported functions.
- Plain language in every user-facing string. No jargon, no acronyms
  without expansion on first use.
- All user-facing strings must support French and English from the start.
  Structure them accordingly, do not hardcode English and retrofit.
- No em dashes or en dashes in generated text, code comments, or report
  copy.
- Comments explain why, not what.
- Explain any problem or decision to the operator in plain language before
  naming a mechanism. Say what we were trying to do, what went wrong, and why
  it matters, in ordinary words, with an analogy where one helps. File names,
  identifiers and thresholds come after the point is made, not instead of it.
  When the operator must choose, follow the explanation with a short options
  table giving each option's cost and effect, a recommendation, and the reason
  the rejected options are worse. Several decisions here are contract or legal
  changes that are expensive to reverse, and a choice made without
  understanding is approval on trust.
- Run `pnpm run format` after maintained-source edits and `pnpm run check`
  before handoff. Record affected tests and any manual review separately.

## Build order

Milestones 0 through 8 are complete, as are milestones 8.5a, 8.5b, 8.5c,
9a, 9b, and 9b.5. Milestone 9c is next. Work in vertical slices, one
milestone per session.

Separate maintenance queues exist in `docs/report/report-feedback-deferred-items.md`
(report work with a current reproduction or an explicit future trigger) and in
GitHub issues (the intake for newly verified defects, per
`docs/agents/issue-tracker.md`). They do not silently become
the active milestone: verify their entries against current HEAD and act on
them only when the user selects that maintenance scope or a blocking issue
must be resolved first.

1. Render diff only, CLI invocable — done
2. Crawler: internal link discovery, robots.txt, depth and page caps — done
3. Scanners: axe-core and Lighthouse against one shared Chromium instance — done
4. Normalize and dedupe into MongoDB — done
5. LLM prioritization layer with schema validation — done
6. PDF report generation, bilingual — done
7. Interface: queue and a private single-user dashboard (`odysseus serve`) — done
8. Custom checks: meta/canonical/JSON-LD/sitemap/hreflang/heading-hierarchy plus the extended accessibility pass (keyboard traps, focus order, form error handling, video captions, alt-text heuristic) — done
8.5a. Deterministic SEO/GEO detection checks, new `geo` finding category — done 2026-08-16, detection only. See trade-off 14.
8.5b. Reference-stat table, sector detection, revenue calculator (`packages/core/src/reference-stats/`) — done 2026-08-16, data/pure functions only. See trade-off 15.
8.5c. Reference-stat table wired into the report (per-theme/geo citations, `geo` in `CATEGORY_ORDER`) — done 2026-08-17, report-only. See trade-off 16.
8.6. Security headers, AI-crawler robots check, structured-data validation, CrUX field data — done 2026-08-22, detection only. See trade-off 18.
9a. Prospect acquisition and qualification — done 2026-08-16.
9b. Prospecting throughput (worker pool, `skipLighthouse`, raised page/depth caps) — done 2026-08-22. See trade-off 23.
9b.5. Sitemap-supplemented full-site scan coverage — done 2026-08-27. Recursive sitemap inspection stays separate from link reachability; full audits supplement eligible sitemap-only pages, while prospecting inspects and standalone crawl remains link-only. See the measured Haaitza validation in `docs/decisions/trade-offs.md`, "Build order milestone notes", 9b.5.
9c. Hotel prospecting and outreach, planned as numbered vertical slices whose
order, status, and dependencies are owned by `plans/README.md`. Durable
decisions from the completed slices: plan 005's corrected crop was
accepted on a separately authorized live rerun, closing its evidence gate, and
the `redirect-offsite` defect that gate surfaced is fixed as qualification v2
(trade-off 37), taking the qualified population from 5,720 to 5,995. Scoring
ships as immutable versioned scores with an approved
`hotel-outreach-v1` weight table and a separate cohort generation
(trade-off 38). Role contacts cover the
selected cohort only, with four typed absences instead of a null and an ordered
local-part allowlist (trade-off 39). The
outreach preview renders as a self-contained HTML document from its own narrow
contract, with the offer price as a code-owned constant (trade-off 42). Previews
publish to a private bucket behind an
opaque token, the public site serves them by hashing the token the visitor
brings, and the prospecting privacy, opt-out and offer pages exist with `/bot`
corrected (trade-off 43); that deployment step is complete, recorded in
trade-off 43,
"Provisioned and verified, 2026-08-29". Reconciliation
decisions and remaining verification gaps are recorded in
`docs/decisions/trade-offs.md`, "Build order milestone notes", 9c.

Full milestone list, including the phases beyond 8, is in the brief,
section 7.

Do not start a milestone before the previous one has tests passing, and
do not consider a milestone finished until its output has been checked
against a real site rather than the fixture alone.
