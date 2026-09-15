# Operator dashboard information architecture

> **Plan 047 amendment (2026-09-15).** The navigation now treats the durable
> prospect as the hub: `Annuaire` (`/annuaire`) is the searchable Atout France
> directory, `Prospects` (`/prospects`) lists only added records, `À traiter`
> derives work from prospect-linked scans and outreach, and `Résultats`
> edits one status per prospect. Use “Rattacher” / “Attach” for linking a
> scan. “Identité à vérifier”, selected hotels, waves, cohorts, scores, and
> qualification overrides are retired vocabulary. The old candidate route is
> kept only as a compatibility redirect while the legacy pipeline is removed.

Plan 040, slice 1. **Status: approved by the operator 2026-09-12** through the
interactive question mechanism (plan 040, binding decision 1); the rebuild
slices may start from it. This document owns the dashboard's navigation map,
page destinies, and operator vocabulary; plan 040 owns the slice order. The
operator's four decisions are recorded at the end.

Audited at commit `4403da7`, 2026-09-11.

## How this was measured

Two passes, both read-only:

1. **Source.** Every route in `packages/interface/src/dashboard/App.tsx`, every
   in-page link and action, every API call, cross-checked against the server
   routes in `packages/interface/src/routes/`.
2. **Browser.** The dashboard's Vite dev server with every `/api` call
   answered by fictional fixture data (one hotel, "Hôtel du Quai Exemple",
   carried through the whole pipeline), all 20 routes in French and English,
   full-page screenshots at 1440 px, plus the audit page's preview card opened
   and a draft's text dialog. No database, no job queue, and no live site
   were touched. Fixture data can make a label look wrong when the fixture
   itself used an unknown value; findings below come from the code, and the
   screenshots only confirm them.

## What is wrong today

### Navigation

- 18 routes, 4 in the sidebar. 13 pages are reachable only through in-page
  links; `/vendors` has no inbound link at all.
- "Nouveau scan" is in the sidebar and also a button on the Audits page it
  sits next to.
- No detail page has a breadcrumb. The audit page has no link back to the
  audit list and **no link to the hotel it was run for**, although the
  payload already carries the hotel identifier (`outreach.candidateId`).
- The prospect subpages' "Retour aux prospects" button opens the hotel page,
  not the prospect list.
- Queue rows (drafts, replies, outcomes) name the hotel only by its raw
  internal identifier (a 36-character code), with no link to the hotel.

### The outreach loop is split across three areas

Hotel page (Prospects) → scan progress → audit page (Audits) → drafts
(Démarches). The preview card that publishes the link and creates the first
email is the fifth card on the audit page, about 2,500 px down, below the paid
report's preparation form. After "Créer le premier brouillon", the only bridge
to the drafts queue is a toast ("Voir Démarche > Brouillons").

A hard constraint shapes the fix: the first-email draft needs the one-time
preview token, which lives only in the page's memory after a publish. Leave
the page between publishing and drafting and the draft is refused until the
link is reissued. **Publishing and drafting must sit on the same screen.**

### A trap on the hotel page

"Lancer un audit" on the hotel page opens the generic new-scan form prefilled
with the hotel's site. That scan is never linked to the hotel (only
`POST /api/prospects/:id/outreach/full-scan` links one), so its audit can
never publish a preview or create a draft. It sits right next to the correct
button, "Lancer l'analyse complète de prospection". When the correct button
is hidden (the server says the scan may not start), the page does not say
why, although the refusal reason is in the payload.

### Duplicate and ambiguous controls

| Control | Where | Meaning |
| --- | --- | --- |
| "Régénérer le rapport" | audit header, failure card, reports card | re-render both PDFs from the selected writing (no model call) |
| "Réécrire le rapport" | preparation card | new model writing, cost warning |
| "Approuver les deux rapports" | audit header | approve the PDF pair for delivery |
| "Approuver cette version" | preparation card | select a writing version |
| "Enregistrer les choix" / "Enregistrer" | preparation card / hotel information card | two saves for two halves of one form |
| Revoke preview | audit preview card, retired preview page | same action, two places |
| Create first email | audit preview card, outreach thread page, batch on the outreach hub | three entry points |

The paid report's real order (save choices and hotel information, rewrite,
pick the version, re-render the PDFs, approve the pair) is written nowhere
except one hint sentence under the hotel information form.

