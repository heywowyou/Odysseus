# M9 Technical Specification

Companion to `m9-prospecting-pipeline.md`, which covers the strategy and the funnel. This document covers architecture, data model, and build details.

Status: design spec, not yet implemented.

---

## 1. Storage decision: MongoDB, single system of record

**Decision: all prospect, prescan, scoring, and outreach data lives in MongoDB. The editing surface is `packages/interface`. Notion and external CRMs are not used for prospect data.**

### Why not Notion

1. **Single-point deletion.** Prospect records hold nominative professional emails and named publication directors, which is personal data. The published 90-day deletion policy, the 3-year retention limit, and opt-out handling all require reliable erasure. Two systems means two erasure paths, and the one you forget is the one that gets you.
2. **The data is derived.** Scores are a function of a scoring model version. Rescoring 15,000 records regenerates them. A mirror is stale the moment the model changes, and reconciling a human edit against a regenerated field is the hard case in every two-way sync.
3. **Subprocessor surface.** Notion means a US subprocessor and a DPA for data already sitting on infrastructure you control, for no capability you do not already have.
4. **Scale profile.** 15,000 prospects, each with prescan findings and evidence references, is past the point where a Notion database is pleasant to work in, and its API throughput makes bulk operations slow.

### Why not a dedicated CRM (Attio, Pipedrive, folk)

Same subprocessor and sync arguments, plus monthly cost, plus the fact that a CRM models a sales pipeline with multiple humans in it. You are one person handling roughly 5 to 10 replies a week. The pipeline management problem is small; the data problem is the interesting one, and it is already in Mongo.

### Where Notion still earns its place

Nowhere on this project, given `docs/` in the repo is already the pattern for locked decisions and future Claude Code sessions read from there. Do not split the knowledge base.

---

## 2. Infrastructure

### The cluster

**Migrate to a single Atlas cluster in an EU region (Paris or Frankfurt). Local Docker MongoDB becomes dev-only.**

Reasons:
- The send worker needs to run on a schedule at consistent times of day. A WSL2 box that sleeps is not a scheduler, and drifting send times are a deliverability signal.
- Prescan workers stay local, because Chromium wants the beefy machine, and write to Atlas over the network. This workload is low write volume and latency-insensitive.
- The MCP readonly user already exists on Atlas, so the review workflow keeps working.
- EU region matters: you are storing French business contact data.

### Runtime split

| Component | Where | Why |
|---|---|---|
| Sourcing ingest | local, on demand | one-off plus quarterly refresh |
| Qualification filter | local | cheap, no browser |
| Prescan workers | local (WSL2) | Chromium and Playwright already tuned here |
| Preview generation | local, pushes to object storage | runs with the prescan |
| Send worker | small VPS (Hetzner class, ~5 EUR/month) | needs reliable cron and stable outbound |
| IMAP reply watcher | same VPS | needs to be always on |
| Interface | local, Tailscale for mobile | no-auth by design preserved by the network boundary |
| Preview pages | object storage behind `odysseusaudit.com/apercu/*` | no DB dependency at the public edge |

The VPS is the only new spend and it is the only piece that must not be on the laptop. Everything else can stay local.

### Object storage

Evidence screenshots and generated preview HTML go to Vercel Blob or Cloudflare R2. **Not GridFS.** Content-addressed keys. Mongo stores references only, so the cluster stays small and cheap.

---

## 3. Package layout

Fits the existing pnpm workspace. Two new packages, three extended.

### `packages/core` (extended)

New contract files, added to the `ask` rule list in `.claude/settings.json` alongside `findings.ts`, `severity.ts`, and `llm-output.ts`:

- `prospect.ts` — the establishment record shape, provenance, contact, consent state
- `prescan.ts` — prescan result shape, distinct from `findings.ts`, because a prescan is not an audit
- `outreach.ts` — sequence state machine states and transitions

Keeping these locked matters more here than elsewhere: a silent shape change in `outreach.ts` is how you double-send to a prospect who already replied.

### `packages/prospecting` (new)

Pure and near-pure logic, heavily unit tested, no I/O in the core functions:

