# Plan 063: Dashboard data contracts and large-audit performance

> **Executor instructions**: make the dashboard's data plane bounded, server-authoritative and scalable without weakening truth. Do not “fix” Point-France scale by hiding records, truncating global counts, loading everything into the browser, or introducing frontend virtualization before server query boundaries are correct. Preserve the current simple HTTP/polling architecture unless measurement proves it insufficient.

## Status

- **Priority**: P1
- **Effort**: L
- **Depends on**: Plans 060 and 061; coordinates closely with 062.
- **Coordinates with**: 064 and 065.
- **Category**: API contracts, read models, pagination, search/filtering, dashboard responsiveness, large-audit scale.
- **Final review state**: repository-wide design review plus repeated convergence passes; the final fresh pass produced no additional substantive architectural change. Freeze speculative design and let implementation/evaluation evidence drive later amendments.

---

# 1. Purpose

The current dashboard works at today's scale but has several structural growth
limits:

- `/api/prospect-hub/todo` intentionally loads every active prospect and
  derives all work on every poll;
- `/api/scans?limit=200` drives list rows, queue state, search/filter and KPI
  counts from one truncated window;
- audit detail returns the full finding set and occurrence/evidence detail;
- prospect detail returns growing audit/history collections inline;
- report availability can cause artifact reads during ordinary detail loading;
- the browser still receives several persistence-shaped responses and derives
  semantics locally.

This plan replaces those patterns with bounded operator read models while
keeping the architecture understandable.

---

# 2. Binding decisions

1. **Server pagination is the default scaling tool.**
2. **Global counts/queue state never come from a truncated page.**
3. **Active work and historical work are separate query shapes.**
4. **Attention is a first-class bounded projection, not “load all prospects then derive”.**
5. **Audit summary never requires all findings or report bytes.**
6. **Occurrence/evidence detail is paged/lazy.**
7. **Search/filtering over growing collections is server-side.**
8. **Response schemas for quality-critical control surfaces are runtime validated in the dashboard.**
9. **The server sends semantic operator states from 060/061/062, not raw persistence objects.**
10. **Keep HTTP + bounded polling.** Do not add WebSockets/SSE until measured load/latency justifies them.
11. **Prefer pagination to row virtualization.** Virtualization is a later measured optimization because it complicates accessibility and keyboard behavior.
12. **No hidden truncation.** Any bounded sample is labeled as a sample and never used for a global claim.

---

# 3. Current implementation findings

## 3.1 À traiter scales with the whole catalogue

`packages/store/src/prospect-hub.ts:listProspectTodo` loads all active
prospects, then `loadProspectWork` loads related audits/jobs/reports/drafts/
threads with bounded `$in` queries. The grouped derivation is careful, but the
outer population is unbounded and the dashboard polls it every 10 seconds.

At thousands of prospects this becomes an application-wide recomputation for a
small inbox.

## 3.2 Audits list is globally incomplete after 200 rows

`packages/interface/src/dashboard/routes/audits.tsx` polls
`/api/scans?limit=200` and computes:

- KPIs;
- active queue;
- client-side search;
- status filtering;
- sort.

Once history exceeds the window, those are not global facts.

## 3.3 Audit detail payload is occurrence-heavy

The current audit detail route loads all findings and returns occurrence/page/
raw-evidence-derived fields in the primary response. Point-France-shaped audits
make this the wrong boundary even if React rendering were optimized.

## 3.4 Prospect detail history grows inline

The prospect detail route returns all audits plus a bounded event history and
other collections in one snapshot. A durable prospect with repeated re-audits
will eventually make the detail request unnecessarily large.

## 3.5 Runtime validation is selective

`dashboard/lib/api.ts` has `fetchJsonValidated`, but only a subset of
critical responses use it. The new control-room contracts are too important to
remain compile-time casts only.

---

# 4. Target read-model boundaries

Use purpose-built query responses. These names describe contracts, not required
file names.

## 4.1 Application attention

```text
GET attention
  filters: kind, subject, age
  cursor/page
  pageSize bounded
→ rows
  total
  countsByKind
  lastEvaluatedAt
```

