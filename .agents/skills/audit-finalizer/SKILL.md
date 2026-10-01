---
name: audit-finalizer
description: "Pre-send check of audits before they go out. Use when the operator asks to check or finalize the outreach preview or the paid report of one audit, a prospect, or a batch such as 'the last 10 audits'. preview (default): a read-only quick check, about ten minutes per audit, that confirms the preview's figures, its three priority cards and its regulatory block and returns SEND or HOLD, with non-blocking defects recorded for a batch fix. preview --fix and report: the full finalization that may fix source, deploy, refresh or rescan the site once, and for report finalizes and uploads the PDF. Never publishes, approves or sends."
argument-hint: "<preview|preview --fix|report> <audit-id | prospect | last N>"
---

# Audit finalizer

Use this skill when the operator asks to check an audit before it goes out.
The operator may name it (`/audit-finalizer`) or ask in plain words ("check
the previews of the last 10 audits", "finalize the report for this hotel").
Ordinary words such as "audit" or "review" about something else do not start
it.

It has three modes:

- `preview` (the default for outreach): a **quick check**, read-only, about
  ten minutes per audit, before a prospect's first email carries the outreach
  preview. It answers one question: can this preview go out as it is? The
  verdict is **SEND** or **HOLD**. It fixes nothing, deploys nothing and
  rescans nothing; what it finds that does not block the send is recorded
  for a batch fix.
- `preview --fix`: the full finalization of one held preview (Stage 1, then
  Stage 2P). Run it only when the operator asks, typically on a HOLD the
  operator wants to send anyway after a fix.
- `report`: the full finalization of a paid client report (Stage 1, then
  Stage 2R), before delivery.

Why the preview is a quick check: outreach sends many previews, and a fix,
deploy and rescan per email costs an hour or more. A preview is short and
deterministic; only a few defects can mislead a prospect (see the send/hold
rule). Everything else waits for the next batch fix, which deploys once and
rescans the held audits together. The defect hunt's sweeps (plan 075,
`plans/defect-hunt-ledger.md`) showed that each site new to the tool brings
roughly one blocking defect per two sites; the quick check catches the ones
that reach a preview, and the batch fixes them for every later site.

The full modes **deliver** their result. They are not bug-hunting passes
that hand defects back to the operator. They do not stop at "fixed in source,
pending deploy", and they never let a preview or a report go out with a known
defect.

The target state of the full modes:

> The scan data describes the site: the right pages analysed, the serious
> findings true, the absence claims confirmed. The preview or report built
> from it states nothing the data does not support, and has no known
> factual, editorial or rendering defect.

This is production and editorial QA. It is not a manual accessibility
verification and not an RGAA audit, and it does not change the offer's
boundary as an automated diagnostic.

## Invocation

~~~text
/audit-finalizer preview <audit-id>
/audit-finalizer preview last 10
/audit-finalizer preview --fix <audit-id>
/audit-finalizer report <audit-id>
~~~

Codex exposes the same skill as `$audit-finalizer`. A plain-language request
from the operator is the same invocation. The target may be an audit id, a
prospect (resolve its qualifying Full scan), or a batch:

- **last N**: from `GET /api/scans?limit=100`, keep the jobs with `type`
  `full-audit`, `status` `complete`, an `auditId` and a `prospectId`; keep the
  newest per prospect (a rescan supersedes the older audit); sort by
  `finishedAt`, newest first; take N. Say in the result which audits were
  picked.

A batch runs the quick check on each audit in turn and ends with one summary
table. `preview --fix` and `report` take one audit only.

Invoking the quick check authorizes actions 1 and 2 below for the audits it
names. Invoking `preview --fix` or `report` with an audit authorizes, for that
audit and its site only, everything in **Authorized actions**. Neither needs
further permission prompts.

For `report`, default to the French report. Review English only when the
operator says it is part of this delivery. Do not generate English merely
because older reports were bilingual.

## Authorized actions

Each item is limited to the named audit and its own site, except the deploy:

1. **Read-only retrieval** of the hosted audit record, report-quality lineage,
   current PDFs, render bundle and preview render (see Tooling), of the stored
   audit directory on the VPS, and read-only database queries about this
   audit, its job and its prospect.
2. **Short live probes of the audit's own site** to settle a doubt about a
   finding or an absence claim: a few pages, the crawler's user agent,
   `robots.txt` and pacing respected.
3. **Source fixes** to shared code, deterministic copy, layout rules and
   deterministic producers, each with a focused test. Commit on `main` when a
   fix has to be live (actions 4 to 7); never push.
4. **Deploy** with `deploy/odysseus-deploy.sh` when a fix must be live on the
   VPS. Deploy a clean tree only: the committed state of `main`, with no
   unrelated uncommitted work. If the tree holds uncommitted changes that are
   not the skill's own, stop and ask before deploying.
5. **Refresh of this audit** (`renormalize-audits.mjs <auditId>`) after a
   deployed normalization fix.
6. **One VPS writing pass per run**: `POST
   /api/audits/:auditId/regenerate-report`, when this audit's findings changed
   (a refresh, a regrouping) or its selected analysis is stale.