- `sources/` — one adapter per source (DATAtourisme, Atout France, Sirene, Overpass). Each returns a normalised partial record plus provenance.
- `join.ts` — dedupe on registrable domain, fuzzy establishment matching on name plus postcode
- `qualify.ts` — the cheap filter, returns pass or a typed rejection reason
- `score.ts` — `scoreBrokenness()` and `scoreCapacity()`, both pure, both versioned

`score.ts` is a pure deterministic function in the same sense as `assessObligations()`. No UI control writes a score directly. Manual judgement enters as an evidence flag on the prospect and the scorer runs unchanged over it.

### `packages/scanner` (extended)

New entry point `prescan()`, sharing the Chromium instance but **not** the full audit pipeline:

- 3 pages maximum
- axe-core only, no Lighthouse
- Metrics collected directly via CDP and `PerformanceObserver`: LCP, CLS, transfer size, request count, third-party request count, total blocking time
- Booking engine fingerprinting (Availpro, Reservit, D-EDGE, Mews, SynXis, Cloudbeds and others), stored per prescan for the vendor channel
- Evidence capture: render diff pair plus one annotated crop

Guard this boundary in review. The temptation to reuse the audit path with a `mode: 'prescan'` flag is exactly how prescan drifts back to multi-minute runs.

### `packages/outreach` (new)

- `contacts.ts` — mentions legales and contact page extraction, verification client
- `preview.ts` — generates the static preview HTML plus compressed evidence, pushes to object storage, registers the token
- `sequence.ts` — the state machine, pure transitions
- `send.ts` — SMTP transport with the safety rails in section 7
- `inbox.ts` — IMAP watcher, reply and bounce detection
- `suppression.ts` — the blocklist, read path used as a hard precondition on every send

### `packages/store` (extended)

New Mongoose models, section 4.

### `packages/interface` (extended)

New routes, section 6. Same `node:http` router, same server-rendered template functions, Nocturne tokens.

### `packages/cli` (extended)

```
odysseus prospects ingest --source datatourisme
odysseus prospects qualify --limit 5000
odysseus prospects prescan --limit 200 --concurrency 6
odysseus prospects score --rescore-all
odysseus outreach preview --prospect <id>
odysseus outreach queue --date today
odysseus outreach send --dry-run
```

Every command supports `--dry-run` and `--limit`. No exceptions.

---

## 4. Collections

### `prospects`

The establishment. One per registrable domain.

- identity: registrable domain, establishment name, SIRET, NAF, commune, department
- enrichment: star rating, declared capacity, employee band, group affiliation
- provenance: array of `{ source, sourceId, retrievedAt, licence }` — needed to demonstrate loyal collection
- qualification: pass or typed rejection reason, evaluated at
- contact: `{ email, kind: 'nominative' | 'generic', discoveredFrom, verifiedAt, verificationResult }`
- state: the outreach state machine position
- retention: `expiresAt`, set to last contact plus 3 years, with a TTL index

### `prescans`

Immutable, one document per scan run. Never updated, only superseded. Keeps score history honest and lets you diff a rescan against the original.

- prospect ref, scannedAt, scannerVersion
- pages scanned, findings, metrics
- booking engine fingerprint, first-party or third-party
- evidence refs: object storage keys for the render diff pair and the crop

### `scores`

Separate from prescans, because scoring changes more often than scanning.

- prospect ref, prescan ref, `scoringVersion`
- brokenness score plus per-component breakdown
- capacity score plus per-component breakdown
- selection decision and the rule version that produced it

Rescoring writes new documents. It never mutates old ones. The interface shows the current version and can diff against the previous, which is how you find out whether a scoring change actually improved selection.

### `outreach_threads`

One per prospect per campaign.

- state, state history with timestamps
- touches: array of `{ sequenceStep, sentAt, messageId, mailbox, subject, bodyHash }`
- replies: array of `{ receivedAt, messageId, inReplyTo, rawRef, suggestedSentiment, confirmedSentiment, confirmedBy }`
- bounces, with DSN class

Store `messageId` on send. Reply matching depends on it.

### `suppressions`

Append only. Never deleted, never expired.

