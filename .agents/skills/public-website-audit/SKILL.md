---
name: public-website-audit
description: "Explicit recurring read-only audit of the public Odysseus marketing site."
disable-model-invocation: true
---

# Public website audit (recurring)

You are auditing the public marketing site at https://odysseusaudit.com
(source: `packages/site`, deployed on Vercel from `main`). Unlike the
operator dashboard, this site is never used by the operator: its only
readers are prospective clients, hotel owners and general managers who
received a preview letter or heard of the service and are deciding
whether to trust it with their hotel's name and money. Defects hide here
precisely because the operator never sees this site in daily use.

Every run reads the site in character as that prospective client and
hunts for what would make them hesitate: broken pages and links, weird
text and phrasing, translation drift, typography defects, claims that
contradict each other or the pinned compliance copy, scanner jargon
leaking into client vocabulary, layout breaks on a phone, dark-mode
contrast failures, dead ends. The goal state, reached after several fix
cycles, is a full-coverage sweep with no new P1/P2 findings and every
older P1/P2 verified fixed; when you observe that, say so explicitly:
"public website at parity". Never claim parity on a partial sweep.

The division of labor is strict: a run finds, audits, and files GitHub
issues; fixing happens in separate fix sessions driven by those issues;
and the next run verifies what they fixed. Do not implement code. A run
is unattended: never ask the operator questions, make the conservative
choice, and stop with a clear report when blocked. A run is a full
session's work on its own; never combine it with other repo work in the
same session.

## Host adaptation (read first)

- Drive the browser YOURSELF, in the main thread, with whatever browser
  automation your host provides. ZCode: load the
  browser-use:control-browser skill. Claude Code, Codex, and other hosts:
  use the browser, Playwright, or computer-use tooling available in the
  session. Never delegate the live sweep to a subagent: the sweep must
  stay in one context so the client-persona read stays coherent.
- You MAY delegate Pass 2 (code reading) and doc gathering to subagents
  where your host supports them; fold their findings in and verify
  anything load-bearing yourself before recording it.
- No login or secret is involved: the public site has no authentication.
  If your host has no browser automation at all, stop and report
  BLOCKED-NO-BROWSER as the run outcome. Never reconstruct a "sweep"
  from code reading alone.

## Session protocol

Work in /home/heywow/code/odysseus.

1. Run `git status --short` first. If the tree is dirty, identify the
   owner of each change from the session log and do not touch those
   files. Treat existing changes as deliberate.
2. Read docs/session/current-session.md and add a stream section for
   this run ("public website audit run N", following
   docs/agents/session-template.md). Keep it current and end it with a
   clear final status.
3. Record what you are auditing: `git rev-parse --short HEAD`. The site
   deploys to Vercel from `main`, so live usually matches HEAD. If live
   copy contradicts what `main` pins, suspect deploy lag first: note
   DEPLOY-LAG in the run header and do not file findings against a
   deploy you have not seen.
4. Derive the run number N from the ledger's run history (last run + 1).

## The ledger

The canonical ledger is docs/product/public-website-audit.md. It is the
one register that carries across runs and hosts.

Bootstrap (once, idempotently): if the canonical ledger does not exist,
seed it from the newest `.impeccable/critique/*packages-site*.md`
snapshot and from open GitHub issues touching `packages/site`
(stream F's 2026-09-11 close-out lists known-open items: the
offre/home check-grid duplication, the kicker-pattern decision, scanner
vocabulary in the AI-visibility section, and the non-replayable reveal
animation). Assign SITE-001.. SITE-nnn ids in date order, mark entries
whose disposition is a recorded operator decision as "possibly
deliberate", and note the seeding in the run header. Never delete
register history.

Then read ONLY the run history and the open findings' titles and
statuses. Do not read the evidence details yet: your sweep must stay
blind, otherwise you will walk straight to the known findings and miss
new ones.

After the ledger, read CLAUDE.md, docs/product/odysseus-project-brief.md
(the offer and client workflow the site must present), and
docs/rules/offer-positioning.md plus docs/rules/obligation-basis.md and
docs/rules/operator-obligations.md (what the site is allowed to claim).
Designed-versus-shipped deltas and claim-versus-rule mismatches are
findings.

Register format (keep exactly this shape so every run and host produces
a comparable ledger):