The server derives rows directly from authoritative conditions using indexed,
bounded queries. It must not materialize every prospect and then discard 99%.

For existing outreach work, preserve `deriveProspectWork`'s pure logic where
possible, but feed it only candidate prospects selected by bounded queries or
maintain queryable state needed to locate open work.

Do not introduce a second mutable “notification” collection merely to avoid
query work unless profiling proves the query cannot meet the budget. If a
materialized attention index becomes necessary later, its rows are derived/
repairable projections, never business truth.

### Bounded candidate strategy

Do not replace the current all-prospect scan with another hidden all-prospect
scan. Build the candidate subject set from the collections that can actually
produce open work, then run the existing/pure domain derivation only for that
bounded union.

For the current product this means querying, with narrow projections/indexes:

- pending outreach drafts/replies/follow-up-due threads;
- legacy `needs-input`/relevant failed job rows during migration;
- Plan-059 evidence runs/issues whose durable state requires operator input;
- Plan-058 quality runs with a nonautomatic recovery decision, plus bundle approval only when paid client review/delivery has actually been requested; a merely quality-approved prospecting bundle is not attention;
- any explicit prospect state that directly creates a first-email/identity
  attention item.

Union/deduplicate the resulting `prospectId`/`auditId` subjects, load only
their required work facts, derive the final attention rows, then sort/page.
This preserves the existing pure business derivation without making catalogue
size the polling cost.

If a due-follow-up condition is time-based, query by its persisted due timestamp
or other authoritative thread field; do not wake every prospect to ask whether
it is due.

## 4.2 Audits active work

```text
GET active audit work
→ running/waiting/retrying/cancel-requested
  ordered queued scans
  blocking/attention summary
  counts
  queueRevision
```

This is small and polled.

## 4.3 Audit history

```text
GET audit history
  server q/filter/sort
  cursor/page
→ lightweight rows
  total/filter counts
```

Historical rows are not continuously polled as a full page. A small active
summary can refresh independently.

## 4.4 Audit control summary

```text
GET audit control summary
→ identity/scope
  work projection
  evidence summary
  finding aggregates
  report summary
  capabilities
  attention
  newest lineage entries
```

No full findings. No PDF bytes. No giant attempt ledger.

## 4.5 Findings

```text
GET findings
  auditId
  query/category/severity/third-party/state
  cursor/page
→ finding summaries + total counts
```

```text
GET finding occurrences
  auditId + findingId
  cursor/page
→ bounded occurrence rows
```

Representative evidence snippets are bounded and safe. Full raw evidence remains
behind evidence-specific authenticated access only where the product truly
needs it.

## 4.6 Lineage/history

Evidence attempts, quality iterations and prospect events use separate bounded
history endpoints or cursors. The initial control summary may include only the
newest N human-level events plus a “View history” action.

---

# 5. Pagination design

Prefer cursor pagination for append-heavy chronological histories and stable
large finding lists where sort keys are deterministic.

Offset/page pagination may remain where current lists are modest and name-sorted
(`Prospects`, `Directory`) if measured performance remains good.

Every page response includes:

```text
rows
page/cursor metadata
hasMore or total where useful
server filters/sort applied
snapshot/asOf timestamp when consistency matters
```

Do not calculate expensive exact totals when the UX does not use them. Where a
global KPI is displayed, its count must be authoritative and independently
queried/aggregated.

---

# 6. Server-side search and filtering

## 6.1 Prospects

Keep existing server-side prospect paging/filtering.

Extend only with quality/work filters that are proven useful, such as:

- needs attention;
- active scan;
- evidence ready/not ready;
- report awaiting approval;
- report active;
- archived;
- recently completed;
- re-audit relationship/due state only if a due policy actually exists.

Do not build CRM segmentation beyond current operator needs.

## 6.2 Audits

Move search/status/type/date/prospect filters from the 200-row client window to
the server.

Operator-facing filters use semantic states from 060/061, not raw legacy job
status alone.

Examples:

```text
Active work
Needs attention
Evidence approved
Report awaiting approval
Report active
Failed work
Quick Check
Full scan
Historical/legacy
```