- `emailHash` (SHA-256 of the normalised address), not the address itself
- `domainHash`
- reason: `opt_out` | `hard_bounce` | `manual` | `complaint`
- suppressedAt, source

**Storing hashes rather than addresses is deliberate.** It lets the blocklist outlive the prospect record. When a prospect is erased at the 3-year mark or on request, the suppression entry survives and still prevents re-contact on the next quarterly source refresh. Storing the plaintext address forever in order to never contact it is the contradiction every blocklist runs into; hashing resolves it.

### `previews`

- token (high entropy, opaque), prospect ref
- generatedAt, expiresAt (30 days), storage key
- loads: array of dates only. Day granularity, no time, no IP, no user agent. Deliberate minimisation, and it keeps the signal on the right side of the pixel question.

---

## 5. Sequence state machine

States:

```
sourced
  -> qualified
  -> prescanned
  -> scored
  -> selected
  -> contact_found
  -> preview_generated
  -> approved          <- manual gate, see section 7
  -> e1_sent
  -> e2_sent
  -> e3_sent
  -> closed_no_reply
```

Terminal interrupts, reachable from any state after `e1_sent`:

```
replied_positive | replied_neutral | replied_negative
opted_out | bounced | suppressed | manually_closed
```

**Every interrupt is terminal for the automated sequence.** There is no path from `replied_*` back into `e2_sent`. This is the single most important invariant in M9. A follow-up sent to someone who already replied is the fastest way to lose a 1,600 EUR sale and to look like a bot.

Enforce it in two places, not one:
1. As a transition guard in `sequence.ts` (pure, unit tested exhaustively)
2. As a hard precondition re-read immediately before the SMTP handoff in `send.ts`

The second check is not redundant. The window between queue construction and actual send is where a reply arrives, and re-reading state at the last moment is what closes it.

### Idempotency

The send worker must be crash-safe and **at-most-once**, not at-least-once. A missed email costs nothing. A duplicate costs the prospect.

Reuse the per-origin lock pattern already in the job queue, keyed per prospect. Write a `sending` marker with a send token before the SMTP call, confirm after. On worker restart, any `sending` record older than the timeout is marked `send_uncertain` and surfaced in the interface for a human decision, never auto-retried.

### Rate limiting

Daily quota is a database counter keyed on `{ mailbox, date }`, not an in-memory value, so it survives restarts. Randomised 3 to 8 minute intervals between sends, jittered. Hard ceiling per mailbox from the warmup schedule, read from config, not hardcoded.

---

## 6. Interface routes

Server-rendered in the existing `node:http` router, Nocturne tokens, same template function pattern. No client framework.

| Route | Purpose |
|---|---|
| `/prospects` | filterable list: score bands, sector, department, state |
| `/prospects/:id` | provenance, prescan findings, evidence, **score breakdown with the why per component**, contact, outreach timeline |
| `/prospects/:id/preview` | the generated preview exactly as the prospect will see it |
| `/queue/today` | the day's send list, with per-item approve or skip |
| `/replies` | detected replies awaiting sentiment confirmation |
| `/suppressions` | search by hash of an entered address |
| `/scoring` | trigger rescore, diff current version against previous |
| `/vendors` | booking engine fingerprints ranked by recurring defect, the agency channel view |

The score breakdown page matters more than it sounds. When reply rate underperforms, the question is always "is the scoring model wrong or is the copy wrong", and you can only answer it if you can see why a given prospect scored what it scored.

### Mobile

Tailscale on the WSL2 box, interface bound to the tailnet interface. The network boundary is the authentication, so `no-auth by design` survives unchanged. Note that `tailscaled` in WSL2 needs `--tun=userspace-networking` and a systemd or startup shim; budget half a day. If that proves annoying, the fallback is to skip mobile entirely and rely on automatic reply detection, which removes most of the reason to want it.

---

## 7. Safety rails

These are the parts where a bug is not a bug but an incident.

### Manual approve gate on E1

**Every first touch is approved by a human before it sends. Follow-ups send automatically.**

At 8 to 12 first touches a day this costs about ten minutes and it is very likely the difference between 1% and 3%. It also means a scoring or template regression cannot silently mail 200 hotels. Automate everything up to the send button, and nothing past it.

### Live-send guard