### Missing capability

**Recording an outcome** (positive reply, call, quote, won, lost) has an API
(`POST /api/outreach/threads/:threadId/outcome`) but no dashboard control. It
is CLI-only today (`odysseus prospect outreach outcome <threadId> <outcome>`,
which needs the thread's internal identifier). The Outcomes page can only
opt a thread out, and its confirmation dialog reuses the page description as
its body.

### The "retired" preview page is not dead

`/prospects/:id/preview` reads `getProspectPreviewView`, which returns the
hotel's **latest preview of either kind**, the current full-scan previews
included. It is the only screen that shows a preview's publication and expiry
dates, and its revoke action revokes by domain, so it works on current
previews too. Deleting it outright would hide preview expiry. Its two
"this moved" notes are the only retired part.

Genuinely uncalled by the dashboard: `POST /api/prospects/:id/preview/publish`
and `GET /api/prospects/:id/outreach/preview-render` (both prescan-era), plus
`POST /api/prospecting/ingest` and `DELETE /api/scans/:jobId` (not
preview-related, not in plan 040's cleanup list, left alone).

### Vocabulary

| Problem | Today | Where |
| --- | --- | --- |
| One concept, three French names | "Pré-analyse d’hôtel", "Présélection d’hôtels", "Contrôle rapide" (English: "Hotel pre-scan", "Shortlist hotels", "Quick check") | audits list badge, new-scan tab, hotel page |
| Wrong French meaning | the first email reads "Relance 1 en brouillon" ("follow-up 1"); English says "Email 1 drafted" | prospect list, hotel page thread card |
| Missing label | qualification `not-evaluated` shows "Autre" / "Other" | prospect list |
| Raw codes on screen | `qualified`, `e1-drafted`, `candidateId`, `gmail`, "Champ: hotel-qualification-v2" | hotel page, drafts |
| Wrong empty text | "Sources: Aucun résultat défini." | hotel page identity card |
| One thing, two names | "Aperçu de prospection" card, "Afficher la synthèse" button, "Aperçu" page | audit page, preview page |
| Label does not match target | "Voir le rapport complet" opens the audit page | scan progress |
| Jargon | "cohorte contactable", "Parcours transactionnel vérifié", "Rapprochement", "Démarches" | outreach hub, hotel information, prospect queues, sidebar |

### Polling

Scan progress 3 s; audits, drafts, replies, outcomes 5 s; prospects 8 s;
detail pages fetch once and never refresh on their own, even while a scan or
a regeneration they started is running.

## Target navigation map

```
Sidebar
  Mesure
    Audits                     /audits          (header button: Nouveau scan)
  Campagne
    À traiter  [count]         /a-traiter       (landing page)
    Prospects                  /prospects
    Résultats                  /resultats
  footer: Vérifier une adresse /ne-pas-contacter, language switcher

Detail pages
  /prospects/:candidateId      the hub (one page per business)
  /audits/:auditId             the audit (findings and client report)
  /scans/new, /scans/:jobId    unchanged
```

"Prospects" and its URL are kept deliberately: the campaign is hotels today,
but the word is sector-neutral and survives a campaign in another sector,
while "Hôtels" would have to be undone. The hub is titled by the business's
own name, so no screen hard-codes a sector. Renaming later is one label and
one redirect.

Every detail page opens with a breadcrumb in the header eyebrow, for example
"Prospects › Hôtel du Quai Exemple › Audit". Old URLs redirect (table below), so
bookmarks and links in old notes keep working.

**À traiter** is the landing page and the operator's inbox: counts and short
lists of drafts to review, replies to review, hotels waiting for identity
review, and audits waiting for input, plus the two batch buttons (first
emails, due follow-ups). Every row opens the hotel hub or the audit. All of
it reads existing endpoints.

## Page destiny table

| Today | Destiny | Becomes |
| --- | --- | --- |
| `/audits` | keep | Audits list; hotel name shown for hotel audits (landed 2026-09-12, plan 042 slice 4) |
| `/audits/:auditId` | keep, restructure (slice 5) | the audit; preview publishing moves to the hub |
| `/scans/new` | keep | leaves the sidebar; reached from the Audits header |
| `/scans/:jobId` | keep | "Voir l’audit" button; breadcrumb back |
| `/prospects` | keep | the prospect list, menu label unchanged |
| `/prospects/:id` | merge | the hub, same URL |
| `/prospects/:id/prescan` | merge | hub, "Contrôle rapide" section; redirect |
| `/prospects/:id/score` | merge | hub, same section (version diff behind a disclosure); redirect |
| `/prospects/:id/evidence` | merge | hub, same section; redirect |
| `/prospects/:id/preview` | merge | hub, "Aperçu" section (status, dates, revoke); redirect |
| `/prospects/:id/outreach` | merge | hub, "Emails" section; redirect |
| `/outreach` | replace | `/a-traiter`; redirect |
| `/outreach/drafts` | merge | À traiter, drafts list; redirect |
| `/outreach/replies` | merge | À traiter, replies list; redirect |
| `/outreach/outcomes` | rename | `/resultats`; opt-out moves to the hub |
| `/outreach/do-not-contact` | keep, relink | `/ne-pas-contacter`, sidebar footer |
| `/vendors` | **delete** (operator decision, 2026-09-12) | nothing; page, route, endpoint and strings removed in slice 2 |
| `/login` | keep | unchanged |

## The hub (one page per prospect)

One page per business; "the hotel hub" in plan 040's wording. The header carries the name, city, star rating, own
domain, a pipeline strip, and **exactly one primary action**, chosen by state:

| State | Primary action |
| --- | --- |
| Identity or review pending | Accepter (Rejeter as secondary) |
| Accepted, scan allowed | Lancer l’audit de prospection |
| Scan refused | none; the refusal reason is shown in plain words |
| Scan running | Voir la progression (the section refreshes itself) |
| Audit ready, no live preview | Publier l’aperçu |
| Preview live, no first email | Créer le premier email |
| Draft waiting for review | Relire le brouillon |
| Follow-up due | Préparer la relance |
| Reply received | Enregistrer le résultat |

Pipeline strip: Fiche › Contrôle rapide › Audit › Aperçu › Emails › Résultat,
each with its state and date, each a jump link to its section.

Sections, in order:

1. **Fiche.** Catalogue, identity, sources, and qualification merged; internal
   identifiers and version codes behind a "Détails techniques" disclosure.
2. **Contrôle rapide.** The quick check's per-page summary, the score and its
   breakdown, and the evidence summaries; full metrics and the score version
   diff behind disclosures.
3. **Audit.** Severity totals, report stage, link to the audit page, live
   progress while a scan runs. The generic "Lancer un audit" trap is removed.
4. **Aperçu.** Status, publication and expiry dates, view, operator PDF,
   publish or reissue, revoke, and the one-time link. Moved here from the
   audit page so publish and first email share one screen.
5. **Emails.** Thread state, this hotel's drafts (read the text, mark
   reviewed, skip), create the first email or the due follow-up.
6. **Résultat.** Outcome history, **the new outcome form** (existing API),
   and opt-out with a real confirmation text.

## The audit page

Header: breadcrumb (Audits › domain, or Prospects › name › Audit), date, pages
visited, severity bar, report stage. No action buttons in the header.

Sections, in order: **Constats** (the findings, moved up: they are what the
audit is), then **Rapport client** as a numbered stepper with one button per
step, each step enabled only when the previous one is done:

1. Préparer: the preparation choices and the hotel information, one save.
2. Rédiger: "Réécrire le rapport", cost warning kept.
3. Choisir la version: preview the candidate, "Approuver cette version".
4. Produire les PDF: "Régénérer les PDF".
5. Approuver pour livraison: "Approuver les deux rapports".

The failure card keeps its explanation but links to the step to redo instead
of carrying its own regenerate button. An audit linked to a prospect shows a one-line
link "Aperçu géré depuis la fiche"; an audit with no prospect keeps only
"Voir l’aperçu" and the operator PDF, the two read-only preview actions.

## Flow-by-flow step counts

Clicks exclude typing and waiting; "pages" counts distinct screens visited.

| Flow | Today | Target |
| --- | --- | --- |
| Start the outreach audit for a selected hotel | 3 clicks, 3 pages, trap button adjacent, refusal unexplained | 3 clicks, 2 pages, reason shown |
| Finished audit to published preview and first email | 4 clicks after a 2,500 px scroll on the audit page; leaving the page voids the draft | 4 clicks on the hub, next action is always the primary button |
| Review that first email | 5 clicks, 2 pages, hotel identified by internal code | 2 clicks, same page |
| One hotel's follow-up, drafted and reviewed | 9 clicks, 4 pages | 5 clicks, 2 pages |
| A reply arrives: review it and record the outcome | 3 clicks plus a terminal command with the thread code | 5 clicks, no terminal |
| Paid client report, scan to approved pair | 11 clicks on one long page, order undocumented, 4 regenerate-like buttons | 10 clicks, numbered steps, one button per step |
| Find a prospect's audit | not possible from its page (match by domain in the Audits list) | 1 click |

## Vocabulary

French is written first; English follows it. User interface only, no API
renames (plan 040, slice 7).

| Concept | Français | English |
| --- | --- | --- |
| prescan | Contrôle rapide | Quick check |
| outreach full scan | Audit de prospection | Prospecting audit |
| full audit (paid) | Audit complet | Full audit |
| published preview (scorecard) | Aperçu | Preview |
| outreach (nav area) | À traiter / Emails | To do / Emails |
| prospect | Prospect (kept) | Prospect |
| join review | Identité à vérifier | Identity to check |
| thread `e1-*` | Premier email | First email |
| thread `e2-*`, `e3-*` | Relance 1, Relance 2 | Follow-up 1, Follow-up 2 |
| qualification `not-evaluated` | Pas encore évalué | Not evaluated yet |
| contactable cohort | hôtels sélectionnés | selected hotels |
| transactional flow | Réservation ou vente en ligne directe | Direct online booking or sales |
| SIREN | SIREN (numéro d’entreprise) on first use | SIREN (French company number) on first use |
| provider draft | Dans Gmail | In Gmail |
| candidateId, version codes | inside "Détails techniques" | inside "Technical details" |

## Poll policy

One policy, in `lib/use-polling.ts`: pause every poll while the browser tab is
hidden; lists (À traiter, Audits, Hôtels, Résultats) refresh every 10 s; a
detail page (hub, audit) refreshes every 5 s only while something it started
is in flight (a scan, a regeneration, a writing), otherwise once and after
each action; scan progress stays at 3 s while running.

## Additive API changes the rebuild needs

No removal, no rename, no locked contract.

1. `GET /api/prospects/:id` gains the hotel's linked outreach audit (identifier,
   stage, severity totals, running job if any) and its latest preview status
   (the view `getProspectPreviewView` already builds).