A filter can combine independent dimensions rather than force a single global
status.

## 6.3 Findings

Indexed/filterable fields should be derived from normalized finding metadata,
not regex over giant evidence blobs.

Support the dimensions the UI actually exposes; do not create a general search
engine.

---

# 7. API contract discipline

## 7.1 Closed semantic schemas

For these critical surfaces, define server response schemas and mirror/validate
them in the dashboard:

- attention page/count;
- active audit work/queue;
- audit history row/page;
- audit control summary;
- findings page;
- report candidate/approval summary;
- capabilities/problem envelope.

The browser bundle may continue not importing workspace packages. Maintain a
contract parity mechanism that fails CI when serialized enums/shapes drift.

Acceptable mechanisms:

- a small generated JSON/schema artifact consumed by dashboard build/tests;
- explicit mirrored Zod schema plus server fixture parity test.

Choose the simpler method consistent with the build. Do not let two independent
hand-written state machines evolve.

## 7.2 Stop exposing store documents wholesale

Routes such as scan detail currently spread a job document into the response.
New control endpoints use explicit projections/DTOs.

Benefits:

- store migrations do not silently become API changes;
- confidential/internal fields cannot accidentally leak;
- optional persistence fields stop becoming implicit UI states;
- response size remains bounded.

Legacy routes may remain during migration, then be narrowed once no caller
depends on raw shape.

## 7.3 Versioning

Do not create public REST version namespaces for an internal single-client app.
Use additive-compatible schema migration plus a small `contractVersion` where
a breaking dashboard/server mismatch needs fail-loud protection during deploy.

The dashboard and server are deployed together; this is not an external API.

---

# 8. Polling and cache behavior

## 8.1 Poll only what changes

- active work / attention count: poll;
- active audit summary while work exists: poll;
- static completed findings/history: fetch on navigation/filter change;
- report candidate summary while quality run exists: poll;
- active report bytes: fetch only on explicit review/download.

## 8.2 Preserve last good state

Keep the existing good behavior in `usePolling`:

- failed refresh does not blank the page;
- show refresh failure and age of last good data;
- hidden tabs pause polling.

Add:

- stale-state indicator after a defined multiple of poll interval;
- immediate refresh after local command success/conflict;
- abort superseded requests when filters/navigation change.

## 8.3 Avoid thundering self-poll

One page should not independently poll several endpoints that all execute the
same expensive aggregate. Compose a small control snapshot when the information
changes together.

Do not create one giant snapshot containing unrelated static data.

---

# 9. Database/query requirements

Before adding indexes, capture `explain`/query measurements on realistic
fixtures. Add indexes only for real server filters/sorts.

Likely indexed dimensions to verify include:

- job/work state + queue order;
- prospect archived/status;
- prospectId/auditId relation;
- audit date/site/prospect;
- report/evidence run current/superseded state;
- attention candidate conditions;
- finding auditId + severity/category/rule/dedupe key;
- chronological lineage/event keys.

Use narrow projections everywhere. Avoid returning raw evidence fields when a
count/status is enough.

No N+1 per prospect/audit on list pages.

---

# 10. Point-France performance budgets

Establish measured budgets in CI/integration tests using a synthetic/deidentified
fixture with at least:

- 400+ inventoried pages;
- hundreds of findings;
- tens of thousands of occurrences;
- several evidence repair attempts;
- several report quality iterations;
- multiple historical scans/re-audits.

Initial budgets are guardrails to tune from measurement, not eternal product
numbers. At minimum prove:

- primary audit control JSON remains bounded independently of occurrence count;
- one findings page size is fixed;
- one occurrence page size is fixed;
- list endpoints execute a bounded number of DB queries independent of row count;
- no artifact PDF/object read occurs for mere metadata availability;
- browser interaction does not create all occurrence DOM nodes;
- filters do not download the whole dataset first.

Record response size/query count/time in tests. Set concrete thresholds only
after baseline measurement in the implementation branch, then keep them as
regression budgets.

---

# 11. Small-site behavior

Performance architecture must not make a five-page audit feel bureaucratic.

