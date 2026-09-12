# Operator dashboard UX audit, 2026-09-12

Scope note: `docs/product/dashboard-ia.md` (approved 2026-09-12) already audited
the pre-rebuild dashboard in detail, and plans 040 through 044 (all landed on
`main` the same day as this audit, before it started) implemented that
redesign plus the hub-launched paid audit and selection management. This
audit does not re-list problems that document already covers and the plans
claim fixed; it checks whether the rebuild actually delivered what it
promised and looks for what plans 040-044 did not cover or introduced new.

Method: live read-only walkthrough of the deployed dashboard
(app.odysseusaudit.com) in French and English via Playwright, plus a
code-level completeness pass over every route in
`packages/interface/src/routes/` and every page in
`packages/interface/src/dashboard/`. No scan, audit, publish, wave change,
draft, or outcome was started, revoked, or recorded; all evidence below is
either a screenshot-equivalent snapshot or a code citation. The
`browser-use:control-browser` skill named in the task brief was not available
in this session; Playwright's MCP tools were used directly instead, driven
by hand rather than delegated to a subagent. Login required the operator to
type the dashboard password directly (session sandboxing blocked every
automated path to `.env`).

## P1 - blocks or misleads the operator

### 1. The new "À traiter" inbox names its audit queue by raw job ID, not the hotel - even though the fix already exists one page over

**Where**: `/a-traiter`, "Audits en attente d'action" / "Audits waiting for
action" section, both languages.

**What the operator experiences**: the very first thing À traiter is
supposed to solve - "the operator's inbox... every row opens the hotel hub
or the audit" - instead shows each row as a bare domain plus a 36-character
job UUID (`lescorderies.com d8c5cde0-7fc9-4389-9656-60f3f27d9e83 · il y a 1
j`). For a hotel-linked audit, the operator has to click through to find out
which hotel it is.

**Evidence**: `packages/interface/src/dashboard/routes/a-traiter.tsx:286`
renders `` `${summary.jobId} · ${formatRelativeTime(...)}` ``. The
`ScanSummary` type already carries `outreachCandidateName` (added by plan
042 slice 4 "for exactly this purpose", per its own doc comment in
`packages/interface/src/dashboard/lib/api-types.ts:29-32`), and
`packages/interface/src/dashboard/routes/audits.tsx:243-249` already uses it
to show the hotel name on the `/audits` list. À traiter's own audit queue -
the page whose entire purpose is fast triage - was simply never updated to
read the same field.

**Fix**: in `AuditsQueue`, prefer `summary.outreachCandidateName` over
`summary.jobId` when present, exactly as `audits.tsx` already does; fall
back to the job id only when the candidate no longer resolves.

### 2. Twelve of seventeen first-email refusal reasons collapse into "the orchestrator refused this action" - no reason, no remedy

**Where**: hub, Emails tab, "Générer le premier email" / "Créer le premier
email" button, both languages.

**What the operator experiences**: clicking to draft a first email for a
hotel with (for example) no discoverable role address gets: *"Rien n'a été
rédigé ; l'orchestrateur a refusé cette action."* / *"Nothing was drafted;
the orchestrator declined this action."* This names the internal mechanism
and nothing else - not why, not what to try instead. `no-usable-contact`
(no findable role email) and `thread-closed` (stray click on a hotel whose
thread already closed) are not edge cases; they are routine outcomes of
normal operator use.

**Evidence**: `packages/interface/src/dashboard/routes/prospect-detail.tsx:349-363`
routes every refusal through `outreachRefusalCopy`, which only has entries
for the 5 publish/render codes plus the 4 `preview-*` codes
(`i18n/fr.ts` / `en.ts`, `auditDetail.outreachPreview.refusalReasons`). The
real endpoint, `POST /api/prospects/:candidateId/outreach/draft`, returns a
17-code union (`CreateOutreachDraftRefusal`,
`packages/interface/src/outreach/create-outreach-draft.ts:66-83`); 12 codes
have no translation and fall through to the generic toast. This is a direct
violation of the project's own "explain the problem before naming the
mechanism" style rule, and of this audit's own working definition of a
finding ("a refusal that names a reason but not the remedy").

**Fix**: add the missing 12 keys to `refusalReasons` in both i18n files
(mirroring the CLI's own refusal copy, which a code comment at
`packages/interface/src/routes/prospects.ts:475-477` says already exists),
and switch the toast to the same lookup path the preview refusals use.

## P2 - costs real time or confusion

### 3. The paid full-audit launch button on the hub has no upfront refusal check, unlike the button right next to it