```
if (process.env.OUTREACH_LIVE !== '1') -> transport is a logging no-op
```

Default off. The test suite must be structurally incapable of sending real mail, not merely configured not to. Run the full sequence against Mailpit locally, including reply and bounce parsing.

### Suppression as a precondition, not a filter

`send.ts` reads the suppression list as a hard precondition on every single send, on the address and on the domain. Not at queue construction. Not as a list subtraction. A precondition immediately before SMTP.

### Domain allowlist in dev

Non-production configurations refuse to send to anything outside an explicit test domain list. This prevents the fixture-data-with-real-emails accident.

### Bounce reaction

Hard bounce writes to suppressions immediately, flags the verification vendor, and if the daily hard bounce rate crosses 2% the send worker pauses itself and surfaces an alert rather than continuing. Deliverability damage compounds; a paused worker is cheap.

### Opt-out endpoint

`/desinscription?t={token}` in `packages/site`, plus a POST handler for `List-Unsubscribe-Post` one-click. Both write the same suppression record. Must work with JavaScript disabled, and must complete in one click with no confirmation step, because the CNIL expectation is one click and a second step is a defect.

---

## 8. Where the LLM is and is not used

Consistent with the existing architecture rule: deterministic components decide, the LLM explains and drafts.

**Allowed:**
- Drafting the one specific observation sentence in E1, selected from templates in `packages/reference`, given the deterministic prescan findings
- Suggesting a reply sentiment classification, presented in the interface as a **suggestion the human confirms**, never written directly to `confirmedSentiment`
- Translating preview copy

**Not allowed:**
- Producing or adjusting any score
- Asserting legal scope, in the preview or in any email
- Generating a statistic. Preview copy draws from `packages/reference` or omits, same rule as the paid report.
- Deciding whether to send

Same `mistral-large-latest`, temperature 0.2, strict `json_schema`.

---

## 9. Testing

- Source adapters: fixture files per source, snapshot the normalised output
- Join and dedupe: fixtures with known-hard cases (same hotel in two sources with different spellings, group with 12 SIRETs on one domain)
- Scoring: table-driven, exhaustive over component combinations, snapshot the breakdown so a scoring change shows up as a visible diff
- State machine: exhaustive transition tests including every interrupt from every reachable state
- Send path: Mailpit, full sequence, reply injection, bounce injection
- Preview generation: golden-file HTML, plus an axe-core self-pass on the preview page (it would be embarrassing otherwise)
- **Language regression:** French-only assertion on all preview and email output, given English strings leaking into French reports is a known recurring regression. Add the test here from the start rather than after it happens again.

---

## 10. Build order and estimate

Each stage its own Claude Code session in plan mode.

| Stage | Content | Rough effort |
|---|---|---|
| 9.0 | Atlas migration, VPS provisioning, Tailscale | 1 day |
| 9.1 | Core contracts, `prospects` and `suppressions` models, retention TTL | 1 day |
| 9.2 | Source adapters, join, dedupe | 2 to 3 days |
| 9.3 | Qualification filter | half day |
| 9.4 | Prescan path in scanner, no Lighthouse | 2 days |
| 9.5 | Evidence capture, render diff and annotated crop | 2 days |
| 9.6 | Scoring, versioned, with breakdown | 1 to 2 days |
| 9.7 | Contact discovery and verification | 1 day |
| 9.8 | Preview generation and object storage serving | 2 days |
| 9.9 | Compliance surfaces: opt-out, privacy notice, balancing-test doc | 1 day |
| 9.10 | Sequence state machine and send worker with all rails | 3 days |
| 9.11 | IMAP reply and bounce watcher | 1 to 2 days |
| 9.12 | Interface routes | 3 days |
| 9.13 | Outcome tracking and the 100-send analysis view | 1 day |

Roughly 4 to 5 weeks of focused solo work.

**9.9 must ship before 9.10.** The opt-out endpoint and privacy notice being live is a precondition for the first send, not a follow-up task.

**9.0 runs first, and the domain and mailbox warmup from the pipeline doc starts the same day.** The six-week warmup clock and this four-to-five-week build run in parallel, which is roughly the only reason the timeline works.