- same summary;
- first findings page may contain all rows when below page size;
- no empty pagination controls;
- hidden expert/technical sections stay collapsed;
- no queue/quality chart for a single finished item;
- actions remain direct.

---

# 12. Frontend component boundaries

The current large prospect/audit route components should be decomposed by
stable data/interaction responsibility, not by arbitrary visual fragments.

Good boundaries include:

- control summary;
- active work/queue;
- evidence summary;
- findings browser;
- report review;
- lineage/history;
- capability-driven action panel.

Each receives a bounded contract and owns its loading/error state.

Do not introduce a giant global client store. URL state remains appropriate for
search/filter/page selection so reload/back work naturally.

---

# 13. Long URLs and high-cardinality evidence

Never render a 700-character evidence URL/selector as an unbreakable table
column.

Use:

- CSS wrapping/truncation with accessible full value;
- copy action;
- details disclosure;
- normalized display host/path where full value is not the primary fact.

The full evidence value remains available when needed. Visual truncation must
not change stored/report evidence.

---

# 14. Concurrency and snapshot consistency

List/history pages may be eventually fresh within their polling/fetch cycle.
Commands never trust that snapshot for safety; 061 state tokens/rechecks apply.

For multi-query control summaries, avoid impossible combinations caused by
independent reads:

- use a single store/session transaction/snapshot where supported and necessary;
- or include owner revisions/digests and reject internally inconsistent
  composition;
- never manufacture “ready” from a mix of pre- and post-transition rows.

If a snapshot cannot be composed consistently, return a retryable typed
`snapshot-changing` state rather than a confident false claim.

---

# 15. Migration

## Phase 1 — measure and add new bounded endpoints

- instrument query count/response size in tests;
- add attention count/page;
- add active work/queue separate from history;
- add audit control summary;
- add findings/occurrence paging.

Do not remove old routes yet.

## Phase 2 — migrate pages

- À traiter → bounded attention;
- Audits active panel → active-work endpoint;
- Audits history/search/KPIs → server history/aggregates;
- audit detail → control summary + lazy findings/report/history;
- prospect detail → bounded audit/event histories where growth warrants it.

## Phase 3 — narrow legacy endpoints

After callers move:

- stop spreading full job documents;
- remove full findings from primary detail;
- remove artifact existence reads from summary paths;
- delete obsolete client-side global filtering/KPI derivation.

## Phase 4 — verify production-shaped fixture

Run Point-France and small-site fixtures through browser workflows before
promoting.

---

# 16. Accessibility implications

- server pagination must preserve table semantics;
- filter changes announce result count;
- loading does not flash a false zero;
- pagination has labelled controls/current page;
- keyboard focus is not lost on page/filter refresh;
- row navigation uses actual links;
- no virtualization unless a later implementation proves equivalent keyboard/
  assistive behavior;
- truncated evidence has accessible full value/copy affordance.

Plan 064 owns detailed tests.

---

# 17. Security/privacy

- summary DTOs omit raw evidence/client content by default;
- paged evidence endpoints require the same authenticated operator boundary;
- query text is escaped/validated; Mongo regex inputs use existing safe escaping
  or equivalent;
- no arbitrary sort/property injection;
- response contracts cannot expose object-store keys/secrets;
- candidate/report metadata uses opaque IDs, while download authorization
  resolves server-side.

---

# 18. Adversarial matrix

| Scenario | Required result |
| --- | --- |
| 10 prospects | No pagination clutter; exact attention count. |
| 10,000 prospects, 12 need attention | Attention query/page touches bounded candidate work, not every prospect each poll. |
| 5,000 audit history rows | Search/filter/count is global server truth, not latest-200 truth. |
| 8 active jobs + 5,000 history | Active queue payload remains small. |
| Point-France 30k occurrences | Audit summary size stays essentially unchanged. |
| Finding with 5k occurrences | Occurrence pages bounded; no giant DOM. |
| Object store slow | Audit summary still renders report metadata without downloading PDFs. |
| Poll fails | Last good state remains with stale/error marker. |
| Filter changes quickly | Old request is aborted/ignored; no results from wrong filter flash. |
| State changes between summary subqueries | Snapshot consistency check prevents impossible ready/failed combination. |
| Multi-tab command from stale history row | 061 command recheck rejects safely. |