```
# Public website UX audit ledger

## Run history

| Run | Date | HEAD | New | Still open | Fixed | Regressions | Coverage | Parity |
| --- | ---- | ---- | --- | ---------- | ----- | ----------- | -------- | ------ |

## Open findings

### SITE-nnn (P1) Short title
- Status: OPEN. First seen: run N. Last seen: run N.
- Where: route, language, viewport.
- Evidence: visible string or DOM path; file:line at the last-seen HEAD.
- Suggested fix: one or two sentences, no code.
- Issue: #nnn (or "none").

## Fixed register

### SITE-nnn (was P2) Short title - fixed, verified run N
- Proof: what you checked that proves it is gone.

## Deliberate register

### SITE-nnn (P3, possibly deliberate) Short title
- Rationale: the reference checked.
- Re-verified run N: still holds / no longer holds.
```

Counts in the run history are per run: new findings, findings still open
at run end, findings newly fixed, regressions. Coverage is "full" or a
list of gaps. Parity is yes/no.

## Pass 1 - blind live sweep (read-only, main thread)

Build the page inventory from packages/site/app/ first (currently:
home, offre, bot, confidentialite-prospection, desinscription, apercu,
and the not-found page), then walk EVERY page in the inventory in BOTH
French and English (the language toggle in the site chrome), at desktop
(1440px) and mobile (390px) widths. Check dark mode on every route at
one viewport, and spot-check keyboard focus and reduced-motion behavior.
Record the coverage list in your run section.

Read every page in character as the hotel owner or GM deciding whether
to trust and buy. While walking, check at least:

- first-impression credibility: would this person keep reading?
- copy quality: weird phrasing, typos, mid-sentence language switches,
  scanner or LLM jargon where hotel-owner vocabulary belongs, unexplained
  internal markers, leftover placeholders;
- typography: straight quotes and apostrophes in French copy where the
  site's own convention is typographic, guillemets consistency,
  non-breaking-space handling before : ; ? in French;
- claims: price figures and offer claims consistent on every page and
  consistent with the rules documents read above; legal and compliance
  statements consistent with the pinned compliance copy;
- navigation and links: every internal link resolves, the language
  toggle works and persists across navigation, every page offers a next
  step (no dead ends), mailto addresses are the ones the rules documents
  name;
- layout: no horizontal overflow or clipped text at 390px, dark-mode
  contrast failures, orphaned headings, images that fail to load;
- apercu states: the page with no token and with a malformed token
  shows a sane client-facing message (never follow a real client's
  one-time preview link, and never submit the desinscription form: they
  are client-impacting actions).

STRICTLY read-only on production: never submit a form, never trigger an
email or an unsubscribe, never consume a preview token, never crawl any
third-party site (external links are checked as hrefs, not followed).
When you must know what an element would do, read the code instead of
clicking it.

Keep evidence textual: route, language, viewport, visible string or DOM
path. Text keeps the ledger greppable across hosts and runs. Breadth
over depth; if the sweep cannot finish, record exactly which pages were
covered and mark coverage partial. Parity requires full coverage.

## Pass 2 - code-level completeness check (delegatable)

Read packages/site/app/ and packages/site/lib/. List every route and
every chrome element, and flag:

- routes or pages with no entry point from the chrome;
- chrome or footer links that point at nothing;
- strings in the copy tables that no route renders, or routes whose
  strings are missing in one language;
- live copy that contradicts the claims pinned by
  `lib/marketing-copy.test.ts` or `lib/compliance-copy.test.ts` (a live
  page contradicting a pinned claim is P1);
- metadata defects: missing or wrong OG/title/hreflang/robots/favicon;
- a not-found page that fails to render or reads as internal.

Then run the deterministic design detector once over the site source
and fold it into the same ledger:

```bash
.agents/skills/impeccable/scripts/impeccable detect --json packages/site
```

Exit 2 marks actionable findings; exit 0 with a short advisory list is
the expected steady state on this repo (verified 2026-09-12: five
advisories, all echoing the committed ignore entries for the side-tab
motif and the fenced preview type ramp). Verify each finding in its
source context before recording (the detector flags string literals
and intentional patterns), then file verified findings as ledger
entries like any other. A finding the committed ignore decisions
already explain (`.impeccable/config.json`,
`packages/site/.impeccable/config.json`, each entry carries its
reason) is possibly-deliberate, not new. Record false positives in the
run section with one line each so the noise level stays visible across
runs, but do not ledger them. If the detector binary is missing or
fails, note `DETECT-UNAVAILABLE` in the run header and continue; a
dead detector blocks nothing.

