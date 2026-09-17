# Operator dashboard information architecture

> Canonical post-048 map and post-049 runtime contract (2026-09-15). The dashboard is organized around one
> durable prospect record and one operator work queue. Directory is a source of
> prospects, Results is a view of prospects, and scan/job implementation names
> stay out of ordinary operator choices.

## Product shape

Odysseus has three operational destinations:

1. `À traiter` / `To do` (`/a-traiter`) is the landing page and complete work
   queue. Its rows are derived from the shared prospect-work module and its
   badge is the same count.
2. `Prospects` (`/prospects`) is the portfolio, discovery entry point, and
   results surface.
3. `Audits` (`/audits`) is scan history and technical/report work.

`Annuaire` (`/annuaire`) remains a distinct searchable Atout France catalogue,
but is reached from Prospects through `Ajouter depuis l'annuaire` / `Add from
the directory`. `Résultats` is the `view=results` mode of Prospects. The
suppression lookup and Tools remain footer utilities. They are deliberately
not primary destinations.

Compatibility routes remain safe for bookmarks:

| Legacy path | Destination |
| --- | --- |
| `/resultats` | `/prospects?view=results` |
| `/outreach/outcomes` | `/prospects?view=results` |
| `/outreach`, `/outreach/drafts`, `/outreach/replies` | `/a-traiter` |
| `/outreach/do-not-contact` | `/ne-pas-contacter` |

## Operator workflow

```text
Find or add a prospect
        ↓
Run full scan (complete, reusable evidence)
        ↓
Review the deterministic first-email draft in À traiter
        ↓
Handle a reply or due follow-up in À traiter
        ↓
Record the outcome; the prospect status advances automatically
```

The quick check is optional information. One Full scan is the evidence source
for everything afterwards: the outreach preview and emails, and the bilingual
analysis and client reports. Nothing after the scan crawls the site again;
recovering or regenerating a report works offline from the stored evidence.
Sending is always manual; the dashboard prepares and shows drafts but never
sends email.

## Prospects and Directory

Prospects lists only durable prospect records. The page opens with search,
view/status, and `Filtres (n)` / `Filters (n)`. Its `Tous les prospects` /
`All prospects` view is the portfolio. Its `Résultats` / `Results` view is a
projection over statuses `contacted`, `follow-up`, `replied`, `call`, `quoted`,
`won`, `lost`, and `opted-out`; `new` and `audited` remain in the portfolio
view. Its `Archivés` / `Archived` view lists archived prospects; the other two
views, the counts, and À traiter only ever include active prospects.

Results shows campaign-level counts for every result status above the table,
one status badge per row, and one inline outcome control. It does not add a
second status mutation control. Recording an outcome is the normal transition
path; manual status correction is available only from the prospect page's
secondary actions.

Directory initially shows search, stars, department, and `Filtres (n)`. Both
pages use the same pure URL-state model and shared filter bar. Advanced filters
hold sector, group, website kind, commune/postcode, room range, scan presence,
and activity where the source supports them. Combined filters remain URL
addressable, active advanced filters remain removable localized chips, and
`Tout effacer` / `Clear all` resets filters and page number without dropping
unrelated query context.

Directory rows are not prospects until the operator explicitly adds them.
Directory and Prospects therefore share interaction vocabulary without sharing
or silently mutating their data sets. A row linked to a prospect offers
`Ouvrir le prospect` / `Open prospect`, or `Restaurer le prospect` /
`Restore prospect` when that prospect is archived; a linked row is never added
a second time, and a directory source refresh never touches the link.

## Archive and permanent deletion

`Archiver le prospect` / `Archive prospect` is the ordinary way to take a
prospect out of active work. It is record lifecycle, not a sales status: it
changes no status, suppression, preview, draft, or thread, and keeps the
record's enrichment, field origins, outreach history, events, and directory
link. Since issue #381 it also permanently deletes the prospect's audits
(findings, analyses, reports, approvals, their finished scan jobs, and the
local and bucket artifact files), so it asks first: the confirmation states
what is kept, the counts of what is deleted, and that restoring does not bring
the audits back. It is refused while a job for the prospect is queued or
running. If file deletion fails part-way, the prospect is archived, the
remaining audits stay attached, and the detail page offers
`Terminer la suppression des scans` / `Finish deleting scans`. Published
previews are separate documents and keep working. An archived prospect stays
reachable directly, shows an `Archivé` / `Archived` badge, opens no work, and
recommends nothing until `Restaurer le prospect` / `Restore prospect` returns
it on the same record; a new Full scan recaptures current evidence.

`Supprimer définitivement` / `Delete permanently` remains for duplicates, test
records, and bad imports. It sits in a collapsed destructive area under All
actions, and its confirmation first states the counts of what the cascade will
remove. The suppression list is always kept.

## Prospect detail hierarchy

Every prospect page opens with a read-only summary: name, primary site,
location, status badge, email, sector, and informational hotel/site badges.
The page consumes the single-prospect interface of the shared prospect-work
module and renders at most one prominent recommended action.

| Current facts | Recommended action |
| --- | --- |
| No qualifying outreach audit | Run full scan |
| Archived prospect | None until restored |
| Qualifying audit, no first-email draft/thread | Create first email |
| Draft waiting for review | Review draft |
| Sent touch with follow-up due | Create follow-up |
| Follow-up draft waiting for review | Review draft |
| Reply waiting for an outcome | Record outcome |
| `won`, `lost`, or `opted-out` | Completed state; no invented action |