---

# 19. Verification matrix

## Store/API

- query-count assertions on small and Point-France fixtures;
- server filtering/paging/count correctness beyond 200 rows;
- index/explain snapshots for critical queries;
- no N+1;
- control-summary response-size budget;
- finding/occurrence fixed page-size tests;
- no artifact store read in summary/list code path.

## Contract

- Zod/runtime validation for every critical operator response;
- server/browser enum parity;
- unknown version/code fails loudly and safely;
- raw persistence-only fields cannot appear in DTO snapshots.

## Browser

- pagination/search/back/reload;
- preserved filters in URL;
- active polling does not reset history page;
- loading keeps prior values instead of false zero;
- Point-France fixture interaction remains responsive;
- mobile/zoom tables remain usable.

## Regression

- exact global KPI when >200 histories;
- attention count when >page size;
- audit summary with zero, hundreds and tens of thousands of occurrences;
- prospect with long re-audit history.

---

# 19.1 Numeric performance budgets

"Bounded", "small" and "responsive" are not acceptance criteria. These are the
initial hard budgets for the Point-France-scale committed fixture; tightening
is allowed, loosening requires a plan amendment with measured evidence:

- audit control-summary JSON: **<= 256 KiB** serialized;
- active-work/attention polling response: **<= 128 KiB** serialized per
  endpoint;
- finding/occurrence/history page: **<= 100 rows** and **<= 256 KiB**
  serialized;
- audit control-summary/list read: **<= 20 database queries** per request on
  the scale fixture, with **zero N+1 growth** as row count increases;
- summary/list paths: **zero object-store/PDF byte reads**;
- browser renders at most the requested server page; it may not fetch hidden
  remainder pages merely to compute totals/search locally.

Store these thresholds in one committed
`dashboard-performance-budgets` artifact consumed by tests rather than
copying magic numbers across suites. CI fails on a budget regression.

Wall-clock latency is recorded for comparison but is not a hard CI threshold
because shared-runner timing is noisy; query count, bytes, rows and forbidden
I/O are the deterministic closure gates.


# 20. Fail-closed conditions

A control surface must not claim a global count/state when:

- the query is intentionally truncated;
- one required authority failed to load;
- contract validation fails;
- multi-source snapshot versions cannot be reconciled;
- a legacy adapter cannot establish the requested semantic state.

Show unavailable/stale/partial explicitly rather than zero/ready.

---

# 21. Explicitly rejected alternatives

- “Just raise the 200 limit.”
- Loading all prospects to compute the inbox forever.
- Loading every finding/occurrence then virtualizing in React.
- Client-side global search over a capped response.
- A giant GraphQL layer for this internal app.
- Elasticsearch/full-text infrastructure before indexed Mongo queries are insufficient.
- WebSockets/SSE without measured need.
- One enormous endpoint containing every detail to reduce request count.
- Fetching PDF bytes to answer whether a report is available.
- Exposing Mongoose documents directly as stable API contracts.
- Premature generic caching infrastructure.

---

# 22. Definition of done

Plan 063 is implemented when:

1. À traiter/attention no longer polls every active prospect;
2. Audits global filters/KPIs/history remain correct beyond 200 rows;
3. active queue/work has its own small polling contract;
4. audit control summary does not contain the full finding/occurrence dataset;
5. findings, occurrences and growing lineage are server-paged/lazy;
6. report metadata rendering does not require PDF/object reads;
7. critical operator responses are runtime validated and parity-tested;
8. browser code no longer reconstructs domain truth from raw persistence shapes;
9. query counts and response sizes are bounded by contract and regression-tested;
10. Point-France and small-site fixtures both remain clear/responsive;
11. pagination/filter UX is keyboard-accessible and preserves state;
12. no endpoint hides truncation behind a global-looking number;
13. every scale-critical endpoint satisfies the committed numeric query/
    payload/page/I-O budgets and the requirement-to-proof ledger is complete.
