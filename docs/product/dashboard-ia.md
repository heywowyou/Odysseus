# Operator dashboard information architecture

> Canonical post-048 map (2026-09-15). The dashboard is organized around one
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
Prepare outreach (complete prospecting audit)
        ↓
Review the deterministic first-email draft in À traiter
        ↓
Handle a reply or due follow-up in À traiter
        ↓
Record the outcome; the prospect status advances automatically
```

The quick check is optional information. A paid client report is a separate
secondary action. Sending is always manual; the dashboard prepares and shows
drafts but never sends email.

## Prospects and Directory

Prospects lists only durable prospect records. The page opens with search,
view/status, and `Filtres (n)` / `Filters (n)`. Its `Tous les prospects` /
`All prospects` view is the portfolio. Its `Résultats` / `Results` view is a
projection over statuses `contacted`, `follow-up`, `replied`, `call`, `quoted`,
`won`, `lost`, and `opted-out`; `new` and `audited` remain in the portfolio
view.

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
or silently mutating their data sets.

## Prospect detail hierarchy

Every prospect page opens with a read-only summary: name, primary site,
location, status badge, email, sector, and informational hotel/site badges.
The page consumes the single-prospect interface of the shared prospect-work
module and renders at most one prominent recommended action.

| Current facts | Recommended action |
| --- | --- |
| No qualifying outreach audit | Prepare outreach |
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
4. `Toutes les actions` / `All actions` — quick check, prepare outreach, paid
   client report, preview/email actions, deletion, and manual status correction.
5. `Activité récente` / `Recent activity` — the three newest events.
6. `Historique complet` / `Full history` — all audits, previews, and events,
   with preserved attach/detach actions.

The direct anchors `#emails`, `#actions`, and `#history` remain stable so work
queue links and deep links open the relevant section. Returning to Prospects or
its Results view preserves the originating query string.

## Scan vocabulary

The ordinary dashboard exposes exactly three scan intents:

| Intent | French | English |
| --- | --- | --- |
| `quick-check` | Contrôle rapide | Quick check |
| `prospecting-audit` | Préparer la prospection | Prepare outreach |
| `full-audit` | Préparer le rapport client | Prepare client report |

From a prospect page, `Prepare outreach` is the ordinary scan action and the
prospect is already attached. The generic New scan form retains URL matching,
search/create/choose/no-attach behavior for operator-launched scans. Internal
bounded batch job vocabulary may remain in the worker and CLI contracts, but
it is not an operator-facing New scan option. The retired single-site
`light-audit` alias is absent from runtime TypeScript.

## Audits and scan progress

Audits remains the technical history and paid-report workspace. New scan is
reached from the Audits header, and scan progress reports the attached
prospect/site without asking the operator to select the same prospect again.
The prospect page's paid report action is secondary; it is not inserted into
the outreach sequence.

Deterministic scanner findings remain the source of truth. The dashboard only
groups and explains structured results already present in the API. Suppression,
robots/pacing, complete-coverage, current-provenance, and manual-send rules
remain unchanged.

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
Directory, Prospects, Results, and prospect detail, three scan intents, and the
stubbed prospect workflow. No test calls a live model or scans a live
third-party site.

Historical Plan 040 and Plan 047 descriptions are retained in Git history;
this file describes the shipped post-048 information architecture.
