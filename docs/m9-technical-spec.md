# M9 Technical Specification

Companion to `m9-prospecting-pipeline.md`. Status: design spec, added
2026-08-25, not yet implemented.

**This document as pasted proposes two new packages, `packages/prospecting`
and `packages/outreach`. Decided against, 2026-08-25** (operator call,
recorded here and in CLAUDE.md's build order): that would make ten
packages against CLAUDE.md's eight-package ceiling, and the ceiling
protects a real thing - each existing package's boundary is enforced by
the pnpm/tsc import graph precisely because something outside it is
forbidden from doing what's inside (`llm` is the only package that talks
to Mistral, `interface` is the only one that binds a network port).
Outreach has no constraint of that shape; the one candidate for it
(outreach must never import `core`'s `selectReferenceStats`/
`REFERENCE_STAT_TABLE`, trade-off 16) is already enforced today by
documentation and tests, the same mechanism a new package would not add
anything to. It also assumes a fresh build: milestones 9a and 9b already
shipped prospecting inside the existing packages -
`packages/core/src/prospecting/qualify-prospect.ts` and
`packages/core/src/types/prospecting.ts`;
`packages/store/src/prospects.ts`, `prospect-ingestion-checkpoint.ts`, and
their schemas; `packages/interface/src/prospecting/`,
`routes/prospecting.ts`, and the queue jobs; `packages/cli/src/commands/
prospect.ts`. Any collection, schema, or route named below that overlaps
one of those needs to be reconciled against the real shipped shape, not
assumed to start from zero.

Decided mapping, matching the precedent 9a/9b already set: fold the
sourcing/prescan/scoring/outreach logic from this spec into `core` (pure
functions and types), `store` (new collections alongside the existing
`prospects`/`prospect_ingestion_checkpoints`), `interface` (new job types
alongside the existing prospecting queue and its worker-pool pattern,
including the send job and safety-rail enforcement), and `cli` (new
subcommands alongside `odysseus prospect`) - not `packages/prospecting`
and `packages/outreach`. Revisit only if outreach ever needs to run as an
independently deployable process with its own crash domain and
credentials, which nothing in this spec currently requires. Check new
contract file paths against `.claude/settings.json`'s `permissions.ask`
list before they are created; it does not yet cover any of them.

Original document follows, unmodified in substance, package names as
proposed by the source spec.

---

## 1. Data model

### `prospects` (canonical registry, one row per business)

```typescript
interface Prospect {
  _id: ObjectId;
  domain: string;              // eTLD+1, unique index
  legalName?: string;
  siret?: string;
  siren?: string;
  nafCode?: string;
  establishmentType: 'independent' | 'group-member' | 'chain';
  groupDomain?: string;        // if group-member, the parent domain

  sourcing: {
    sources: Array<{ source: string; retrievedAt: Date; licence: string }>;
    firstSeenAt: Date;
  };

  sizeSignals: {
    starRating?: number;
    roomCount?: number;
    effectifBand?: string;     // Sirene tranche
    turnoverKnown: false;      // stock file has no turnover; explicit, never guessed
  };

  contact?: {
    email?: string;
    emailSource: 'mentions-legales' | 'contact-page' | 'footer' | 'manual';
    verifiedAt?: Date;
    verificationStatus: 'syntax-ok' | 'mx-ok' | 'catch-all' | 'unverified';
    phoneNumber?: string;      // establishment line only, never a guessed mobile
  };

  qualification: {
    status: 'pending' | 'qualified' | 'rejected' | 'parked' | 'already-engaged';
    rejectedReason?: string;
    qualifiedAt?: Date;
  };

  retention: {
    lastContactedAt?: Date;
    expiresAt?: Date;          // lastContactedAt + 3 years, enforced by a scheduled job
  };

  createdAt: Date;
  updatedAt: Date;
}
```

### `prescans` (one per prescan run, many per prospect over time)

```typescript
interface Prescan {
  _id: ObjectId;
  prospectId: ObjectId;
  runAt: Date;

  pagesScanned: Array<{
    url: string;
    role: 'homepage' | 'booking' | 'content';
    axeFindingCount: number;
    lcpMs?: number;
    clsScore?: number;
    transferBytes?: number;
    requestCount?: number;
    thirdPartyRequestCount?: number;
    mainThreadBlockingMs?: number;
  }>;

  bookingEngine?: {
    vendor: string;            // 'availpro' | 'reservit' | 'd-edge' | 'mews' | 'synxis' | 'cloudbeds' | 'first-party' | 'none'
    fingerprint: string;       // how it was detected, for the vendor-pattern rollup
  };

  evidence: {
    renderDiffScreenshotRef?: string;   // relative path, same convention as audit screenshots
    annotatedFailureScreenshotRef?: string;
    findingSummary: string;             // 3-5 concrete findings, plain text, no legal framing
  };

  scores: {
    brokenness: number;
    abilityToPay: number;
    computedAt: Date;
  };

  selectionDecision: 'selected' | 'not-selected';
  selectionReason: string;
}
```