7. **One rescan of the audit's site per run**, when Stage 1 finds the scan
   itself wrong or older than a scan-time fix that changes it (Stage 1.6).
8. **Report target only: upload** of the final, clean PDF to the dashboard as
   the finalized report for that audit and language, with its override file
   and lineage.

It never authorizes:

- a scan of any other site, or a second rescan;
- any further product-LLM call beyond action 6 (a rescan's own audit job runs
  its analysis as part of the scan);
- publishing a preview, drafting or sending outreach, sending a report, or
  approving anything;
- a write to any other audit or prospect;
- destructive database or git actions.

## Hard invariants

1. **Scan truth first.** Stage 2 never starts while Stage 1 has an open
   defect. A preview or report that reads well over wrong data is wrong.
2. **Product LLM budget: 0, or 1 VPS writing pass.** The host model running
   this skill is the editor. Never call the product writer, critic, repair or
   translation path to polish prose. Render with `OPENAI_API_KEY`,
   `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` and `MONGODB_URI` removed from the
   subprocess environment so that an accidental provider call fails closed.
3. **Findings change only through their producer.** Never add, remove, merge,
   downgrade, strengthen or reword a finding by hand. If findings are wrong:
   - fix the deterministic producer, with a regression test;
   - recompute from stored artifacts on the VPS (refresh), or rescan when the
     stored acquisition itself is wrong.
4. **Deterministic facts are never edited as prose.** This covers counts, page
   populations, severities, occurrences, measurements, legal facts, obligation
   status, limitations, provenance, ranking inputs, the selected structure and
   every figure of the preview. When one is wrong, fix the code that produces
   or renders it.
5. **No unsupported legal or commercial claim.** Keep
   `docs/rules/obligation-basis.md`, the writing rules' business-claim limits
   and `docs/rules/outreach-rules.md`. A correction may clarify a claim; it may
   never broaden it.
6. **Model-written prose changes only through the override file** (report
   target). Never edit the analysis JSON, a database document, a report record
   or a PDF by hand. The preview carries no model prose, so a preview wording
   defect is always a source fix.
7. **No client-specific hacks in shared code.** Never put a hotel name,
   hostname, audit id, literal client sentence or one-off selector into shared
   code. Report-specific wording belongs in the override file.
8. **Do not churn acceptable prose.** Change a sentence only when it is:
   - factually wrong or unclear;
   - non-native French, or materially repetitive;
   - inconsistent with the rest of the document;
   - against the canonical style.
9. **The rendered document is the release artifact.** Source, tests and JSON
   are evidence. For a report, the locally rendered final PDF is what must be
   clean and is what gets uploaded; for a preview, the hosted render is what
   the prospect will see.
10. **Never send, publish or approve.** Uploading a finalized report is
    storage. Publishing the preview, drafting the email, approving and
    delivering stay the operator's actions.
11. **Client data never enters the repository.** Working files live under
    `reports/` or the session scratchpad; tests use paraphrased shapes.

## Tooling

Every tool below exists. The run uses it as documented; it does not rebuild or
re-specify it. A genuine gap found mid-run is fixed in source
with a test, like any other defect.

### Fetch: `scripts/fetch-client-report.mjs`

~~~bash
node scripts/fetch-client-report.mjs <audit-id> <out-dir> [fr en preview]
~~~

`preview` writes `preview.html` and `preview.pdf`, the operator-only render of
the outreach preview this audit would publish, or prints why the audit cannot
have one yet (`report-not-ready`, `coverage-incomplete`, `no-audit`,
`domain-mismatch`). It never publishes.

For the report languages, it logs in with `ODYSSEUS_DASHBOARD_PASSWORD` from `.env`, which it only reads,
and keeps the session cookie in memory. It then issues GET requests only and
writes, at `0600`:

- `audit.json` and `report-quality.json`;
- `<lang>.pdf`, the current hosted PDF, which is the baseline being corrected;
- `bundle-<lang>/`, the render bundle from
  `GET /api/audits/:auditId/render-bundle/:language`, unpacked one file per
  member exactly as the renderer reads it back:
  - `manifest.json`, `findings.json`, and the selected `analysis.json`;
  - `render-inputs.json`: `manualFields`, `preparation`, `gradeOverride`,
    `delta`, `qualityLimitations`, `obligationAssessment` - everything the
    report stage resolves at render time beyond the three above;
  - `lineage.json`: audit id, language, selected analysis id and digest,
    findings provenance, the VPS build id and template version.

It prints each file's SHA-256, then the two digests an override file has to
repeat, then logs out. Language defaults to `fr`.

The bundle is the only source of the VPS's selected writing. Never render from
a local `artifacts/` analysis: it is a different analysis that happens to share
an audit id.

### Dashboard requests: `scripts/dashboard-request.mjs`

~~~bash
node scripts/dashboard-request.mjs GET /api/audits/<audit-id>
node scripts/dashboard-request.mjs GET /api/scans/<job-id>
node scripts/dashboard-request.mjs POST /api/scans '<json>'
node scripts/dashboard-request.mjs POST /api/audits/<audit-id>/regenerate-report
~~~

