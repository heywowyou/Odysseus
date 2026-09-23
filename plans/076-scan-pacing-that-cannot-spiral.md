# Plan 076: Keep full-audit pacing tied to the audited host's real pushback

Status: IN PROGRESS (2026-09-23). Priority P1. Effort L. Depends on: none. Before live acceptance, deploy the three pacing commits already on `main` (2b8b71d8, 7c9c42fa, 207b7c66) together with this implementation. Revisits trade-off 99 ("pressure moves one way"). Coordinates with plan 075, which shares the challenge markers.

## Context

A full audit of haaitza.com took 2 h 35 min on 2026-09-15 at a 10 s delay. The 2026-09-22 rescan, at the same 10 s delay with 3 lanes, is heading for about 20 h. La Corniche's 2026-09-22 full audits never got past discovery. Each fix so far has addressed one false signal after it had already cost a scan. This plan removes the mechanism behind them.

### Evidence (production, read-only, 2026-09-23 05:10 UTC)

| Fact | Source |
|---|---|
| The Haaitza job (created 2026-09-22 22:25 UTC) was launched at `crawlDelayMs` 10000 and `scanConcurrency` 3. | `audit-scope.json` of `/data/artifacts/haaitza.com/2026-09-22T22-25-52Z` |
| It recorded 12 pushback events. **10 are `crawl/rate-limit/429` on `/social/instagram`** (fr, en, it, pt-pt, es), all Instagram's answer to an off-site redirect. The other 2 are one real `503` on `/le-bar-haaitza`, counted twice (origin-transient and bot-challenge). | `jobs.progress.pushbackEvents` |
| Doubling on every event reaches the 60 s cap after the third event (22:33 UTC). Concurrency falls to 1. Nothing brings either back. | `host-request-scheduler.ts` `noteRateLimited` |
| The discovery pass took 1 h 40 min for 206 pages. Content scan: 36 of 139 pages after 3 h, about 5 min per page. The dashboard shows a 1.3 h content ETA. | job progress; `scan.json` mtimes |
| The container started 2026-09-22 20:03 UTC, so the off-site-redirect fix (2b8b71d8, 22:24 UTC) is not deployed. The events carry no `delayMs`, which confirms the older code. | `docker inspect`; event shape |
| Since 570f340c (2026-09-22), `/datadome/i` anywhere in a page's DOM counts as a bot wall. La Corniche loads DataDome's script on normal pages (146 of the stored 2026-09-17 pages contain it; 1,492 `captcha-delivery.com` requests in their Lighthouse data). The crawl then retries each page, records two pushbacks, and marks it `blocked`, so no links are followed (`crawl.ts` `detectChallenge`, then `status: 'blocked'`). The homepage itself is blocked, which ends discovery. | stored scans; code |
| The same polluted marker makes core's `isBlockedRender` treat every such page as an acquisition failure. A La Corniche scan run on today's code would report almost nothing, even if it finished. | `packages/core/src/normalize/normalize-renderdiff.ts` |
| Other false pushback sources in code: any 5xx on the raw render (`render-diff.ts` `noteResponsePushback`); any rendered interstitial marker, including `meta-refresh` and "security check" text on a normal page; a challenge marker inside **any third-party iframe** (`scan-page.ts` after `observeFrames`). | code |
| Every content page costs about 5 paced slots: crawl, raw render, rendered navigation, mobile surface, consent surface, plus sampled Lighthouse and canonical fetches. The stage ETA times work *inside* the scheduled turn (issue #223), so it leaves out the pacing wait that dominates at high delay. | `scan-site.ts`, `queue/eta.ts`, `report-progress.ts` |
| Mobile and consent surface results never become client findings. They feed diagnostics (`evidence-graph.ts`), delta comparability (`core/delta/coverage-comparability.ts`) and surface link discovery. | grep of consumers |

### Why this stops the whack-a-mole

Today any false signal is **permanent**, and every detector can raise one. The plan makes three structural changes:

1. A false signal has a bounded cost, because the delay recovers.
2. Only one classifier decides what counts as pushback or a wall, and it is shared by the scanner and normalization.
3. That classifier is gated by a labelled corpus built from real stored scans, so a new false positive fails a test instead of a live scan.

## Target outcomes (acceptance numbers)

- Haaitza full audit, uncapped, 10 s delay, finishes in **≤ 3 h 30 min** (the 2026-09-15 baseline was 2 h 35 min with fewer passes).
- La Corniche full audit reaches content scan with **≥ 150 visited content pages** (the 2026-09-17 run had 201), in ≤ 4 h. Its real WAF pages stay excluded as acquisition failures.
- A single real pushback event raises pacing for a bounded window. **Worst-case extra time from one false event is ≤ 10 min.**
- At every point after discovery, the dashboard ETA is within ±35% of the actual remaining time on the two acceptance runs.

## Local implementation checkpoint (2026-09-23)

Slices 1–4 are implemented and locally verified. The follow-up also persists
raw visible-text length so report evidence uses the same barrier decision as
normalization. `pnpm run check` passes. The full suite reported 5,552 passing
and 245 skipped tests; four implementation failures were fixed and passed in
focused runs, and the two suite-load timeouts passed in isolation. The full
suite was not rerun after those fixes. `pnpm fixtures:refresh` could not run
because none of its 15 listed real-audit directories are present locally; the
saved La Corniche normalization checkpoint is recorded in the handoff.

The latest read-only VPS check reported build `093fca00`, which predates the
076 implementation. The operator deferred the two uncapped acceptance audits
to a later time. Do not start them in this work session, and do not mark this
plan DONE or archive it until both full runs complete and their acceptance
data is recorded.

## Slices

Each slice gets its own commit(s), a typecheck and its own tests (see memory: focused tests per slice). Full `pnpm run check` and `pnpm run test:all` run once before push.

### Slice 1: labelled wall/pushback corpus and one shared classifier (fixes 1 and 4; de-risk first)

This slice is sequenced first because every other fix depends on getting the "is this the host pushing back" answer right.

1. **Corpus builder script** `scripts/build-pushback-corpus.ts`. It reads local `artifacts/*/*/pages/*/scan.json` (and `manifest.json` page status) and emits a de-identified corpus. The corpus holds one row per page with: `httpStatus`, `renderedHttpStatus`, `renderedTitle` (hashed unless it matches a challenge title), `rawTextLength`, `renderedTextLength`, `rawDocument.markupLength`, stored marker names, vendor-host presence flags (`captcha-delivery`, `datadome`, `o2swit.ch`, `challenge-platform`) derived from Lighthouse network requests and axe node HTML, frame origins with challenge markers, and the landed-host-is-audited flag. No URLs, text or HTML are kept. Output: `fixtures/pushback-corpus/corpus.json`, rebuilt only through this script (repo rule: real-scan fixtures are de-identified and script-built).
2. **Labels**: `fixtures/pushback-corpus/labels.json` with site-level expectations taken from the evidence:
   - grand-hotel-opera: the 128 stored `429` pages are walls.
   - lacoorniche 2026-09-17: the 10 "Test de sécurité" pages are walls; every other 200 page with substantive text is content, **including the DataDome-script pages**.
   - haaitza 2026-09-15: the o2switch Tiger pages are walls; the rest are content.
   - All other stored audits: 200 pages with rendered text ≥ 500 chars are content.

   The builder prints any page the labels don't cover, so the operator can confirm edge cases before they're frozen.

**Corpus checkpoint (2026-09-23, local stored artifacts):** the builder emitted 2,356 de-identified page rows from 25 audits; 2,256 rows are labeled and 100 remain uncovered. For the three named runs, Opera has 128 walls / 25 content / 23 unlabeled pages; La Corniche has 10 walls / 173 content / 18 unlabeled pages; Haaitza has 4 walls / 194 content / 8 unlabeled pages. The stored Opera run contains 128 HTTP 429 pages, not the plan's earlier 127, and those pages have no stored vendor marker; the classifier therefore treats HTTP 429 itself as a rate-limit document wall. One Haaitza page with an o2switch marker has 2,679 visible characters and no stored raw-markup length, so the marker does not make that substantive page a wall. This is the only label adjustment: the four sparse o2switch barrier pages are walls, and that substantive page remains content. Uncovered rows remain unlabeled. A privacy test checks that the fixture contains no URLs or markup and that ordinary titles are stored only as hashes.

3. **One pure classifier in core**: `packages/core/src/acquisition/host-signal.ts`, exported from `@odysseus/core`.
   - `classifyDocumentWall({ status, title, markupLength, visibleTextLength, markers })` returns `'content' | 'wall'` plus a reason. A page is a wall only if the document **is** the barrier:
     - it has a challenge title (`isChallengeTitle`); or
     - it has a vendor challenge marker **and** (status is 403, 429 or 503, **or** visible text < 500 chars, **or** markup ≤ `MINIMAL_RAW_MARKUP_LENGTH`); or
     - it has `meta-refresh` and markup ≤ `MINIMAL_RAW_MARKUP_LENGTH` (already the raw rule).
   - The vendor marker table moves here from `scanner/raw-document-signals.ts` and `core/normalize-renderdiff.ts` `CHALLENGE_MARKER_PATTERNS`. **Bare `/datadome/i` is removed.** DataDome's wall is matched by its captcha document (`geo.captcha-delivery.com` / `ct.captcha-delivery.com` iframe in a small document), not by its script tag. "security check" text counts only together with a wall-shape condition.
   - `classifyHostResponse({ requestedHost, landedHost, auditedHostAliases, status, retryAfterMs })` returns `'pushback' | 'page-error' | 'none'`. Only the audited host's own document counts. `429`, `503` and any response with `Retry-After` are pushback. Other 5xx are a `page-error` (recorded on the page, no slowdown). A response that landed off-site or on a social platform is `none` (this generalises 2b8b71d8).
   - A streak rule: **3 consecutive** audited-host 5xx document responses count as one `origin-transient` pushback. An overloaded origin still slows the run; one broken page does not.
4. **Wire every caller to it**, and delete the local predicates:
   - `crawl.ts`: `notePushback`, `detectChallenge`, the retry condition and the `blocked` status all use the classifier. `isTransientPushbackStatus` and `TRANSIENT_PUSHBACK_STATUSES` are removed.
   - `render-diff.ts`: raw `noteResponsePushback`, raw challenge check, rendered-marker check.
   - `scan-page.ts`: **frames never call `noteRateLimited`**. Frame `challengeMarkers` stay recorded as evidence.
   - `checks/canonical-target.ts`: pushback only when the hop host is an audited alias.
   - `scan-page.ts` Lighthouse `robotsTxtPushbackStatus`: keep, through `classifyHostResponse`.
   - Core `isBlockedRender` and `normalize-axe.ts` `isChallengeEvidence` use `classifyDocumentWall` and the new marker table. Axe nodes are dropped only when they sit inside a frame the scanner recorded as a wall, or when their own HTML is the vendor captcha element; a stray "security check" string in page text no longer drops a finding.
5. **Tests**:
   - Corpus test (`packages/core/src/acquisition/host-signal.corpus.test.ts`): every labelled page classifies as labelled; zero content pages classify as walls. This is the permanent gate.
   - Unit tests for each classifier branch, the 3-streak rule, and the off-site/social cases.
   - Scanner e2e fixtures (existing crawl e2e pattern, e.g. `crawl-offsite-pushback.e2e.test.ts`): a normal page carrying a DataDome-style script tag and a Cloudflare `challenge-platform` JSD script stays `visited` with zero pushback; a third-party iframe with a challenge marker causes zero pushback; a tiny o2switch-style challenge page is `blocked` with one pushback; a single 500 page is a page error with zero pushback.
6. **Normalization fingerprint bump** (`normalization-fingerprint.ts`), since `isBlockedRender` changes. Re-normalize the stored 2026-09-17 La Corniche audit locally and confirm its content pages come back.

**De-risk checkpoint:** stop and report if the corpus shows a content/wall split the rule above can't separate (for example, walls with long text). Otherwise continue.

### Slice 2: pacing that recovers (fix 2)

In `packages/scanner/src/host-request-scheduler.ts`:

- New state: `#cleanStartsSincePushback` and `#retryAfterUntil`. Each `pace()` increments the counter. `noteRateLimited` resets it and sets `#retryAfterUntil` when a `Retry-After` is present.
- **Recovery rule:** when the delay is above the floor, `#retryAfterUntil` has passed and **20 consecutive request starts** have gone by without pushback, halve the delay (never below the floor) and reset the counter. From the 60 s cap to a 10 s floor that is 60→30→15→10, about 20×60 + 20×30 + 20×15 s ≈ 35 min of extra pacing in the worst case, against the ~17 h the ratchet cost Haaitza. One false event at the floor costs 20 slots at 20 s instead of 10 s, about 3.5 min (inside the ≤ 10 min target).
- **Concurrency stays one-way.** Plan 059 section 22 rejects retrying pushback with more concurrency, and spacing is global anyway, so lanes add no request pressure. Only the delay recovers.
- Emit a `pacing-recovered` progress event (`{ delayMs, occurredAt }`) through the same `onPushback`-style hook, persisted beside pushback events, so the dashboard shows the pace coming back down.
- Rewrite the class comment ("Pressure moves one way…") to state the new rule and why.
- Tests in `host-request-scheduler.test.ts` with the injected clock: cap then recovery to floor; a `Retry-After` window blocks recovery until it passes; pushback during recovery resets the counter; never below floor; concurrency never rises.
- `docs/decisions/trade-offs.md`: new entry "Host pacing recovers after sustained clean requests (plan 076)". It amends 99's "pressure moves one way" with the Haaitza evidence and keeps the concurrency half of the rule.

### Slice 3: an ETA that includes the pacing wait (fix 5)

- `packages/interface/src/queue/eta.ts`: add `computePacedStageEtaMs({ remaining, slotsPerPage, currentDelayMs, workEstimateMs, concurrency })`, which returns `max(remaining × slotsPerPage × currentDelayMs, remaining × workEstimateMs / concurrency)`. `slotsPerPage` is observed: the run's paced request starts divided by completed pages. The scheduler exposes a `requestStartCount` getter reported on stage progress events. Before any page completes, use the static count from the plan (baseline 3 + surfaces actually scheduled for that page + Lighthouse selection share).
- Feed `currentDelayMs` from the latest pushback or recovery event in `report-progress.ts`. The content-scan and Lighthouse stage ETAs use the paced formula.
- **Pre-launch estimate:** on the full-scan launch form, when the prospect has a prior full audit, show "about N h" from that audit's inventory count × planned slots × chosen delay. Without a prior audit, show nothing (the uncapped rule: no false precision). The route reads the latest manifest's page count, so no new storage is needed.
- Tests: `eta.test.ts` cases for the paced floor dominating at 60 s delay; `report-progress` test that a pushback event raises the next ETA; launch-form render test with and without a prior audit. French copy first (memory: French-first).

### Slice 4: sample the mobile and consent surfaces per template family (fix 3)

- In `scan-site.ts`, `context.mobileSurfaces` and the consent surface run only on a **surface sample**: the homepage, every page `buildContentAuditPlan` marks mandatory, and the first two pages of each template family in stable inventory order. Family keys come from the planner v2 skeleton hash already computed before the content scan (`full-audit-plan.ts`, `page-audit-profile.ts`); no new classifier.
- A sampled-out page records `surfaceSkipped: 'family-sampled'` (a typed reason in `evidence-surfaces.ts`), not `MOBILE_SURFACE_UNAVAILABLE`. The evidence graph and `coverage-comparability.ts` treat it as out of scope by plan, not as a material gap. Add a test proving a sampled-out page produces no `unresolved-material-gap`.
- The surface-sample decision is persisted in the audit plan beside Lighthouse selection, so resume and re-normalization reproduce it.
- `docs/decisions/trade-offs.md` entry: surfaces feed diagnostics and link discovery, not findings, so family sampling keeps report content unchanged. Rejected alternative: sampling axe on the baseline surface (that one produces findings).
- Expected effect: about 5 → about 3 slots per non-sampled content page.

### Slice 5: acceptance

1. Deploy through `deploy/odysseus-deploy.sh` (operator action).
2. Full uncapped Haaitza audit at 10 s delay, and a full uncapped La Corniche audit, run one at a time (live audits the operator requested). Record for each: wall time, visited and content page counts, pushback and recovery events, max delay reached, and ETA error at 25/50/75% of the content scan.
3. Compare findings against the stored pre-075 baselines in plan 075's harness matrix. La Corniche must show content findings, not a challenge-only refusal.
4. Record results in this plan's ledger and in plan 075's execution ledger rows for both sites.

## Files

- New: `packages/core/src/acquisition/host-signal.ts` (+ tests, corpus test), `scripts/build-pushback-corpus.ts`, `fixtures/pushback-corpus/{corpus,labels}.json`.
- Scanner: `host-request-scheduler.ts`, `crawl.ts`, `render-diff.ts`, `scan-page.ts`, `raw-document-signals.ts`, `checks/canonical-target.ts`, `scan-site.ts`, `evidence-surfaces.ts`, `evidence-graph.ts`.
- Core: `normalize/normalize-renderdiff.ts`, `normalize/normalize-axe.ts`, `normalize/normalization-fingerprint.ts`, `delta/coverage-comparability.ts`.
- Interface: `queue/eta.ts`, `queue/report-progress.ts`, `dashboard/lib/pushback.ts`, scan-progress and launch-form routes, i18n `progress` section.
- Store: `schemas/job.schema.ts` (recovery events), `schemas/audit.schema.ts` (surface sample) if persisted there.
- Docs: `docs/decisions/trade-offs.md` (two entries), `docs/rules/normalization-rules.md` (wall classification), `plans/README.md` row.

## Closure ledger

| # | Requirement | Owner / seam | Artifact | Proof |
|---|---|---|---|---|
| R1 | Only the audited host's own document can slow the run | `core/acquisition/host-signal.ts` `classifyHostResponse` | every `noteRateLimited` call site goes through it | unit tests; e2e: off-site 429, third-party frame, single 500 → 0 pushback |
| R2 | A page is a wall only if the document is the barrier | `classifyDocumentWall` | shared by crawl, render-diff, `isBlockedRender`, axe | corpus test: 0 content→wall on all stored audits; labelled walls detected |
| R3 | Pacing recovers after sustained clean requests, never below floor, concurrency never rises | `HostRequestScheduler` | recovery rule + `pacing-recovered` event | scheduler clock tests; trade-off entry |
| R4 | ETA includes pacing | `queue/eta.ts` `computePacedStageEtaMs` | stage progress `etaMs` | unit tests; acceptance ETA error ≤ ±35% |
| R5 | Surfaces sampled per family, disclosed as by-plan | `scan-site.ts`, `evidence-surfaces.ts` | persisted surface sample | test: sampled-out page yields no material gap; resume reproduces sample |
| R6 | Haaitza ≤ 3 h 30 min, La Corniche ≥ 150 content pages ≤ 4 h | acceptance runs | artifacts on VPS | recorded run table below |
| R7 | New false positives fail before a live scan | corpus fixture + test in `pnpm test` | `fixtures/pushback-corpus` | CI corpus test |

### Acceptance record

| Site | Artifact | Wall time | Content pages | Pushback / recovery events | Max delay | ETA error (25/50/75%) |
|---|---|---|---|---|---|---|
| Haaitza | pending (not run here) | | | | | |
| La Corniche | pending (not run here) | | | | | |

## Definition of done

Plan 076 is done only when the local implementation is verified, every row in
the requirement-to-proof closure ledger below has evidence, and both uncapped
live acceptance runs meet their thresholds. The live acceptance rows are
intentionally still open in this checkpoint.

## Executable closure contract

The requirement-to-proof closure artifact is the ledger in this plan. Before
closing, each row must name its implementation artifact and verification; R6
must cite the Haaitza and La Corniche artifacts, measured duration/page counts,
pushback and recovery timeline, and ETA error at 25/50/75%. Add a `Closure
evidence:` record and update the matching Plan 075 execution-ledger rows before
archiving this plan.

## Risks

- **DataDome may truly challenge the crawler at some point.** A real DataDome wall is a small captcha document, and the classifier still catches it. If La Corniche really blocks OdysseusBot, the acceptance run shows walls, not content. The remedy then is asking the client to allowlist the published user agent, not pacing.
- **The corpus is only as good as its labels.** The builder prints unlabelled edge cases for operator confirmation before they're frozen.
- **The recovery threshold (20 starts) is a judgement call.** The scheduler tests pin it, and acceptance runs show whether real sites push back again during recovery. If they do, raise the threshold rather than removing recovery.