The recommendation is guidance, never a selection gate. If the central guard
blocks the recommended action, the page keeps the action visible and shows the
translated refusal reason/remedy. All other valid actions remain reachable in
`Toutes les actions` / `All actions`.

The secondary hierarchy is:

1. `Résumé` / `Summary` — facts and informational badges.
2. `Modifier la fiche` / `Edit record` — editable fields, field origins,
   multiple websites/emails, and technical record details.
3. `Préparation de la prospection` / `Outreach preparation` — latest relevant
   audit/draft/thread state, outcome recording, and the manual-send note.
4. `Toutes les actions` / `All actions` — quick check, full scan,
   preview/email actions, outcome recording, manual status correction, and the
   collapsed permanent-deletion area. Archive/Restore sits in the page header.
5. `Activité récente` / `Recent activity` — the three newest events.
6. `Historique complet` / `Full history` — all audits, previews, and events,
   with preserved attach/detach actions.

The direct anchors `#emails`, `#actions`, `#outcome`, and `#history` remain
stable so work-queue links and deep links open the relevant control. Returning
to Prospects or its Results view preserves the originating query string.

For an audit linked to a prospect, the prospect is the single source of the
trading name, legal name and SIREN (operator decision, 2026-09-17, plan 057).
The audit copies the prospect's operator-confirmed values at every sync, so a
correction on the prospect reaches every linked audit. Editing those three
fields on a linked audit saves them on the prospect, and the audit's hotel
form says so. When an audit moves to another prospect or is detached, it drops
the previous prospect's values instead of keeping them or seeding the new
prospect with them. Unlinked audits keep their identity on the audit.

## Scan vocabulary

The ordinary dashboard exposes exactly two scan intents:

| Intent | French | English |
| --- | --- | --- |
| `quick-check` | Contrôle rapide | Quick check |
| `full-audit` | Scan complet | Full scan |

Plan 050 retired `prospecting-audit` as new work. Stored audits and queued jobs
carrying it stay readable, qualify for outreach when complete, and display as
`Scan de prospection (ancien)` / `Outreach scan (legacy)`; the scans API
refuses it as a launch type. From a prospect page, `Lancer un scan complet` /
`Run full scan` is the ordinary scan action and the prospect is already
attached. The generic New scan form retains URL matching,
search/create/choose/no-attach behavior for operator-launched scans. Internal
bounded batch job vocabulary may remain in the worker and CLI contracts, but
it is not an operator-facing New scan option. The retired single-site
`light-audit` alias is absent from runtime TypeScript.

These names are behavioral contracts, not labels: `quick-check` is a one-page
probe with no Lighthouse, model, or report stage, and `full-audit` is the
complete crawl followed by French/English analysis and reports. A report stage
that cannot run (for example an unconfirmed identity) leaves the scan
persisted and usable for outreach. Every new single-site audit persists its
intent, and outreach qualification requires an eligible intent and complete
coverage. The internal bounded `prospecting` batch is never an outreach-grade
audit.

The qualifying scan shows its date and age so the operator can judge whether
the site may have changed. A scan normalized by an older release carries a
calm note that its stored results remain usable, never an error or a block. A
report rendered by an older template shows a neutral badge and stays
deliverable while its findings provenance matches.

Status automation follows the same workflow path through `quoted`, then
branches to `won` or `lost`; `opted-out` is a terminal sibling. Normal outcome
recording never rewrites a terminal sibling, while Correct status remains the
explicit manual correction path. Plan 049 records this correction because
Plan 048 required a complete prospecting audit while an earlier implementation
description still implied the lightweight batch behavior.

## Audits and scan progress

Audits remains the technical history and paid-report workspace. New scan is
reached from the Audits header, and scan progress reports the attached
prospect/site without asking the operator to select the same prospect again.
The prospect page's paid report action is secondary; it is not inserted into
the outreach sequence.

Deterministic scanner findings remain the source of truth. The dashboard only
groups and explains structured results already present in the API. Suppression,
robots/pacing, complete-coverage, and manual-send rules remain unchanged; data
version and template age are advisory (trade-off 91).

## Flow targets

Clicks exclude typing and waiting; pages count distinct screens visited.

| Flow | Target after Plan 048 |
| --- | --- |
| Start outreach audit for a prospect | 3 clicks, 2 pages, refusal reason visible |
| Finished audit to preview and first email | 4 clicks on the prospect page |
| Review first email | 2 clicks, same page/work queue path |
| Follow-up drafted and reviewed | 5 clicks, 2 pages |
| Reply reviewed and outcome recorded | 5 clicks, no terminal command |
| Paid client report to approved pair | 10 clicks, numbered report steps |
| Find a prospect's audit | 1 click from the prospect page |

These are interaction targets, not claims of measured improvement. The UX
ledger records browser rehearsals and compares observed counts against them.

## Copy and verification contract

French is the source variant and English mirrors every user-facing key. Tests
cover FR/EN string parity, route and model contracts, render/axe coverage for
Directory, Prospects, Results, and prospect detail, the two scan intents, and the
stubbed prospect workflow. No test calls a live model or scans a live
third-party site.

Historical Plan 040 and Plan 047 descriptions are retained in Git history;
this file describes the shipped post-048 information architecture.