**Where**: hub, Audit tab, "Lancer un audit complet" (plan 044).

**What the operator experiences**: the sibling button, "Lancer l'audit de
prospection," proactively shows the refusal reason as page text before the
operator can even click it (`no-own-domain`, `already-in-flight`, etc., per
`hubPrimaryAction`'s `scan-refused` state,
`packages/interface/src/dashboard/routes/prospect-detail.tsx:666-675`). The
new paid-audit button added by plan 044 has no equivalent check - it always
renders, and a refusal (`no-own-domain`, `already-in-flight`, `no-cohort`)
only surfaces after the operator opens the confirm dialog, confirms, and
gets a toast back. This is a milder recurrence of the exact "the page does
not say why" defect the IA doc already diagnosed and fixed for the other
button (`dashboard-ia.md`, "A trap on the hotel page").

**Evidence**: `hub-audit-section.tsx:167-171` (button always rendered when
`onLaunchFullAudit` is passed); refusals defined at
`packages/interface/src/routes/prospects.ts:638-679`; not mentioned in plan
044's binding decisions or STOP conditions as an accepted gap.

**Fix**: compute the same kind of proactive refusal state for the paid-audit
button that the prospecting button already has, and show it as page text
before the confirm dialog opens.

### 4. Two internal codes leak to the screen where an equivalent surface already translates the same fact

**Where**: hub Fiche tab ("Origine des données"); À traiter Replies queue.