2. `GET /api/outreach/drafts` accepts a `candidateId` filter; draft, reply,
   and outcome rows gain the hotel name.
3. The hub's outcome form calls the existing
   `POST /api/outreach/threads/:threadId/outcome`.

## Slice order and slice 2 scope

Plan 040's order stands: 2 cleanup, 3 shell and navigation, 4 hub, 5 audit
page, 6 queues, 7 vocabulary. Two proposed amendments, both for the operator:

- **Slice 2 keeps the preview status page** until slice 4 moves its status,
  dates, and revoke into the hub; slice 2 deletes only the two uncalled
  prescan-era preview endpoints and the page's two retired notes (French and
  English together). The page itself retires in slice 4 as a redirect.
- **Rejected by the operator 2026-09-12**: fixing three misleading labels
  early (the first email reading "Relance 1", `not-evaluated` reading
  "Autre", "Retour aux prospects" opening the prospect's own page). All three
  wait for slice 7 with the rest of the vocabulary.

Slice 2 also deletes `/vendors`. Slice 3 adds the new sidebar over the
existing pages; slice 4 builds the hub at the existing `/prospects/:id` URL
and turns the five subpages into redirects; slice 6 builds À traiter and
makes it the landing page.

## Operator decisions, 2026-09-12

1. **Structure approved as written**, including the additive API fields and
   the new outcome form.
2. **`/vendors` is deleted** in slice 2.
3. **Naming left sector-neutral**: "Prospects" and its URLs are kept, only
   "Démarches" becomes "À traiter". The operator's reason: a future campaign
   may not be hotels. Revisit only if the campaign stays hotel-only for good.
4. **Slice 2 keeps the preview status page** until slice 4 absorbs it; the
   early label fixes were **not** taken.
