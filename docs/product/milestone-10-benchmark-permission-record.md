# Milestone 10 benchmark permission record

Status: **APPROVED 2026-09-10** (approval block in section 7 complete). No
request of any kind has been made to any candidate site yet. This is the
instrument that decision 8 in
`docs/product/milestone-10-benchmark-study-design.md` requires: one explicit
permission record naming the benchmark purpose and the exact domain list,
recorded before the first request. Source evidence for every candidate lives
in `docs/research/milestone-10-benchmark-cohort.md`. The instrument
implements decision 8 of `docs/product/milestone-10-benchmark-study-design.md`.
Stage 1 qualification may start now; stage 2 scanning waits for the approved
window (on or after 2026-09-15, never concurrent with pilot scanning), and
section 8 is filled before the first scan request.

## 1. Purpose statement (the text being approved)

> Permission is requested to qualify and scan a fixed list of 43 French
> e-commerce retail websites for the milestone 10 benchmark study. The
> purpose is a published aggregate accessibility benchmark: a static French
> study page and one percentile section in the paid report. The scan produces
> deterministic findings only. No email is sent, no contact address is
> discovered, no one is contacted, and no individual site is named in any
> publication: the published page states only cohort size, vertical, and scan
> dates, and carries the fixed disclosure line near the top.

## 2. What this permission covers, in two stages

Stage 1, qualification. Plain HTTP fetch of each candidate's homepage and
mentions legales, at most two requests per site, with the identifying bot
user agent and the standard per-origin pacing. Purpose: extract the published
SIREN, join it locally against the Sirene stock, and apply the qualification
predicate from `docs/rules/prospect-qualification.md`. Chromium is never used
in this stage.

Stage 2, benchmark scan. The existing full-audit pipeline over the frozen
qualified list only, one pass per site, a 15-page cap passed explicitly on
every invocation, robots respected by the existing engine, one checkpoint per
completed site, dry-run mode printing the exact cohort before anything runs.

## 3. What this permission does not cover

- No outreach of any kind, and no contact-address discovery: the address
  stage of the prospecting pipeline is not run for this cohort.
- No site beyond the frozen list. If qualification cuts below the target, the
  only sanctioned additions are the pre-declared reserves named in the cohort
  document, and activating them is recorded here before any request to them.
- No rescans, no follow-up crawls, no second pass, unless a new record is
  written and approved.
- No reuse of this batch's artifacts for any purpose beyond the study and the
  in-report percentile without a further operator decision.

## 4. The exact candidate list, 43 domains

Candidate order follows the cohort document's selection rule. Only sites that
pass qualification get scanned; the frozen scanned list is recorded in
section 8 before the first scan request. Sites marked "fr" are the French
storefront of an international site; the exact host is pinned at freeze time
and recorded below.

amazon.fr; temu.com (fr); e.leclerc; vinted.fr; carrefour.fr; lidl.fr;
cdiscount.com; fr.aliexpress.com; fnac.com; shein.fr; boulanger.com;
darty.com; leroymerlin.fr; veepee.fr; intermarche.com;
fr.shopping.rakuten.com; manomano.fr; undiz.com; damart.fr; decathlon.fr;
ikea.com (fr); becquet.fr; etsy.com (fr); nespresso.com (fr); picard.fr;
yvesrocher.fr; adopt.com (fr); rituals.com (fr); dyson.fr; bosch-home.fr;
samsung.com (fr); vertbaudet.fr; cultura.com; zalando.fr; king-jouet.com;
intersport.fr; nike.com (fr); sephora.fr; nocibe.fr; aroma-zone.com;
conforama.fr; castorama.fr; bricodepot.fr

Excluded by the category rule and never to be fetched under this record:
booking.com and airbnb.fr (travel) and leboncoin.fr (classifieds). They
appear in the cohort document's sourced pool with the exclusion recorded.

## 5. Safeguards already in force

- Chromium never runs on an unqualified domain; qualification comes first and
  is nearly free.
- Politeness applies to the cheap stage: same per-origin baseline delay and
  the user agent identifying `https://odysseusaudit.com/bot`.
- The scan respects robots.txt through the existing engine, and the engine's
  unlimited-pages default is overridden by the explicit 15-page cap on every
  invocation.
- The ordered list is persisted to the job before the first request; a
  restart resumes it and can never page past it (trade-off 75 discipline).
- Suppression list behavior and the 90-day retention policy published at
  `odysseusaudit.com/bot` govern storage of scan artifacts.
- Published statistics come only from this batch; no domain is named in any
  publication; the fixed disclosure line sits near the top of the study page.

## 6. Decisions the operator must make

Decision 1, purpose and list. Approve section 1 and the 43-domain list in
section 4, or amend it.

Decision 2, qualification sector set. The repo's current e-commerce sector
set enables NAF 47.91A and 47.91B only. Local Sirene evidence
(`docs/research/milestone-10-benchmark-cohort.md` section 6) shows the
current set yields about 8 to 10 expected passes, far below the approved
floor of 20 scored sites, because France's largest omnichannel and
marketplace sites declare other codes.

- Option A, keep the current set: the cohort shrinks to pure distance
  sellers, honestly labeled, below the design's target and at risk against
  the floor. Not recommended.
- Option B (recommended): record a benchmark-scoped extension of the sector
  set to the retail division 47 classes, for this cohort's qualification
  only. Expected yield 31 before qualification losses. Rationale to record:
  the benchmark never contacts anyone, so the filter's outreach-purpose
  protections are untouched, and the vertical is still confirmed at scan
  stage by checkout detection on top of the NAF evidence. The outreach
  sector set itself stays as is.

Decision 3, timing. Restating the approved default for execution: scanning
starts on or after 2026-09-15 and never runs concurrently with pilot
scanning; one crawl capacity at a time.

## 7. Approval block

Completed by the operator on 2026-09-10.

- Decision 1, purpose and list: approved (section 1 and the 43-domain list
  in section 4 as drafted).
- Decision 2, sector set: **Option B**, the benchmark-scoped extension of
  the qualification sector set to retail division 47 classes, for this
  cohort's qualification only. The outreach sector set itself stays as is.
- Decision 3, window on or after 2026-09-15, never concurrent with the
  pilot: confirmed.
- Name and date: heywowyou (operator), 2026-09-10.

## 8. Post-approval record (filled before the first scan request)

- Qualification run date, per-site outcomes, and the frozen ordered list with
  pinned hosts: to be appended here.
- Any reserve activation, with the reason and the replacement positions:
  to be appended here.
- Batch scan start date, dry-run output reference, and per-site completion
  checkpoints: to be appended here by the scan slice.