Before recording each flag, check docs/decisions/trade-offs.md, the
impeccable critique snapshots, and the numbered plans for anything that
looks deliberate; mark those findings "possibly deliberate" with the
reference you checked.

## Severity

- P1: trust-breaking or factually wrong client-facing content: a wrong
  price or legal claim, a self-contradiction, a page that fails to
  render, or a claim that violates the rules documents.
- P2: a visible defect or confusing phrasing that states no falsehood
  (broken layout, dead link, awkward machine-flavored copy).
- P3: polish, typography, or consistency.

## What counts as a shortcoming

Dead ends (a page with no visible next action); broken or misleading
links; FR/EN drift (one language saying something the other does not);
weird text and phrasing (anything a client would find strange, stiff, or
machine-written); typos and agreement errors; typography defects;
scanner or internal jargon where client vocabulary belongs; placeholder
or internal-marker leaks; claims inconsistent across pages or with the
pinned compliance copy; layout breaks at mobile width; dark-mode
contrast failures; two patterns for the same kind of operation.

## Pass 3 - reconcile against the ledger

Classify every ledger entry and every fresh finding:

- NEW: not in the ledger. Assign the next free SITE-nnn id.
- STILL OPEN: already recorded and the evidence still reproduces. Update
  last-seen run and re-anchor the evidence to this run's HEAD.
- FIXED: previously open, now verified gone. Move to the fixed register
  with the run number and the proof (what you saw live, or file:line at
  this HEAD). If the finding has an open GitHub issue, close it citing
  the run.
- REGRESSION: previously FIXED and now reproducible. Re-open the same
  SITE id at P1, count it as a regression, and note what likely
  reintroduced it (the diff range since the run that verified it fixed)
  if determinable. A regression is the most expensive kind of finding.

Possibly-deliberate entries stay in the register; re-verify them each run
and note whether the recorded rationale still holds.

## GitHub issue bridge

Findings are verified defects, and the GitHub issues are the run's
primary handoff to the fix sessions; the ledger is the audit's own
memory. The repo's issue-tracker protocol (docs/agents/issue-tracker.md)
applies. File every NEW finding (P1, P2, and P3) as its own GitHub issue
(needs-triage, severity in the title), self-contained with file:line
evidence and a suggested fix, and reference the SITE id in both
directions (register field and issue body). Before filing, search
existing issues for the SITE id or the same root cause, and check the
`.impeccable/critique` snapshots: a finding already described there but
never filed gets filed now, citing the snapshot. Never open a duplicate.
If `gh` is unavailable or fails, note that in the run header and
continue; never block the run on issue filing.

## Hard rules

- STRICTLY read-only on production: no form submissions, no emails, no
  unsubscribe requests, no preview-token consumption, no third-party
  crawling.
- Do not modify source code. The only repo files you write are the
  ledger and your session-log section (the session log is gitignored;
  do not try to commit it).
- Match the repo's writing rules in everything you write: English or
  French product strings, no em dashes or en dashes, prettier-formatted
  markdown (run prettier on the files you touch, then `pnpm run
  docs:check`).
- If the site is unreachable or a deploy looks broken, stop and report
  that as the run's outcome (SITE-UNREACHABLE, DEPLOY-BROKEN) instead of
  forcing the sweep. A blocked run changes nothing in the register
  except a run history row.

## Deliverable

1. Update docs/product/public-website-audit.md: one new run history row
   (run, date, HEAD, counts, coverage, parity), the register updated per
   Pass 3, and a short appended dated run section: coverage walked,
   persona verdict per page, status changes with evidence, anything odd
   observed (deploy lag, blocked states). Suggested fixes stay
   fix-shaped, no code. Keep every fact a fixer will need.
2. File the GitHub issues per the issue bridge above: one per new
   finding, plus closes (citing the run) for the issues of findings
   verified fixed this run.
3. Commit the ledger path-scoped with a conventional message, e.g.
   "Public website audit run N: x new, y fixed, z open". Do NOT push.
4. In chat, give the operator the short version, outcome first: the trend
   versus the previous run (counts), new P1s verbatim, any regressions,
   the three findings to fix next, and, when it happens, the explicit
   "public website at parity" statement. Keep it short and plain.

## Ending the loop

The loop ends when the operator stops running it or when a run reports
parity. Expect the first runs to be noisy and later ones short: a late
run walks the same inventory and checklist, re-verifies the open
findings, and usually updates only statuses.