One authenticated request, then logout; the password is read from `.env` and
never printed. The audit record gives `siteUrl`, `startedAt`, `prospectId`,
`findingsStale`, `crawlDelayMs` and `pushbackEvents`; the job record gives
`status`, `phase`, `progress` and, once finished, `auditIds`. A POST is a
production write, used only as actions 6 and 7 allow.

### Stored audit on the VPS: `scripts/vps-app.sh`

~~~bash
scripts/vps-app.sh node /app/scripts/measure-audit-data-quality.mjs /data/artifacts/<host>/<run>
scripts/vps-app.sh node /app/scripts/renormalize-audits.mjs <audit-id-prefix>
scripts/vps-app.sh --upload <local-script.mjs> /tmp/<name>.mjs
~~~

Runs one command in the production app container with the deploy key from
`deploy/.deploy.local.env`. The audit directory is
`/data/artifacts/<hostname>/<startedAt>` with `startedAt` written
`YYYY-MM-DDTHH-MM-SSZ` (`2026-09-28T23:48:23.851Z` is `2026-09-28T23-48-23Z`).
It holds `manifest.json`, `findings.json`, one `scan.json` per analysed page
under its `pageDir`, `evidence/` (inventory ledger, check-attempt ledger) and
`reports/`. Ad hoc read-only scripts go in the session scratchpad, are
uploaded to the container's `/tmp`, and never write under `/data`.

### Data quality measure, one audit

`measure-audit-data-quality.mjs` given one audit directory prints that
audit's `alerts`: the page-population alerts (`lib/audit-population-alerts.mjs`:
homepage not analysed, most of the site redirecting to the homepage, pages
sharing one raw document and title, query-string pages, feeds and files, a
thin analysed share, a serious site-wide absence claim) and the evaluation
alerts (checks that evaluated fewer than half the pages they apply to, axe
rules whose raw detections mostly became no finding). An alert is where to
look, not a verdict.

### Where the working set lives: `reports/`

`getReportsRoot()` (`ODYSSEUS_REPORTS_ROOT`, default `<workspace>/reports`) is
the local tree for this work, gitignored and written `0600`. One directory per
finalization holds the whole working set - hosted PDF, bundle, override file,
final PDF and its sidecar - so a finalization interrupted halfway is resumable
and readable months later. Fetch straight into it.

### Render: local, render-only

~~~bash
pnpm run report:finalize-render --bundle <dir> --overrides <file> --out <pdf>
~~~

No `--` before the flags: Commander reads it as the end of option parsing and
the command then sees none of them. `--overrides` is optional; without it the
command re-renders the bundle unchanged, which is how you confirm the local
build reproduces the hosted PDF before correcting anything.

It applies the override file once, then renders the canonical dark PDF and an
optional `-clair.pdf` light sibling through the paired report renderer. Both
come from the same finalized in-memory bundle; a light-only render failure
leaves the dark output valid and marks light unavailable. It opens no Mongo
connection and constructs no provider client. Beside the dark PDF it writes
`<pdf>.meta.json`, carrying the lineage, local build and template version,
override count, both measured page counts/digests/paths when light exists, and
any typed light-render warning. The upload reads that file, so nothing
downstream re-derives a page count from finished bytes.

It refuses to render when:

- a lineage field in the override file does not match `lineage.json`;
- two entries target the same path;
- a path is not one `listWritingProseFields` returns for this analysis;
- `from` does not match the current text exactly, or `to` equals `from`;
- sanitation rewrites or drops an overridden field - the operator's text would
  not be what shipped, so it is named rather than silently replaced;
- an overridden field introduces a writing-guard failure the generated prose
  did not already have.

A guard the **generated** prose already failed is printed as a warning and does
not block. A stored analysis can predate a guard, and refusing there would lock
the operator out of correcting the very text that trips it.

### Override file: `overrides-<lang>.json`

~~~json
{
  "auditId": "<uuid>",
  "language": "fr",
  "analysisDigest": "<sha256 from lineage.json>",
  "findingsDigest": "<sha256 from lineage.json>",
  "overrides": [
    {
      "path": "themes[0](t1).businessImpact",
      "from": "<exact current text>",
      "to": "<corrected text>",
      "reason": "<one line: what defect this fixes>"
    }
  ]
}
~~~

`path` is a writing-pass prose-field path, the same form sanitation warnings
use: `executiveSummary`, `notes`, `themes[i](key).title`,
`themes[i](key).businessImpact`, `themes[i](key).recommendedActions[j]`. That
registry is the allowlist, which is what makes finding ids, ranking, counts and
severities unreachable by construction rather than by rule.

- `from` must match the current text exactly. A mismatch means the analysis
  moved, and the whole file is refused.
- An entry never introduces a claim, statistic or finding absent from the
  structured input. The guards catch several classes of this; they are a net,
  not the standard.

The override file is client data. It stays under `reports/`, is uploaded with
the PDF, and is never committed.