### `outreach_previews` (the public preview page content, keyed by opaque token)

```typescript
interface OutreachPreview {
  _id: ObjectId;
  token: string;              // high-entropy, unique index, not derived from domain
  prospectId: ObjectId;
  prescanId: ObjectId;

  content: {
    findings: Array<{ text: string; criterion?: string }>; // criteria/observations only, never a legal conclusion
    renderDiffScreenshotRef: string;
    annotatedFailureScreenshotRef: string;
  };

  publishedAt: Date;
  expiresAt: Date;            // publishedAt + 30 days
  loadedAt?: Date[];          // append-only, date only per entry, no time-of-day
}
```

### `outreach_threads` (sequence state machine, one per prospect per campaign)

```typescript
interface OutreachThread {
  _id: ObjectId;
  prospectId: ObjectId;
  previewId: ObjectId;
  mailbox: string;             // which sending mailbox owns this thread

  state: 'queued' | 'e1-sent' | 'e2-sent' | 'e3-sent' | 'replied' | 'suppressed' | 'closed';

  touches: Array<{
    step: 'e1' | 'e2' | 'e3';
    sentAt: Date;
    bounced: boolean;
  }>;

  reply?: {
    receivedAt: Date;
    sentiment: 'positive' | 'not-now' | 'negative' | 'opt-out';
  };

  outcome?: 'no-reply' | 'reply' | 'call' | 'quoted' | 'won' | 'lost';
  lostReason?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

### `suppressions` (permanent blocklist, never deleted)

Distinct from `outreach_threads.state === 'suppressed'`: this collection
is the enforcement point every send checks against, independent of any
one thread's history, so an opt-out survives a prospect record being
re-ingested on a future sourcing refresh.

```typescript
interface Suppression {
  _id: ObjectId;
  email: string;               // normalized, unique index
  domain: string;
  reason: 'opt-out' | 'bounce' | 'complaint' | 'manual';
  suppressedAt: Date;
}
```

---

## 2. Sequence state machine

```
queued --(send E1)--> e1-sent --(4 days, no reply)--> [send E2] --> e2-sent
                          |                                            |
                       (reply)                                   (11 days, no reply)
                          v                                            v
                       replied                                  [send E3] --> e3-sent
                                                                        |
                                                                     (reply)
                                                                        v
                                                                     replied

any state --(opt-out or hard bounce)--> suppressed --> closed
replied --(operator resolves)--> closed
```

Implementation: a single scheduled job (reuse the existing queue worker
pattern already in `packages/interface`, one more job type) scans
`outreach_threads` where `state` is a non-terminal value and the next
touch's scheduled time has passed, sends the next touch, and advances
state. Every send checks `suppressions` and the thread's own bounce
history immediately before dispatch, not only at enqueue time, since a
suppression can land between when a thread was queued and when its
touch fires.

## 3. Safety rails

Enforced in code, not by operator discipline alone:

- A send is refused if the recipient email or domain appears in
  `suppressions`. Check happens inside the send function itself, not only
  in the job that schedules it, so a manual send path cannot bypass it.
- A send is refused if the destination mailbox has exceeded its daily cap
  (25 to 30 including follow-ups) for the current day, checked against a
  count of `outreach_threads.touches` for that mailbox since local
  midnight.
- A send is refused if less than a randomised 3 to 8 minute interval has
  elapsed since that mailbox's last send.
- Preview pages are generated with `noindex, nofollow` headers and listed
  in `robots.txt`'s `Disallow`, enforced by a test that fetches a real
  generated preview page and asserts the header, not by convention.
- `outreach_previews.expiresAt` is enforced by the same serving path that
  reads the collection, returning 410 past expiry, not by a separate
  cleanup job that could silently stop running.
- No tracking pixel, no third-party script, and no cookie may ship on a
  preview page. Enforce with a test that parses the generated HTML and
  fails on any `<script src>` outside the page's own origin, any
  `document.cookie` write, or any embedded 1x1 image.

## 4. Build order and estimate

Superseded by `m9-prospecting-pipeline.md` section 12's renumbering
(9.1 through 9.10), which explicitly accounts for the overlap with
9a/9b. The original 9.0-9.13 numbering from this spec's first draft is
dropped in favour of that list; do not resurrect it.