**What the operator experiences**: (a) the Fiche tab's provenance line
reads "Origine des données · dashboard · **dashboard-review** · 12 sept.
2026" - `dashboard-review` is the code's own internal fallback constant,
not a note anyone wrote. (b) the Replies queue's secondary line shows a raw
mailbox-classifier code (e.g. `automated-response` or an internal
classification string) where `hub-emails-section.tsx` renders the identical
underlying flag as a real sentence ("Une réponse est arrivée et attend
votre relecture.").

**Evidence**: `packages/interface/src/dashboard/routes/hub-fiche-section.tsx:196-205`
renders `detail.review.reason` with no vocabulary lookup;
`REVIEW_REASON_FALLBACK` is set to the literal string `'dashboard-review'`
at `packages/interface/src/routes/prospects.ts:227`.
`packages/interface/src/dashboard/routes/a-traiter.tsx:219` interpolates
`reply.reviewReason` raw, sourced from
`packages/interface/src/outreach/reconcile-mailbox.ts:178,186`; contrast
with `hub-emails-section.tsx:79-83`'s proper sentence for the same flag.

**Fix**: give `dashboard-review` a real French/English label (or drop the
code segment from the provenance line entirely - the actor and date already
say what matters); route the Replies queue's secondary line through the
same sentence `hub-emails-section.tsx` already has.

### 5. The Résultat tab is a dead end until a thread exists, with no word on why

**Where**: hub, Résultat tab, any hotel before its first email is drafted.

**What the operator experiences**: the entire tab shows one line - "Aucun
résultat défini." - and nothing else. The outcome form is correctly gated
on a thread existing (you cannot record an outcome for outreach that hasn't
started), but the empty state does not say that, and carries no link to the
Emails tab where the operator would actually start one.

**Evidence**: `hub-outcome-section.tsx` renders the form only when
`thread !== null`; when it is null, only the generic
`strings.prospectDetail.outcomeNone` paragraph renders, with no
conditional explanation.

**Fix**: when `thread === null`, replace the generic empty line with a
sentence that names the reason ("Aucun email envoyé pour l'instant") and
links to the Emails tab.

### 6. The manual "reveal the paid report" control sits below fifty rows of findings, right after a SIREN identity warning it has nothing to do with

**Where**: hub, Audit tab, bottom of the findings table, unsold hotels.

**What the operator experiences**: "Produire un rapport quand même"
("Produce a report anyway") is the manual override that reveals the
sold-gated Rapport client tab before a sale is recorded (plan 042). Its
wording and its position - directly below a "Vérifier les informations
d'identification du site" (missing SIREN) warning card, past a full page
of findings - invite reading it as "force past this identity problem"
rather than what it actually does: override the sold-gate, unrelated to
this specific audit's findings. An operator who does not scroll past the
findings table will also simply never see this control.

**Evidence**: `packages/interface/src/dashboard/routes/prospect-detail.tsx`
`reportRevealed` state and `showReportReveal={!sold && !reportRevealed}`;
the button renders via `strings.hub.report.reveal` at the end of the Audit
tab's content, after the findings table and the identity-warning card that
`hub-audit-section.tsx` renders above it.

**Fix**: move the reveal control to a place that is about the sale decision,
not about this audit's findings - for example, next to the pipeline strip
or the primary action, not buried past the findings table; rename it away
from "quand même" so it reads as "reveal the report chain manually," not
"force past a problem."

### 7. `POST /api/outreach/replies/:threadId/review` (mark a reply reviewed) has no dashboard caller

**Where**: À traiter Replies queue and the hub.

**What the operator experiences**: a route exists specifically to clear a
reply's "needs review" flag, but nothing in the dashboard calls it. The
Replies queue only reads and links out; the hub's outcome section only
records an outcome or opts out. If recording an outcome does not also clear
the flag internally (unverified - would need a check against
`packages/store/src/outreach-threads.ts`), the "Réponses à valider" count
on the À traiter landing page can never reach zero through the dashboard.

**Evidence**: `packages/interface/src/routes/outreach.ts:178` defines the
route; `a-traiter.tsx:207-232` only calls `GET /api/outreach/replies`.

**Fix**: verify whether recording an outcome implicitly resolves the reply
flag; if not, add a "mark reviewed" action somewhere in the reply's path
(the hub's Emails or Résultat tab is the natural place).

## P3 - polish

### 8. Scan/report failure messages are untranslated English technical prose grafted into an otherwise French page

Two places: the audit page's "Le rapport n'a pas pu être généré" failure
card (`audit-reports-section.tsx:95-107`, labeled "Message renvoyé par la
génération" - deliberately framed as a technical detail per a code comment
at the top of the file, referencing issue #90) and the scan-progress
failure card's coverage-gate message (`/scans/:jobId`, "Le scan a échoué"),
which is full, useful English prose with no such framing and no direct link
to the delay/concurrency fields on `/scans/new` that it names by name. The
first is a documented, deliberate choice; the second reads as ambient page
copy rather than a labeled technical aside, and could at minimum link
directly to the fields it references.

### 9. Prospects list: Contact/Emails/Résultat columns render as a truly blank cell, not "-", when nothing has happened yet

**Evidence**: `vocabularyLabel()` returns `''` for `null`/`undefined`
(`packages/interface/src/dashboard/lib/vocabulary.ts`), used directly for
these three columns in `prospects.tsx`, while the adjacent score columns in
the same row use `row.brokennessTotal ?? '-'`. A blank cell looks like
missing data; a dash reads as "nothing here yet, by design." Every row in
today's selection showed this for at least one of the three columns.

### 10. Five/six server routes have no dashboard caller (dead code, not a user-facing defect)

`GET /api/prospects/:id/{prescan,score,evidence,preview,outreach}` and
`POST /api/audits/:auditId/outreach-preview/revoke` are superseded by the
composed `GET /api/prospects/:id` detail payload and the candidate-scoped
revoke respectively. Nothing breaks; worth a cleanup pass to either delete
them or fold them into the composed endpoint's implementation.

### 11. `no-cohort` remedy names a CLI subcommand the dashboard has no way to run

`"Aucune sélection enregistrée : lancez d'abord une sélection (score
select)."` - `score select` is the literal CLI command name, not something
an operator using only the dashboard can act on. Pre-existing pattern
(the wave dialog does the same), so low priority, but violates the "no
jargon" rule for an operator who has never used the CLI.

## What I checked and found already correct

Worth recording so a future audit does not re-verify these: the
publish-then-draft one-time-token constraint the IA doc called a "hard
constraint" is correctly implemented - `sessionToken`/`publishedLink`/
`draftHint` all live in `prospect-detail.tsx`'s top-level state, above every
tab section, with an explicit code comment citing the constraint, so
switching hub tabs never loses the token. A failed first-email attempt due
to an unusable preview link automatically switches the operator to the
Aperçu tab and shows the reissue remedy there, rather than leaving them
stranded on the Emails tab. The report failure card's raw-message framing
(finding 8, first half) is a deliberate, well-labeled choice, not an
oversight.

## Fix first

1. **Finding 1** (À traiter shows job IDs, not hotel names) - one-line fix,
   the field already exists and is already used one page over, and this is
   the exact "raw internal identifier on the landing page" failure mode the
   task was written to catch.
2. **Finding 2** (12 of 17 draft refusals give no reason or remedy) - the
   single biggest source of a genuinely confusing dead end, and it sits on
   the most common operator action (drafting a first email).
3. **Finding 3** (paid-audit button has no upfront refusal check) - a direct,
   if milder, recurrence of the bug plan 044 was written to fix for the
   other button on the same tab.