### Upload: `scripts/upload-finalized-report.mjs`

~~~bash
node scripts/upload-finalized-report.mjs <final.pdf> [overrides.json]
~~~

It reads `<final.pdf>.meta.json` for the lineage and, when present, the
`-clair.pdf` sibling, so no digest is ever hand-typed. It POSTs the pair in
one request to
`POST /api/audits/:auditId/report/:language/finalized` with the PDF base64 in a
JSON body - the router requires an exact `application/json` content type on
state-changing routes, and that CSRF guard stays intact.

On the server:

- HTTP 400 if the body, the lineage or the override file is malformed;
- HTTP 409 if the audit's selected analysis or its findings have moved since
  the bundle was fetched, which is the check that stops a superseded report
  reaching a client;
- HTTP 201 otherwise: both PDFs and the override file are written into the
  audit directory, synced to the artifact store, and inserted as one `reports`
  row with `origin: 'finalized'`, the dark canonical digest, the optional light
  variant digest, the override digest/count, upload time and the pipeline
  report it supersedes.

Preview and download then serve the finalized PDF, because the reports
collection is insert-only and the current row is the newest one. The pipeline
render stays reachable at
`GET /api/audits/:auditId/report/:language/generated`, and the dashboard row
shows `Finalisé · N corrections`. A later regeneration inserts a newer pipeline
row that takes over - correct, since the overrides no longer apply to it - and
the row then shows `Finalisation remplacée par une régénération`.

The upload stores. It neither approves nor delivers: both stay the operator's
actions in the dashboard.

### The writing pass on the VPS

`POST /api/audits/:auditId/regenerate-report` refreshes stale findings when
needed, runs **exactly one** writing pass when the findings or the selected
analysis moved, and re-renders the reports. It is the only remote action in
this workflow that produces new model text (action 6), so use it only as
Stage 1 and section R5 describe. After it runs, fetch again: the bundle, the
digests and every override `from` text are now different.

## Load the minimum authoritative context

The quick check needs only `docs/rules/outreach-rules.md` section 6bis, and
`docs/rules/obligation-basis.md` when the regulatory block is present. The
full modes read, before editing anything:

- the host charter and docs/agents/documentation-map.md;
- docs/rules/normalization-rules.md, for Stage 1;
- docs/rules/outreach-rules.md section 6bis, for the preview;
- docs/rules/report-writing-style.md and docs/rules/llm-layer-rules.md, for the
  report;
- docs/report/report-design-system.md and docs/report/report-workbench.md, for
  the report;
- docs/rules/obligation-basis.md, when legal or identity content is present;
- docs/report/report-design-tokens.md, only when touching styles.

Do **not** read docs/report/audit-rehearsal-notes.md before the report's first
blind pass.

## Preview quick check (`preview`)

Read-only. Budget about ten minutes per audit; a doubt that takes longer to
settle is itself a reason to HOLD, not to keep digging. Work under
`reports/check-<site>-<audit-short-id>/` (gitignored, `0600`).

`scripts/preview-quick-check.mjs <audit-id> ...` (or `--uncontacted`, every
prospect still `new` or `audited`) runs the mechanical part of Q1 to Q4: it
fetches, runs the measure, reconciles every printed figure and prints each
card's representative finding with samples and the regulatory block, into
`reports/check-*/quick-check.txt`. Run `pnpm build` first. The judgment below
stays yours.

### Q1. Resolve and fetch

~~~bash
node scripts/dashboard-request.mjs GET /api/audits/<audit-id>
node scripts/fetch-client-report.mjs <audit-id> reports/<dir> fr preview
~~~

