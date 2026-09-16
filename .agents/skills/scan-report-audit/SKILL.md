---
name: scan-report-audit
description: "Explicit real-site report/preview rehearsal against a hotel."
disable-model-invocation: true
---

# Scan report audit

A repeatable QA pass: pick a real hotel we have not audited yet, run the
audit end to end exactly as a paying client would receive it, then read the
output in character as that hotel's owner or GM seeing it for the first
time. The goal is to catch the kind of defect that only shows up on a real
site with a real report in front of a real reader, before a paying client
is the one who finds it.

The same pass covers both artifacts a real human ever sees: the paid
full-audit report pair, and the outreach preview scorecard that is a
prospect's first sight of the work. One run rehearses exactly one of the
two tracks (see Scope); alternating across runs is what keeps both
surfaces watched.

This complements, not replaces, the existing test suite: unit tests and the
fixture-based suite (`fixtures/spa-demo`, `fixtures/test-audits/`) catch
regressions in known behavior. This skill exists to catch what nobody
has looked for yet.

## Scope

Two tracks. One run rehearses exactly one of them; the log records which.

- **Paid-report track** (the skill's original target): the paid
  full-audit report (crawl, scan, normalize, analyze, PDF). The main
  flow of steps 1 to 7 below describes this track.
- **Outreach-preview track**: the outreach preview scorecard (milestone
  9c, plan 037's v2 preview), French only. It is not a by-product of
  the paid audit: it builds from its own candidate-linked **outreach
  full scan**, which runs the same crawl/scan/normalize pipeline and
  then stops before model analysis and report. The "Outreach-preview
  track" subsections in steps 1, 2, and 4 replace the main flow for a
  preview run.

Out of scope for both tracks: the operator dashboard's own chrome
(views, i18n, shell accessibility) and the touch-1 outreach email
draft, which can only exist after a real publication. For the preview
track the artifact is the scorecard the dashboard's audit page shows in
its sandboxed iframe (the render endpoint's HTML and the operator
`apercu-<auditId>.pdf`), not the page around it. Publication of the
public preview page enters the preview track only as the optional,
operator-gated exercise in step 4. The `/apercu` page's no-token and
malformed-token error states stay with the `public-website-audit`
skill, which checks them read-only and never consumes a real preview
link; the preview track here is the only pass that reads a real
scorecard built from a real scan.

## Host adaptation

- Read the PDFs yourself, in the main thread, and write the critique
  there too. Never delegate the read or the owner/GM critique to a
  subagent: the persona must see every page of both documents in one
  context, or the cross-page and cross-language defects this skill
  exists for fall between the splits.
- Use whatever PDF tooling your host provides. The `Read` tool takes a
  PDF in windows of at most 20 pages; some hosts also carry document or
  pdf skills, or shell converters that render pages to images.
  Everything else here (dashboard API calls, issue filing) is plain
  `curl` and `gh` and works on any host.
- If your host cannot read rendered PDFs at all, stop and report
  BLOCKED-NO-PDF-READ instead of critiquing the underlying JSON and
  calling it a rehearsal.

## Environment: run the scan on the VPS, not the local machine

The hosted dashboard at `app.odysseusaudit.com` (trade-off #60) runs on a
provisioned VPS with more consistent CPU and network conditions than a
personal machine, which is exactly what the scan, render diff, and
Lighthouse passes are sensitive to. **Step 2 (the scan) runs through the
dashboard's job queue, not the local `odysseus audit` CLI.** This is a
standing rule, not a one-off choice for a single run.

Everything else in this skill that is read-only or lightweight (picking a
hotel in step 1, reading the resulting PDFs in step 4, filing issues in
step 5, writing the log in step 6) still runs locally as before — only the
actual scan/analyze/report pipeline moves to the VPS.

Authenticate once per rehearsal session and reuse the session cookie for
every subsequent call:

```bash
umask 077
mkdir -p "$HOME/.cache/odysseus-rehearsal"
chmod 700 "$HOME/.cache/odysseus-rehearsal"
node -e '
  const { parseEnv } = require("node:util");
  const password = parseEnv(require("node:fs").readFileSync(".env", "utf8")).ODYSSEUS_DASHBOARD_PASSWORD;
  if (!password) { console.error("ODYSSEUS_DASHBOARD_PASSWORD is not set in .env"); process.exit(1); }
  process.stdout.write(JSON.stringify({ password }));
' | curl -s -c "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/session/login \
  -H 'content-type: application/json' \
  --data-binary @-
chmod 600 "$HOME/.cache/odysseus-rehearsal/cookies.txt"
```

This needs `ODYSSEUS_DASHBOARD_PASSWORD` in the local, gitignored `.env`
(there is no dedicated env var for this documented yet elsewhere — it is
specific to this workflow). The command above is shaped so the credential
never leaves protected storage:

- It reads only that one variable, inside a short-lived Node process,
  instead of sourcing the whole `.env` into the shell, where every secret
  in the file would be exported to each later child process.
- The JSON body travels to `curl` on stdin (`--data-binary @-`), never as a
  command-line argument, because arguments are visible to every user in
  the process list.
- The cookie jar holds a live production session, so it lives in a
  private `0700` directory under the operator's home with a `0600` file,
  never at a fixed, world-readable path under `/tmp`.

Never print the password or the session cookie value to output. Every
later call in this skill reuses the jar with
`-b "$HOME/.cache/odysseus-rehearsal/cookies.txt"`. When the run ends
(step 7), end the session and delete the jar.

Local `odysseus audit`/`analyze`/`report` remain a documented fallback
(kept below, marked as such) for when the VPS is unreachable — do not
delete that path, just don't default to it.

The outreach-preview track has no local fallback at all: the v2 preview
is dashboard-owned end to end, and the CLI's old `prospect preview
publish` path is retired (`v1-retired` refusal). If the VPS is
unreachable, a preview-track run is blocked, not degraded.

## Steps

### 1. Pick a hotel

Eligible means both of:

- `qualification.outcome` is `qualified` under the current qualification
  version, and
- not already scanned: no existing `audits` document for that hostname
  (query via the mongodb-readonly MCP server) **and** no local
  `artifacts/<hostname>/` directory. Scans can now originate from either
  the VPS dashboard or a local CLI run against the same shared database,
  so checking only the local directory is no longer sufficient.

The outcome test is a positive filter on `qualified`, not merely "not
`already-engaged`". The outcome vocabulary also holds `parked`, `rejected`,
and `group-routed` (`packages/store/src/schemas/hotel-candidate.schema.ts`),
and none of those describes a hotel this audit would ever be sold to, so
rehearsing on one tests something the client never receives. `qualified` is
also the only outcome that guarantees the candidate holds a domain of its
own (`qualify-hotels.ts`, the `ownRegistrableDomain` guard), which is the
thing there is to audit.

The concrete route:

```
odysseus prospect hotel-qualify reasons --outcome qualified --limit 500
```

It prints `candidateId`, `domain`, `finalUrl`, and `evaluatedAt` per row.
Two things about it matter here:

- It sorts by `evaluatedAt` descending and then truncates to `--limit`, so a
  small limit samples the tail of the last qualification batch rather than
  the catalogue. Pull a large limit and pick randomly across the whole
  returned set.
- Audit the row's `finalUrl`, the URL qualification actually resolved after
  redirects, not the declared domain. A hotel whose declared domain
  redirects to one it alone holds has had that target adopted as its own
  (trade-off 37), and the declared domain is then the wrong site to scan.

Pick at random. Do not hand-pick for variety or try to rotate across site
types — let it emerge naturally across repeated runs.

Fetch the candidate's SIREN too; step 2 needs it. It sits on the candidate
(`hotel_candidates.siren`) and on the qualification row's
`siteFacts.siren`, but the `reasons` command prints neither, so read it
through the mongodb-readonly MCP server.

**Stop and show your pick before scanning.** State the hotel's name, URL,
SIREN, and why it was eligible, and wait for a go-ahead. This is the one
veto point before a multi-hour run is sunk into it. The go-ahead you
receive here is also the operator's current, explicit permission for this
named site that AGENTS.md requires before any live third-party scan:
record it (date, hotel, operator) in a session-log stream section for
this rehearsal before submitting the job.

#### Outreach-preview track pick

The preview cannot be rehearsed on the paid audit's record: the render
and publish routes require the audit to carry an outreach candidate
link (`audit.outreach.candidateId`, refusal `not-an-outreach-audit`),
and only an outreach full scan creates one. Pick differently:

- The candidate must sit in a cohort with state `selected`
  (approved). `planOutreachFullScan` re-validates cohort selection,
  current qualification, own registrable domain, suppression, and
  duplicates server-side and refuses with a typed code before anything
  is scanned, so a wrong pick is cheap, but check first anyway,
  through the dashboard's prospect views or the mongodb-readonly MCP
  server.
- Not already scanned: same rule as the paid track, no existing
  `audits` document for the hostname.
- SIREN is not an input here. The legal facts block takes its Sirene
  data from the qualification's stored join on the server side; there
  is no flag to pass, and passing nothing is correct.
- Same stop-and-show veto: state the hotel's name, candidate ID, URL,
  and cohort state, and wait for the go-ahead, recording it in the
  session log as the live-scan permission before submitting the job.

### 2. Scan

Submit the audit through the VPS dashboard's job queue (see "Environment"
above) — uncapped, the same way a real client's audit would run:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/scans \
  -H 'content-type: application/json' \
  -d '{"type":"full-audit","url":"<finalUrl>","options":{"siren":"<siren>"}}'
```

This returns `{"jobId": "..."}`. Do not set `options.maxPages` or
`options.maxDepth`: a real audit is deliberately uncapped (non-negotiable
rule 5's 2026-08-24 amendment exists because a page cap once silently
under-reported a real site by more than a third) and a capped rehearsal
could hide exactly the kind of defect this workflow is meant to catch
(see trade-offs.md#64, where an uncapped real audit reached ~672 URLs).
Accept the multi-hour runtime as the cost of a realistic test. (The local
fallback's `MAX_PAGES` env-var gotcha does not apply here — the VPS's own
environment governs its default, and the job route only applies a cap
when one is explicitly passed in `options`.)

Pass `siren`. Without it, `assessObligations` takes its `siren-missing`
path (`packages/core/src/compliance/assessObligations.ts`), and the legal
section, the most sensitive copy in the report and the part non-negotiable
rule 6 governs directly, is rehearsed in a configuration no real client's
audit would run in. The catalogue holds a SIREN for these hotels, so a real
engagement would supply one.

Poll the job until it finishes:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" \
  https://app.odysseusaudit.com/api/scans/<jobId>
```

`status` moves `queued` → `running` → `complete` (or `failed`/`cancelled`);
`phase` shows progress through crawl, scan, content-scan,
select-performance, lighthouse, normalize, analyze-fr, analyze-en,
report-fr, report-en, complete. A `full-audit` job runs the entire
pipeline automatically, including both-language analysis and both-language
report rendering — there is no separate analyze/report step to trigger
once the job reaches `complete` (contrast with the local fallback below).
Once `status` is `complete`, the job document carries `auditId`; note it.

Record hostname, URL, `jobId`, and `auditId` in
`docs/session/current-session.md` as soon as the job is submitted, per
CLAUDE.md's session-log rule. A multi-hour uncapped scan is precisely the
crash case that rule exists for. There is no local `artifacts/` path to
record for a VPS-run scan; `auditId` plus the dashboard URL
(`https://app.odysseusaudit.com`) is the way back to the data.

If the crawl is blocked by robots.txt or the homepage turns out to be
unreachable, that is a hotel to discard rather than a defect to file (the
job will land in `failed`). Pick another and note the discarded one in the
log.

**There is no schema field yet to mark an audit as a rehearsal rather
than a real client engagement** (`packages/store/src/schemas/audit.schema.ts`
has no such field). Don't invent one as a side effect of this skill.
Instead, record the hostname, URL, and `auditId` in the log (step 5) as
the source of truth for "this was a rehearsal, not a client audit."
If this ever becomes a recurring pain point (e.g. a rehearsal accidentally
feeding a real prospecting/outreach pipeline), that is a real gap worth
raising to the user as its own piece of work, not something to patch
here.

If the detected transactional flow looks wrong once the job completes
(hotels often take bookings through an off-domain vendor the detector can
miss, and `hasTransactionalFlow` feeds `assessObligations` alongside the
SIREN), correct it via the dashboard's manual-fields endpoint and
regenerate, rather than resubmitting the scan:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X PATCH \
  https://app.odysseusaudit.com/api/audits/<auditId>/manual-fields \
  -H 'content-type: application/json' \
  -d '{"transactionalFlowOverride":{"value":true,"reason":"<why>"}}'
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/audits/<auditId>/regenerate-report
```

#### Outreach-preview track scan

Start the scan through the prospects route. It takes no url, no
options, and no siren from the client; everything is resolved from the
candidate server-side:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/prospects/<candidateId>/outreach/full-scan
```

`201` returns `{"started":true,"jobId":"..."}`; `200` returns
`{"started":false,"refusal":"<code>"}` and no scan ran. The typed
refusal vocabulary (`candidate-unknown`, `no-audit`, `audit-in-flight`,
`audit-failed`, `domain-mismatch`, `suppressed`, `stale-provenance`,
`coverage-incomplete`, `insufficient-safe-cards`) is shared across the
start, render, and publish routes. A start-time refusal means pick
another candidate and note the code in the log; treat it as a defect
only when the code contradicts the candidate's recorded state. Poll
the job exactly as in the paid track; `auditId` appears on the job
document at `complete`. The uncapped rule and the
record-in-session-log-on-submission rule apply identically.

The transactional-flow manual-fields correction does not apply to this
track: the preview carries deterministic facts, never an obligation
conclusion, so there is no flow determination in it to correct.

### 3. Generate the report

Nothing to do here for a VPS-run scan: step 2's job already produced both
bilingual analyses and both PDFs as part of the same pipeline run. Skip to
step 4. Same for the outreach-preview track, for a different reason: the
outreach full scan stops before analysis and report by design, and the
preview renders on demand from the finished audit in step 4.

#### Local fallback (only when the VPS is unreachable)

```
odysseus audit <finalUrl> --siren <siren>
odysseus analyze <artifacts-dir> --language fr
odysseus analyze <artifacts-dir> --language en
odysseus report <artifacts-dir> --all
```

Omitting `--max-pages` is not by itself enough to be uncapped locally.
`getMaxPages()` reads a `MAX_PAGES` environment variable
(`packages/scanner/src/config.ts`) and `codysseus` sources `.env`, so a cap
left there applies silently to a run this skill believes is uncapped.
Confirm it is unset before starting. `report --all` prints the written PDF
path per language; note both, step 4 reads them. Before analyzing, check
the detected transactional flow as described above; a standalone `analyze`
consults `--override-transactional-flow` and `--siren` for the same reason
the dashboard's manual-fields endpoint exists.

### 4. Read both PDFs and write the critique

For a VPS-run scan, fetch each PDF with the authenticated session cookie
before reading it (the `/preview` route serves the current fresh report
without requiring approval, which fits a rehearsal read rather than a
client delivery):

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" \
  https://app.odysseusaudit.com/api/audits/<auditId>/report/fr/preview \
  -o /tmp/claude-*/scratchpad/rehearsal-<hostname>-fr.pdf
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" \
  https://app.odysseusaudit.com/api/audits/<auditId>/report/en/preview \
  -o /tmp/claude-*/scratchpad/rehearsal-<hostname>-en.pdf
```

(Use the session's actual scratchpad path, not the literal glob above.)

Read the actual rendered PDF for both languages, not just the underlying
`findings.json`/analysis JSON — layout and rendering defects (see
trade-offs.md#19, #20) are exactly the kind of thing a text-only read
misses.

A real audit's report is long, and `Read` takes a PDF in windows of at most
20 pages, requiring an explicit range past 10. So reading it means paging
front to back on purpose. Do not stop at the first window: the technical
appendix and the glossary are the last two sections (trade-off 44) and
annex pagination is a known risk area (trade-off 17), which puts the
defects this step exists to catch exactly where a partial read never
arrives.

Then compare the two languages against each other. The paid deliverable is
the pair (trade-off 44), so a section that renders correctly in French and
wrongly in English is a defect neither single-language read surfaces.

Write the critique in character as the hotel's owner or general manager,
seeing this report for the first time, with no inside knowledge of what
"correct" looks like. Use this fixed structure every time, so critiques
stay comparable across runs:

1. **First impression** — would this person keep reading, or does
   something in the first page make them stop trusting it?
2. **Trust and credibility** — anything that reads as sloppy, wrong, or
   would make them doubt the audit's competence.
3. **Confusing or unclear findings** — jargon, unclear remediation steps,
   ambiguous severity, anything a non-technical reader would misread.
4. **Layout and rendering** — PDF-specific defects: broken pagination,
   orphaned headers, overlapping text, inconsistent tokens, anything
   visual.
5. **Verdict** — in one paragraph, would they pay for this, recommend it,
   or feel talked down to / misled? Be honest and specific, not diplomatic.

Write this critique before re-reading any earlier entry in
`docs/report/audit-rehearsal-notes.md`. A real owner has no memory of
what the last hotel's report got wrong, and anchoring on the log first is
how new defects get missed while old ones get re-found on cue.
Reconciliation against the log is step 5's second half, not part of the
read.

#### Outreach-preview track read and critique

Fetch both renderings of the one preview build with the session cookie:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" \
  https://app.odysseusaudit.com/api/audits/<auditId>/outreach-preview \
  -o <scratchpad>/rehearsal-<hostname>-preview.json
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" \
  https://app.odysseusaudit.com/api/audits/<auditId>/outreach-preview/pdf \
  -o <scratchpad>/rehearsal-<hostname>-apercu.pdf
```

The render route writes `{"rendered":false,"refusal":"..."}` instead of
HTML if the build refuses; record the code and judge whether it matches
the audit's actual state before calling it a defect or discarding the
hotel. Read the `html` field of the first file in full and the PDF
visually; the PDF is short, so the 20-page-window concern does not
arise. There is no second language to compare against: the render and
publish paths hardcode `fr`, so the paid track's bilingual comparison
does not apply. Note that the operator PDF is generated from the
finished preview HTML string, never from paid-report fields, so any
leak between the two documents is a P1.

Critique in the same owner/GM persona and the same five-part structure,
with the reader framed as the prospect receiving this scorecard as a
cold first touch, and add the checks the fail-closed preview lint
cannot judge:

- Section order and completeness per `docs/rules/outreach-rules.md`
  section 6bis: title and scan date; coverage facts with the three
  page counts reported separately; distinct-finding and affected-page
  totals; four severity tiles; exactly three proof cards; the legal
  facts block; the code-owned EUR 1,600 HT price with its reply CTA;
  the article 14 disclosures (identity, data origins, purpose,
  opt-out, 30-day expiry).
- Number sanity against the audit itself: coverage counts against what
  the crawl actually did, severity tiles against the distinct-finding
  total, each proof card's affected-page count against the site.
- Prohibited-content spot check, read like a skeptic (the lint
  enforces this structurally; the read is the second line): no
  screenshots or images, no exact URLs, no selectors, no rule or
  finding ids, no occurrence counts (affected-page counts are the
  allowed form), no raw evidence, no remediation, no model prose, no
  0-100 score, no prevalence statistics, no sanctions, no legal
  conclusion.
- French copy quality: the proof-card sentences come from a reviewed
  catalog; read all three as prose anyway. A stiff or mis-conjugated
  sentence is a nit for the log; one that states something wrong is a
  defect.

**Publishing is optional and operator-gated.** It creates a real,
unlisted public URL for a hotel that is not a prospect, so only do it
with an explicit go-ahead in this run, and revoke immediately after:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/audits/<auditId>/outreach-preview/publish
curl -s '<returned public url>' -o <scratchpad>/rehearsal-<hostname>-public.html
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/prospects/<candidateId>/preview/revoke
```

Confirm the public page serves the same scorecard the internal build
rendered, then confirm the URL refuses after the revoke. The raw token
in the publish response is returned exactly once and never stored
server-side; never copy it into the log or an issue.

### 5. Triage the findings

Split what the critique surfaced into two buckets:

**Genuine defects** (wrong finding, broken rendering, misleading claim,
anything that would actually need a code or content fix) — draft each as
a GitHub issue per `docs/agents/issue-tracker.md`'s format: self-contained
body, file/line pointers where known, the reproduction evidence (which
hotel, which audit, which page of which PDF), user-visible impact, and a
suggested fix direction. Label `needs-triage`. Search open issues first
(`gh issue list --state open --search "..."`) to avoid filing a duplicate;
where one already exists, add the new evidence to it as a comment instead.

**Copy or wording nits** (stiff phrasing, a term that could be clearer,
anything cosmetic that isn't actually wrong) — these do not become
issues. They go in the log instead (step 6).

Rank each defect P1, P2, or P3 so filing order and triage urgency are
explicit:

- P1: a client-facing fact, number, or legal claim that is wrong or
  contradicts another part of the same report.
- P2: a visible production defect that states no falsehood (clipped
  heading, broken layout, an internal placeholder leaking to the
  client).
- P3: quality degradation without error (tone, typography, spacing).

Then reconcile against the log, now that the critique is committed to
paper:

- Mark every defect and nit NEW or RECURRENCE, citing the earlier
  entry's date. A nit that has now appeared on three different hotels
  is a pattern, not a one-off: file it as an issue citing every
  occurrence instead of logging it a fourth time.
- For each previously filed open issue whose symptom would show in this
  report, note whether it still reproduces. Where it plainly does not,
  comment on the issue with this run's evidence ("not seen in
  `<hostname>`, `<date>`") rather than staying silent.

**Show all drafted issues together and wait for approval before filing
anything.** Nothing gets created on GitHub without a go-ahead — batch the
review rather than confirming one at a time.

### 6. Log the run

Append one entry to `docs/report/audit-rehearsal-notes.md` (create it from
the template there if this is the first run) with:

- date, hostname, URL, `auditId`, and the `artifacts/<host>/<timestamp>/`
  path, which is the way back to the data behind the entry
- the track rehearsed (paid-report or outreach-preview), plus the
  `candidateId` for a preview run
- the run outcome: COMPLETE (both PDFs read and critiqued for the paid
  track; both preview renderings read and critiqued for the preview
  track), PARTIAL
  (the pipeline broke part way: log what completed, file the blocking
  defect, but no owner verdict), or BLOCKED (hotel discarded before or
  during the scan; no defect unless the failure is the tool's)
- any hotel discarded before this one (blocked by robots.txt, unreachable),
  so a picking rule that keeps landing on dead sites is visible as a pattern
- any nits found (the cosmetic bucket from step 5)
- the reconciliation: which findings recurred (with the earlier entry's
  date), and which previously filed issues did not reproduce this run
- a short summary of the critique: the verdict paragraph, plus the top
  one or two concerns from earlier sections — not the full write-up
  verbatim, so the log stays skimmable
- links to any GitHub issues filed from this run

### 7. Stop

End the dashboard session and remove the cookie jar, so no live
production session outlives the run:

```bash
curl -s -b "$HOME/.cache/odysseus-rehearsal/cookies.txt" -X POST \
  https://app.odysseusaudit.com/api/session/logout
rm -rf "$HOME/.cache/odysseus-rehearsal"
```

The skill's job ends once issues are filed and the log is updated. Fixing
filed issues happens later through the normal `ready-for-agent` triage
pipeline, in whatever session picks that work up — not immediately, in
this same pass. Mixing discovery and fixing in one rushed pass skips the
triage and test discipline the rest of this project relies on.

Leave the artifacts where they are. They are real-scan data for a business
that is not a client, `artifacts/` is gitignored, and nothing from the run
gets committed. If a run produces something worth keeping as a test
fixture, that is its own piece of work, through `scripts/deidentify-audit.mjs`
and `fixtures/audits.json`, never by committing the directory as it stands
(trade-off 34).

There is no hard stop for the overall practice. Track it loosely via the
log; treat several consecutive clean runs across visibly different hotels
as an informal signal of readiness, not a number to hit. When a run ends
with zero defects and zero recurring nits, say so explicitly in the log
and to the operator ("rehearsal-clean report"); that statement is the
thing this signal counts.