Note the site, the scan date, `findingsStale` and `outreach.hasLivePreview`.
The `fr` bundle gives `manifest.json`, `findings.json` and the selected
analysis to reconcile against. A fetch refusal is a HOLD with its reason:
`report-not-ready` (regenerate the report in the dashboard, then check again),
`coverage-incomplete` (the crawl did not complete), `no-audit` or
`domain-mismatch` (not the prospect's qualifying scan). Stale findings are a
HOLD: the preview would state figures a refresh changes.

### Q2. Alerts

~~~bash
scripts/vps-app.sh node /app/scripts/measure-audit-data-quality.mjs /data/artifacts/<host>/<run>
~~~

Read `alerts` and `populationAlerts`. Only the alerts that move a figure the
preview prints, or undermine a card, matter here: the homepage not analysed,
most of the site redirecting to the homepage, pages that are copies of one
document, a thin analysed share, a serious site-wide absence claim. Glance at
the page statuses in `manifest.json`: the homepage and the pages a hotel
client expects (rooms, booking, contact, legal notice) should be analysed.
Other alerts are recorded, not chased.

### Q3. Figures

Check every figure the preview prints against its source:

- inventoried, content-checked and performance-measured page counts against
  the manifest's coverage;
- distinct findings, affected pages, severity totals and category totals
  against `findings.json`.

### Q4. The three cards

For each card, take its representative finding (the priority's rule with the
most work) and read two samples: page, selector, snippet. Ask whether the
hotel's web agency would confirm it. When in doubt, check one live page (the
crawler's user agent, `robots.txt` respected). Note whether the card order is
defensible for a hotel director; an odd order alone does not block.

### Q5. Regulatory block and text

The regulatory block matches the analysis's `obligationAssessment`, never
says the business is bound, and prints no deadline, sanction or legal
conclusion (`docs/rules/obligation-basis.md`). Then read the rasterized
`preview.pdf` once, page by page, as the hotel's director: native formal
French with vouvoiement, no em or en dash, no URL, selector, rule id or scan
date, no broken layout, the price, the ask and the disclosures present.

### Q6. Send or hold

**HOLD** only when one of these holds:

1. a card's finding is false, or does not hold on the live site;
2. a printed figure disagrees with its source, or is materially wrong about
   the site: the homepage missing from the analysed pages, most analysed
   pages not being real pages, a count off by enough to change what a
   careful reader believes (as a rule of thumb, more than 10 percent);
3. the regulatory block or any sentence overstates a legal or commercial
   claim;
4. the preview could not be fetched, or findings are stale;
5. a defect a prospect would see at once: broken layout, text in the wrong
   language, a dash on the public preview, a contradiction between two
   printed numbers.

**SEND** otherwise. A true defect that does not meet those tests (a
debatable card order, a figure off by one or two, a wrong count inside a
finding the preview does not print, a missing finding, a minor finding that
is doubtful) does not hold the email. Record it as backlog.

The quick check never fixes, commits, deploys, refreshes, regenerates or
rescans. On HOLD, the operator chooses: wait for the next batch fix, skip the
prospect, or ask for `preview --fix` on that audit.

### Q7. Record

Append one row per checked audit to the **Finalizer runs** table of
`plans/defect-hunt-ledger.md`: date, site and short audit id, `preview`,
SEND or HOLD, defects found (blocking / backlog, one line each, with the hunt
brief's classes), `-` for fixes and rescan. A defect already recorded in an
earlier row is named with "seen before" so the batch fix sees how often it
recurs. The rows are committed with the next batch fix; an uncommitted
ledger row is never a reason to hold. File no issue from the quick check:
the batch fix triages the backlog rows into fixes and issues.

### Batch fix (outside this skill's runs)

When the operator asks, or when holds accumulate, one session takes the
backlog and HOLD rows of the Finalizer runs table, fixes the systemic ones in
shared code with tests, commits, deploys once, refreshes or rescans the held
audits (rescans queued together with the pacing rules of **Rescanning**),
and runs the quick check on them again.

## Stage 1: scan check (`preview --fix` and `report`)

Start a ledger in the working directory under `reports/` and keep it to the
end of the run: every alert and doubt, what settled it, and every defect with
its class and fix.

### 1.1 Resolve the audit

Fetch the audit record and its prospect link. Note the site, `startedAt`
(the scan date), the audit directory, the job's terminal status, and whether
`findingsStale` is set. Stale findings are refreshed before anything is read
(action 5, or the writing pass of action 6, which refreshes them first).

### 1.2 Read the alerts

Run the data quality measure on the audit directory. Each alert is either
explained in the ledger (a site that really serves three pages from one
document, say why) or becomes a defect below.

### 1.3 Page population

Count the page statuses. Then check:

- the homepage and each language home are analysed;
- the pages a client expects are analysed when the site has them: rooms,
  booking, contact, legal notice, privacy, accessibility statement. Compare
  with the site's own menu, live when the stored data cannot tell;
- nothing analysed is not a page: an error page served with a 200, a redirect
  stub, a copy of another page under a query string or another spelling, a
  feed or a file, a bot challenge;
- what was dropped, blocked or left unanalysed, and why.

### 1.4 Serious and critical findings

For every rule with a critical or serious finding, read two or three samples
(page, selector, snippet, evidence) and ask whether a developer at the hotel's
agency would confirm it. Settle every doubt on the live page (action 2).

Every absence claim (no legal notice, no accessibility statement, no sitemap,
no `llms.txt`, a missing mention): check that the pages where it would appear
were actually read and the file actually fetched. Confirm a serious one on
the live site.

### 1.5 One fact stated twice

Compare the facts the preview or report will state more than once
(inventoried, analysed and measured pages; HTTP errors; finding, severity and
occurrence totals) across `manifest.json`, the inventory ledger and
`findings.json`. Two sources that disagree is a defect even when each looks
right.

### 1.6 Scan older than its checker

List the scanner changes made after the scan date:

~~~bash
git log --since=<startedAt> --oneline -- packages/scanner
~~~

A refresh replays normalization, not acquisition. For each scan-time change,
decide whether it would alter this audit's stored result (a page fetched
differently, a check that reads the live page differently). If it would, the
audit needs a rescan before it goes out.

### 1.7 Act on the result

| Stage 1 result | Action |
| --- | --- |
| Clean, or every alert explained | Stage 2 |
| Defect decided after the scan: a page status, a grouping, a false finding from stored evidence | Fix the producer with a test, commit, deploy, refresh this audit (action 5), run the writing pass (action 6), restart Stage 1 |
| Defect in what was acquired: wrong pages fetched, a check that misread the live page, or a stale scan (1.6) | Fix the code with a test, commit and deploy when needed, rescan (action 7), restart Stage 1 on the new audit |
| The fix needs a second rescan or a second writing pass | BLOCKED-SOURCE-DECISION |
| The site blocks or challenges the crawler, or the preview refuses `coverage-incomplete` | BLOCKED-NEW-SCAN-REQUIRED |
| A legal, identity or scope ambiguity | BLOCKED-SOURCE-DECISION |
| Only wording of the preview or report is wrong | Stage 2 fixes it |

A defect that is systemic (the same input shape would produce it for another
site) is fixed in shared code in this run. One that cannot be fixed in the run
without holding this audit back, and does not affect it, is filed as a GitHub
issue with the defect hunt's evidence bar (`docs/agents/audit-data-defect-hunt.md`).

### Rescanning (action 7)

1. **Pacing.** Read the stored run: `crawlDelayMs`, `pushbackEvents`, pacing
   recovery events, and any 429 or 5xx page, plus the site's `robots.txt`
   `Crawl-delay`. A clean run keeps the default pacing (no `options`). A run
   that was pushed back uses `"options": {"delayMs": 5000, "scanConcurrency":
   1}`; a site that pushed back at 5 s uses 20 s. A `Crawl-delay` above the
   chosen delay wins.
2. **Launch** with the site's homepage and the prospect link:

   ~~~bash
   node scripts/dashboard-request.mjs POST /api/scans '{"type":"full-audit","url":"<homepage>","prospectId":"<prospect-id>"}'
   ~~~

3. **Wait** for the job: poll `GET /api/scans/<job-id>` every few minutes,
   never tighter. A full audit takes from about twenty minutes to a few hours.
4. **Continue** on the new audit id from the finished job's `auditIds`. The
   rescan's own job ran the analysis and the French report; Stage 1 restarts
   from 1.1 on it. The old audit stays as it was.

## Stage 2P: the outreach preview (`preview --fix`)

The preview is the prospect's first sight of the work. It is deterministic:
counts, severity and category totals, three priority cards from the reviewed
card catalogue, the regulatory facts block, the price and the disclosures
(`docs/rules/outreach-rules.md` section 6bis). It carries no model prose.

### P1. Fetch

~~~bash
node scripts/fetch-client-report.mjs <audit-id> reports/<dir> preview
~~~

A refusal decides the next step:

- `report-not-ready`: the French report is missing or older than the selected
  analysis. Run the writing pass (action 6) if it is not spent, then fetch
  again; otherwise BLOCKED-SOURCE-DECISION.
- `coverage-incomplete`: the crawl did not complete. BLOCKED-NEW-SCAN-REQUIRED
  unless the rescan is still available and the cause is fixed.
- `no-audit` or `domain-mismatch`: the audit is not the prospect's qualifying
  scan. BLOCKED-SOURCE-DECISION.

### P2. Read it as the prospect

Rasterize `preview.pdf` and read every page in order, as the hotel's director
opening a cold email from a stranger. Then check:

- the three page counts (inventoried, content-checked, performance-measured)
  equal the manifest's;
- the distinct-finding count, affected-page count, severity totals and
  category totals equal `findings.json`;
- the three priority cards are the report's first three priorities, in that
  order, and each card's representative finding is one Stage 1 confirmed; the
  card says nothing the finding does not;
- the regulatory block matches the audit's obligation assessment, never says
  the business is bound, and prints no deadline, sanction or legal conclusion
  (`docs/rules/obligation-basis.md`);
- the price, the ask and the article 14 disclosures are present; no URL,
  selector, rule id, screenshot, occurrence or scan date appears;
- no em or en dash, native formal French with vouvoiement, no calque;
- nothing would make a careful reader doubt the rest: a number that
  contradicts another, a card that does not fit a hotel, a broken layout.

### P3. Fix

Every preview defect is a source fix: the card catalogue, the template, a
count producer, the regulatory block builder. Fix it with a focused test,
commit, deploy (action 4), fetch again and re-read the whole preview. A card
whose finding is false is a Stage 1 defect: go back to 1.7.

### P4. Hand over

When the last read is clean, the status is PREVIEW-READY. Publishing the
preview and drafting the first email stay the operator's actions on the
prospect page. If the prospect already has a live preview published before
this run and the audit's lineage has moved since, say so: it is stale for a
first-touch draft and the operator reissues it.

## Stage 2R: the paid report

### R1. Resolve and freeze the target

Fetch into the run's directory under `reports/`, beside the Stage 1 ledger.
Nothing in that tree is ever committed. Record in the ledger:

- the baseline PDF's SHA-256 and its page count, from pdfinfo;
- the bundle lineage;
- the delivery language.

An HTTP 409 on the PDF means the hosted report is stale against its analysis.
The render bundle still defines the target; the finalized render replaces the
stale one.

Render the bundle once with the **current local code and no overrides**. This
separates two kinds of defect:

- defects that current code already fixes;
- defects that still need work.

### R2. First blind pass: read the exact PDF front to back

Read every physical page of the baseline, in order. Rasterize each page and
inspect the images, using `pdftoppm` or `pnpm run report:workbench -- --pdf
<path>`. The appendix and glossary are where pagination defects hide, so do
not stop early.

Read as a French SME director who is receiving the report for the first time.

**Editorial.** Check that the French is native and formal, uses vouvoiement,
and has no calques or unneeded anglicisms. Also check for:
- theme titles that are not concise noun phrases;
- unexplained jargon;
- repetitive scaffolding;
- positional cross-references ("ci-dessus");
- duplicated labels or sections;
- overstated claims;
- contradictions between any two sections.

**Visual.** Look for:
- clipping, overflow, or a number wrapping inside itself;
- missing or duplicated fragments;
- a stranded heading or a lone tail line;
- a continuation page without its table header;
- broken cards, badges, or links;
- accidental blank pages;
- glyph or spacing faults;
- anything that contradicts the design system.

Sparse numbered pages are intentional and are not defects.

**Reader trust.** Ask whether anything would make a careful client doubt the
rest of the report: wrong identity, contradictory numbers, opaque provenance,
broken pagination, implausible advice, or text that reads like machine
translation.

Record every issue before fixing anything.

### R3. Reconcile against deterministic evidence

Trace every questioned fact to its owning source in the bundle:

- identity and audit date;
- page populations: inventoried, content-checked, and performance-measured;
- finding, severity, and category totals;
- priority coverage and occurrences;
- performance values;
- limitations;
- legal and obligation facts;
- finding ids, pages, selectors, and WCAG references.

A number is not verified just because another section repeats it.

Next, use the relevant entries in docs/report/audit-rehearsal-notes.md and
docs/report/report-feedback-deferred-items.md as a regression checklist.

### R4. Classify every issue

- **Class:** one of `truth`, `prose`, or `visual`.
- **Scope:**
  - `systemic` if the same input shape could produce the defect for another
    client;
  - `report-specific` if the system is correct and only this content needs an
    editorial choice.

A bug is not report-specific merely because one hotel exposed it.

### R5. Fix at the smallest source of truth

Fix **all** open issues in one planned round. Do not ship them one at a time.

| Issue | Fix |
| --- | --- |
| Systemic truth: projection, count, or population | Fix the producer or renderer, with a focused test. It takes effect in the local render. |
| Systemic truth: finding grouping (near-duplicates, wrong split or merge) | See **Regrouping** below. |
| Systemic prose: deterministic copy, glossary, labels | Fix the string or template, with a test. |
| Systemic prose: model tendency | Fix the prompt or guard for future audits **and** correct this report's text through the override file. |
| Report-specific prose | Override file entry. |
| Systemic visual | Fix the template, CSS, or PDF logic, with a test that captures the shape without client data. |
| Report-specific visual | Find a principled shared rule. If none is defensible, change the wording through an override so the layout resolves. Never special-case the client in CSS. |
| Wrong operator fact (SIREN, name, transactional flow) | Use the existing manual-field mechanism only when trusted evidence or the operator supports the value. Otherwise return BLOCKED-SOURCE-DECISION. |

**Regrouping.** When findings are confirmed near-duplicates or wrongly split:

1. Fix the normalization rule locally, with a regression test.
2. Commit it, then deploy (action 4).
3. Trigger the VPS regrouping with `POST /api/audits/:auditId/regenerate-report`.
   This is the run's single writing pass (action 6).
4. Fetch the bundle again and restart at R1 with the new lineage. The override file is discarded and rebuilt against the new
   writing.

A regrouping after the writing pass is already spent is not allowed. Report it as
BLOCKED-SOURCE-DECISION.

Shared-code fixes stay local and in the working tree. They take effect in the
local render immediately, so the final PDF includes them even though the VPS
has not been deployed. Keep them separate from any unrelated work in the tree
when staging.

### R6. Render and verify each round

1. Run the focused tests for each changed seam.
2. Render the complete PDF from the bundle, the local code, and the override
   file.
3. Inspect each changed page and its neighbours. If pagination, shared styles,
   fonts, or section order changed, inspect the whole PDF.
   When the renderer produces a light sibling, repeat the changed-page and
   neighbour inspection against that light PDF as well. A matching page count
   or digest metadata is not a substitute for checking its visual continuation
   geometry: theme-specific print rules and stale light artifacts can hide
   padding or spacing regressions.
4. Diff the `pdftotext` output against the previous render.
5. Update the ledger, marking each issue as open, fixed, intentionally
   unchanged, or blocked.

Do not try speculative variants of the same symptom. Move to the owning seam
instead.

### R7. Final clean pass

Any change resets the release pass. Render the final PDF and read **every page
again, from page 1 to the end**. Then reconcile the high-trust facts one last
time and diff the text against the baseline. The loop ends only when this pass
finds nothing new, or when a true blocker is recorded.

"Perfect" means no known factual, editorial, consistency, or rendering defect
under the current evidence and design contracts. It does not mean endless
stylistic churn.

### R8. Upload

Upload only after a clean final pass, and only on the READY-FOR-CLIENT path
(action 8).

Then confirm the substitution actually took, from the client's side:

1. `GET /api/audits/:auditId/report/:language/preview?theme=dark` and check
   its SHA-256 equals the local dark final PDF's. If the light sibling exists,
   repeat with `?theme=light`. Preview is not approval-gated, so this is
   readable immediately after the upload.
2. Confirm the dashboard row shows `Finalisé · N corrections` with the count
   you sent, and that the generated-report link still opens the pipeline
   render.

Uploading stores the report. Approving and delivering it stay the operator's
actions.

## Release gates

These gates are the full modes'. The quick check's only gate is the send/hold
rule (Q6).

`preview --fix` and `report` both require:

- [ ] Stage 1 complete, every alert explained or fixed, no open defect;
- [ ] findings changed only through their producer;
- [ ] product LLM calls: 0, or exactly 1 VPS writing pass;
- [ ] at most one rescan, of this audit's site only;
- [ ] focused tests pass for every source change, and every change that had
      to be live is committed and deployed;
- [ ] no client data, PDF, preview or override file staged in git.

PREVIEW-READY also requires:

- [ ] the preview fetched after the last change and read on every page;
- [ ] every figure reconciles to the manifest and findings, and each card's
      finding was confirmed in Stage 1;
- [ ] no legal conclusion, no em or en dash, native formal French.

READY-FOR-CLIENT also requires:

- [ ] render-bundle lineage fetched from the VPS and used for the render;
- [ ] delivery language set resolved;
- [ ] deterministic facts reconcile to their owning sources;
- [ ] no unsupported business or legal claim;
- [ ] native formal French throughout, with no material repetition, jargon,
      calque, awkward cross-reference, or contradiction;
- [ ] every page of the final PDF inspected after the last change;
- [ ] every produced light sibling inspected on the changed pages and
      neighbours after the last change;
- [ ] no rendering defect remains, and the design system is preserved;
- [ ] all prose corrections live in the bound override file, and its guards
      pass;
- [ ] finalized PDF uploaded, the hosted preview's SHA-256 matches the local
      one, and the dashboard row reads `Finalisé`.

## Terminal statuses

The quick check ends each audit on **SEND** or **HOLD (<rule number>:
<reason>)**. The full modes use exactly one of:

- **PREVIEW-READY** (`preview --fix`): the gate is satisfied; the operator publishes.
- **READY-FOR-CLIENT** (report): the gate is satisfied and the PDF is uploaded.
- **BLOCKED-NEW-SCAN-REQUIRED**: the truth needs an acquisition this run
  cannot make (the rescan is spent, or the site blocks the crawler).
- **BLOCKED-SOURCE-DECISION**: a factual, identity or legal ambiguity, or a
  fix that needs a second writing pass or a second rescan.
- **BLOCKED-RENDER**: the document cannot be rendered or read reliably.

A rescan in progress is not a terminal status: wait for it and continue.
Missing tooling is not one either: build it with a test. Preserve every safe
fix when blocked.

## Recording

The quick check records as Q7 says. The full modes append one row to the **Finalizer runs** table of
`plans/defect-hunt-ledger.md`: date, audit (site and short id), target,
status, defects found (blocking and backlog, with the hunt brief's classes),
fixes and commits, and whether a rescan ran. No client data beyond the site
name. This table is how the next occasional sweep knows what the finalizer
already caught.

## Final response

Quick check, one line per audit, then one line per HOLD or backlog defect:

~~~text
PREVIEW CHECK: <n> audits, <s> SEND, <h> HOLD
| Site | Audit | Verdict | Blocking | Backlog |
| <site> | <short id> | SEND | - | <one line each, or -> |
| <site> | <short id> | HOLD (2) | <what, with the evidence> | ... |
~~~

Full modes:

~~~text
FINALIZATION: PREVIEW-READY | READY-FOR-CLIENT | <blocked status>
Audit: <id / client>  (rescanned from <old id>, if so)
Target: preview | report (fr | en | fr+en)
Stage 1: <alerts read> alerts, <n> defects (<fixed> fixed, <filed> filed)
Preview: <sha256 of preview.pdf, pages> | —
Baseline PDF: sha256:<...> (<N> pages) | —
Final PDF: sha256:<...> (<N> pages) — <local path> | —
Uploaded: yes, hosted sha256 matches | no (<reason>) | not applicable
Resolved: <count> factual / <count> prose / <count> visual
Systemic source fixes: <paths or none> (committed <sha> | uncommitted)
Overrides: <count> entries, <path> | none
Product LLM calls: 0 | 1 (VPS writing pass)
Rescans: 0 | 1 (<job id>)
Deploys: <count and build ids, or none>
Final full-document pass: clean | <blocker>
~~~

After the summary, list only the unresolved blockers and any issue filed.
