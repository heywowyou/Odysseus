/**
 * The register of every URL one evidence epoch ever heard of, and what
 * happened to each one (plan 059 sections 3.2, 3.3, 5.4 and 6).
 *
 * The failure this exists to prevent is the quiet gap. A crawl that stops at
 * `maxPages`, drops a PDF on its extension, refuses a robots-disallowed path,
 * or never gets around to a link that hydration revealed late all end the same
 * way in today's artifacts: the URL simply is not in the page list, and
 * nothing anywhere states that it was ever known. Plan 059 section 2 defines
 * perfect evidence as "zero known unexplained material measurement gap", which
 * is only a checkable claim if there is one place that holds every known
 * candidate and forces each of them to end in exactly one recorded, named
 * outcome. That place is this ledger.
 *
 * Two properties carry the weight.
 *
 * The first is monotonicity. A candidate row is created once and from then on
 * only accumulates: discovering the same page a second time through the
 * sitemap after finding it through a link adds a second discovery source, it
 * does not replace the first and it does not create a second row. Losing that
 * first route is how a coverage question becomes unanswerable later - "was
 * this page linked, or only declared?" is exactly the kind of thing a report's
 * sitemap-orphan claim rests on. For the same reason a terminal disposition is
 * write-once: re-disposing throws, and a genuinely changed outcome has to go
 * through `supersedeDisposition`, which keeps the original and demands a
 * justification. Silence is the thing being designed against, so the awkward
 * path is the one that overwrites.
 *
 * The second is that a disposition names a cause, not just an absence. Site
 * state and our own measurement failure are different facts (section 1
 * decision 3), so `http-error-status` and `error` are separate dispositions
 * with separate outcomes and never collapse into one "failed page" bucket. The
 * outcome class is derived from the disposition rather than supplied
 * alongside it, so the two can never disagree about what a candidate's fate
 * meant.
 *
 * Page-cap and depth-bound omissions are deliberately the same kind of thing
 * here (section 3.3). A page left unscanned because the frontier hit
 * `maxDepth` is exactly as unscanned as one left at `maxPages`, and treating
 * the depth case as harmless is a rejected alternative in section 22.
 * `assessTruncation` answers the one question that matters about both - did an
 * implementation bound hide eligible pages - and delegates the verdict to
 * `isScopeTruncationDisclosable`, because whether that is a disclosable
 * limitation or a blocking defect depends on who set the bound, which only the
 * scope snapshot knows.
 *
 * The ledger does not normalize URLs. Callers hand in an identity that
 * `links.ts` has already canonicalized, the same division of labour
 * `AuditScopeSnapshot` uses; a discovery may record the raw spelling it
 * actually saw so that a trailing-slash merge stays auditable.
 */

import {
  canonicalDigest,
  isScopeTruncationDisclosable,
  type AuditScopeSnapshot,
} from '@odysseus/core';

export const INVENTORY_LEDGER_VERSION = 'inventory-ledger-v1';

/**
 * How a candidate became known. The rendered/hydrated pair are kept apart
 * from plain `link` because section 3.2's bounded discovery fixed point turns
 * on them: a URL that only ever appeared after hydration is evidence that the
 * static frontier was incomplete, and a coverage claim that cannot see that
 * distinction cannot explain why a second wave was needed.
 */
export type InventoryDiscoverySource =
  | 'start'
  | 'link'
  | 'rendered-link'
  | 'hydrated-link'
  | 'hreflang'
  | 'seed'
  | 'sitemap'
  | 'redirect'
  /** Recovery provenance for a visited page restored from a stale or older
   *  checkpoint whose inventory omitted the page. This is intentionally not
   *  called `link`: the ledger must disclose that the original discovery route
   *  was unavailable rather than inventing one. */
  | 'visited-page-recovery';

/**
 * The one terminal fate of a candidate. Every member names its cause, because
 * a coverage ledger that records only "not scanned" cannot tell an operator
 * exclusion from a scanner crash.
 *
 * `link-discovery-only` is the existing `discovered-not-scanned` case: fetched
 * to read its links, deliberately never scanned. `http-error-status` is the
 * site answering non-2xx, which is a fact about the site; `error` is our own
 * navigation or measurement failing, which is a fact about the run. Keeping
 * them separate is section 1 decision 3.
 */
export type InventoryDisposition =
  | 'scanned'
  | 'link-discovery-only'
  | 'robots'
  | 'non-html'
  | 'external'
  | 'http-error-status'
  | 'blocked'
  | 'redirect'
  | 'relative-link-nesting'
  | 'error'
  | 'page-cap'
  | 'depth-bound'
  | 'continuation-guard'
  /** Issue #566: the discovery waves' per-referring-page cap on links first
   *  seen on its state surfaces. */
  | 'surface-link-bound'
  /** Issue #566: the discovery waves' own budget ended before the link's
   *  turn. */
  | 'discovery-wave-bound'
  | 'network-safety'
  | 'operator-excluded';

/** What a disposition meant for coverage, as opposed to why it happened. */
export type InventoryOutcome =
  'scanned' | 'discovered-not-scanned' | 'omitted' | 'site-error' | 'scan-failed';

/** Derived, never supplied, so a candidate cannot claim an outcome its
 *  disposition does not support. */
const DISPOSITION_OUTCOMES: Readonly<Record<InventoryDisposition, InventoryOutcome>> = {
  scanned: 'scanned',
  'link-discovery-only': 'discovered-not-scanned',
  robots: 'omitted',
  'non-html': 'omitted',
  external: 'omitted',
  'http-error-status': 'site-error',
  blocked: 'site-error',
  redirect: 'omitted',
  'relative-link-nesting': 'omitted',
  error: 'scan-failed',
  'page-cap': 'omitted',
  'depth-bound': 'omitted',
  'continuation-guard': 'omitted',
  'surface-link-bound': 'omitted',
  'discovery-wave-bound': 'omitted',
  'network-safety': 'omitted',
  'operator-excluded': 'omitted',
};

export function inventoryOutcomeOf(disposition: InventoryDisposition): InventoryOutcome {
  return DISPOSITION_OUTCOMES[disposition];
}

/** The two dispositions that mean "this page was eligible and we simply ran
 *  out of our own budget", mapped to the scope bound that caused each. Nothing
 *  else in the union is an implementation bound: the continuation guard is a
 *  deliberate anti-explosion rule with its own disclosure, and robots and
 *  network safety are refusals we would not lift at any budget. */
const TRUNCATION_BOUNDS = {
  'page-cap': 'maxPages',
  'depth-bound': 'maxDepth',
} as const satisfies Partial<Record<InventoryDisposition, 'maxPages' | 'maxDepth'>>;

export interface InventoryDiscoveryRecord {
  source: InventoryDiscoverySource;
  discoveredAt: string;
  /** The page this candidate was found on. Absent for `start`, `seed` and
   *  `sitemap`, which have no referring page. */
  referrer?: string;
  /** The `ScanSurface` the link was read from, where one applies. A rendered
   *  or hydrated discovery without a surface cannot be reproduced, so the
   *  fixed-point argument in section 6 needs this to be recorded at the moment
   *  of discovery rather than reconstructed afterwards. */
  surfaceId?: string;
  /** Frontier depth at which this route reached the candidate. Routes can
   *  disagree; each keeps its own, so a depth-bound omission can be explained
   *  against the shallowest route actually available. */
  depth?: number;
  /** The exact spelling seen, recorded only when it differed from the
   *  normalized identity, so a trailing-slash or case merge stays auditable
   *  instead of looking like a page nobody ever linked to. */
  observedUrl?: string;
}

export interface InventoryDispositionRecord {
  disposition: InventoryDisposition;
  outcome: InventoryOutcome;
  decidedAt: string;
  /** Where the request actually ended when it differed from the candidate
   *  identity: the redirect target, or the final URL after a chain. */
  finalUrl?: string;
  httpStatus?: number;
  /** Human-readable specifics - the robots pattern that matched, the refused
   *  address reason, the navigation error. Not a substitute for the
   *  disposition itself, which stays machine-checkable. */
  detail?: string;
  /** Opaque references into the attempt ledger and the raw evidence snapshot.
   *  The ledger stores them without interpreting them: what an attempt
   *  contains is `CheckAttempt`'s contract (section 5.8), not this one's. */
  attemptRefs: readonly string[];
  evidenceRefs: readonly string[];
}

/** A disposition that was later replaced, kept beside its replacement with the
 *  reason it stopped being true. Section 5.4's monotonicity rule means a
 *  correction adds a row here; it never edits history in place. */
export interface SupersededDispositionRecord extends InventoryDispositionRecord {
  supersededAt: string;
  justification: string;
}

export interface InventoryCandidate {
  /** The normalized identity, and the ledger's key. */
  url: string;
  discoveries: readonly InventoryDiscoveryRecord[];
  disposition?: InventoryDispositionRecord;
  superseded: readonly SupersededDispositionRecord[];
}

/** Plain JSON, no Maps or class instances, so it survives a
 *  JSON.stringify/parse round trip unchanged and can ride in a checkpoint. */
export interface InventoryLedgerSnapshot {
  ledgerVersion: typeof INVENTORY_LEDGER_VERSION;
  evidenceEpoch: number;
  /** The scope this inventory was gathered under. A ledger and a scope
   *  snapshot that disagree here describe two different audits and must never
   *  be reconciled against each other. */
  scopeDigest: string;
  candidates: InventoryCandidate[];
}

export interface InventoryReconciliation {
  /** True only when every known candidate has a terminal disposition. This is
   *  the section 2 gate: an audit with an un-dispositioned candidate has a
   *  known gap it cannot explain, whatever else it measured. */
  reconciled: boolean;
  candidateCount: number;
  dispositionedCount: number;
  /** The candidates still owed an answer, in ledger order. */
  unreconciledUrls: readonly string[];
}

export interface InventoryTruncationAssessment {
  /** Whether an implementation bound left eligible pages unscanned at all. */
  truncated: boolean;
  /**
   * `none` when nothing was cut. `disclosable` when every bound that cut was
   * one the operator set deliberately, or the run was not a paid full audit.
   * `blocking` when a shipped default silently shrank a full audit, which
   * section 3.3 refuses to let pass as a limitation.
   */
  status: 'none' | 'disclosable' | 'blocking';
  pageCapOmittedUrls: readonly string[];
  depthBoundOmittedUrls: readonly string[];
  /** The bounds that cut and may be reported as a known limitation. */
  disclosableBounds: readonly ('maxPages' | 'maxDepth')[];
  /** The bounds that cut and must block approval until the scope is widened
   *  or the operator narrows it on purpose. */
  blockingBounds: readonly ('maxPages' | 'maxDepth')[];
}

export interface InventoryLedgerInit {
  evidenceEpoch: number;
  scopeDigest: string;
}

export interface RecordDiscoveryInput {
  /** Already normalized by the caller, which owns URL identity. */
  url: string;
  source: InventoryDiscoverySource;
  discoveredAt: Date;
  referrer?: string;
  surfaceId?: string;
  depth?: number;
  observedUrl?: string;
}

export interface RecordDispositionInput {
  url: string;
  disposition: InventoryDisposition;
  decidedAt: Date;
  finalUrl?: string;
  httpStatus?: number;
  detail?: string;
  attemptRefs?: readonly string[];
  evidenceRefs?: readonly string[];
}

export interface SupersedeDispositionInput extends RecordDispositionInput {
  /** Why the earlier terminal answer stopped being true - a recovery pass
   *  that succeeded, an operator resolution. Required, because an unexplained
   *  supersession is indistinguishable from the silent overwrite this ledger
   *  exists to prevent. */
  justification: string;
}

interface CandidateState {
  url: string;
  discoveries: InventoryDiscoveryRecord[];
  disposition?: InventoryDispositionRecord;
  superseded: SupersededDispositionRecord[];
}

function toDispositionRecord(input: RecordDispositionInput): InventoryDispositionRecord {
  return {
    disposition: input.disposition,
    outcome: inventoryOutcomeOf(input.disposition),
    decidedAt: input.decidedAt.toISOString(),
    ...(input.finalUrl !== undefined ? { finalUrl: input.finalUrl } : {}),
    ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
    attemptRefs: [...(input.attemptRefs ?? [])],
    evidenceRefs: [...(input.evidenceRefs ?? [])],
  };
}

/**
 * One instance per evidence epoch. Never shared across epochs: a candidate's
 * dispositions were decided under one frozen scope and one robots policy
 * chain, and mixing two epochs' inventories produces a coverage set that no
 * single declaration of scope explains.
 */
export class InventoryLedger {
  private readonly evidenceEpoch: number;
  private readonly scopeDigest: string;
  private readonly rows = new Map<string, CandidateState>();

  constructor(init: InventoryLedgerInit) {
    this.evidenceEpoch = init.evidenceEpoch;
    this.scopeDigest = init.scopeDigest;
  }

  /**
   * Registers one route to a candidate. Idempotent per route and additive
   * across routes: a URL found again by another source gains a discovery
   * record, keeping every route that led to it. The candidate row, and any
   * disposition already on it, are untouched - a page that was refused by
   * robots does not become pending again because the sitemap also declares it.
   */
  recordDiscovery(input: RecordDiscoveryInput): InventoryCandidate {
    const discovery: InventoryDiscoveryRecord = {
      source: input.source,
      discoveredAt: input.discoveredAt.toISOString(),
      ...(input.referrer !== undefined ? { referrer: input.referrer } : {}),
      ...(input.surfaceId !== undefined ? { surfaceId: input.surfaceId } : {}),
      ...(input.depth !== undefined ? { depth: input.depth } : {}),
      ...(input.observedUrl !== undefined && input.observedUrl !== input.url
        ? { observedUrl: input.observedUrl }
        : {}),
    };
    const existing = this.rows.get(input.url);
    if (existing === undefined) {
      const created: CandidateState = { url: input.url, discoveries: [discovery], superseded: [] };
      this.rows.set(input.url, created);
      return created;
    }
    // Deduplicate only an exact repeat of the same route, which the crawl
    // produces whenever a page links to another page twice. A second route
    // that merely shares a source - the same URL linked from two pages - is
    // new provenance and is kept.
    const alreadyKnown = existing.discoveries.some(
      (known) =>
        known.source === discovery.source &&
        known.referrer === discovery.referrer &&
        known.surfaceId === discovery.surfaceId,
    );
    if (!alreadyKnown) existing.discoveries.push(discovery);
    return existing;
  }

  /**
   * Gives a known candidate its one terminal answer.
   *
   * Throws for an unknown URL - a disposition for something never discovered
   * means the caller has a candidate this ledger does not, which is precisely
   * the divergence reconciliation is meant to catch - and throws rather than
   * overwriting when the candidate is already terminal. Use
   * `supersedeDisposition` when an outcome genuinely changed.
   */
  recordDisposition(input: RecordDispositionInput): InventoryCandidate {
    const row = this.requireRow(input.url, 'dispose');
    if (row.disposition !== undefined) {
      throw new Error(
        `InventoryLedger: ${input.url} is already disposed as '${row.disposition.disposition}'; use supersedeDisposition to record a changed outcome instead of overwriting it.`,
      );
    }
    row.disposition = toDispositionRecord(input);
    return row;
  }

  /**
   * Replaces a terminal disposition and keeps the one it replaced, with the
   * reason. The normal source is targeted recovery (section 10): a page that
   * ended as `error` and then succeeded on a later attempt has genuinely
   * changed outcome, and the audit trail must show both answers rather than
   * only the flattering one.
   */
  supersedeDisposition(input: SupersedeDispositionInput): InventoryCandidate {
    const row = this.requireRow(input.url, 'supersede the disposition of');
    const previous = row.disposition;
    if (previous === undefined) {
      throw new Error(
        `InventoryLedger: ${input.url} has no disposition to supersede; record one with recordDisposition.`,
      );
    }
    row.superseded.push({
      ...previous,
      supersededAt: input.decidedAt.toISOString(),
      justification: input.justification,
    });
    row.disposition = toDispositionRecord(input);
    return row;
  }

  candidate(url: string): InventoryCandidate | undefined {
    return this.rows.get(url);
  }

  /** Every known candidate, sorted by identity so that two ledgers holding
   *  the same inventory read the same way regardless of crawl order. */
  candidates(): readonly InventoryCandidate[] {
    return [...this.rows.values()].sort((left, right) => (left.url < right.url ? -1 : 1));
  }

  /**
   * Candidates still owed a terminal answer. Any un-dispositioned candidate is
   * by construction one the run still considers eligible: ineligibility is
   * only ever established by disposing it as robots, external, excluded and
   * so on, so nothing drops out of this set without leaving a record of why.
   */
  pendingCandidateUrls(): readonly string[] {
    return this.candidates()
      .filter((candidate) => candidate.disposition === undefined)
      .map((candidate) => candidate.url);
  }

  /**
   * Section 6's bounded discovery fixed point: true when an acquisition wave
   * left no eligible candidate waiting. The fixed point is what lets a run
   * stop looking for more pages honestly, rather than because the frontier
   * happened to empty first.
   */
  isDiscoveryFixedPointReached(): boolean {
    return this.pendingCandidateUrls().length === 0;
  }

  reconcile(): InventoryReconciliation {
    const unreconciledUrls = this.pendingCandidateUrls();
    return {
      reconciled: unreconciledUrls.length === 0,
      candidateCount: this.rows.size,
      dispositionedCount: this.rows.size - unreconciledUrls.length,
      unreconciledUrls,
    };
  }

  /**
   * Whether this ledger left eligible pages unscanned because of our own page
   * or depth bound, and whether that may be disclosed or must block.
   *
   * Only the two bound dispositions count. They are assigned by the frontier
   * to pages it had already judged in scope and fetchable, so their presence
   * is the direct statement that budget, not the site or policy, is why those
   * pages have no evidence.
   */
  assessTruncation(scope: AuditScopeSnapshot): InventoryTruncationAssessment {
    const omittedBy = (disposition: InventoryDisposition): string[] =>
      this.candidates()
        .filter((candidate) => candidate.disposition?.disposition === disposition)
        .map((candidate) => candidate.url);

    const pageCapOmittedUrls = omittedBy('page-cap');
    const depthBoundOmittedUrls = omittedBy('depth-bound');
    const cuttingBounds: ('maxPages' | 'maxDepth')[] = [];
    if (pageCapOmittedUrls.length > 0) cuttingBounds.push(TRUNCATION_BOUNDS['page-cap']);
    if (depthBoundOmittedUrls.length > 0) cuttingBounds.push(TRUNCATION_BOUNDS['depth-bound']);
    const disclosableBounds = cuttingBounds.filter((bound) =>
      isScopeTruncationDisclosable(scope, bound),
    );
    const blockingBounds = cuttingBounds.filter(
      (bound) => !isScopeTruncationDisclosable(scope, bound),
    );

    return {
      truncated: cuttingBounds.length > 0,
      status:
        cuttingBounds.length === 0
          ? 'none'
          : blockingBounds.length > 0
            ? 'blocking'
            : 'disclosable',
      pageCapOmittedUrls,
      depthBoundOmittedUrls,
      disclosableBounds,
      blockingBounds,
    };
  }

  snapshot(): InventoryLedgerSnapshot {
    return {
      ledgerVersion: INVENTORY_LEDGER_VERSION,
      evidenceEpoch: this.evidenceEpoch,
      scopeDigest: this.scopeDigest,
      candidates: this.candidates().map((candidate) => ({
        url: candidate.url,
        discoveries: [...candidate.discoveries],
        ...(candidate.disposition !== undefined ? { disposition: candidate.disposition } : {}),
        superseded: [...candidate.superseded],
      })),
    };
  }

  digest(): string {
    return inventoryLedgerDigest(this.snapshot());
  }

  /**
   * Restores a checkpointed ledger. Refuses a snapshot written by another
   * ledger version: its rows were produced under different rules about what a
   * disposition means, and a restored run that silently reinterprets them
   * would report coverage nobody ever measured.
   */
  static fromSnapshot(snapshot: InventoryLedgerSnapshot): InventoryLedger {
    if (snapshot.ledgerVersion !== INVENTORY_LEDGER_VERSION) {
      throw new Error(
        `InventoryLedger: snapshot version ${snapshot.ledgerVersion} does not match this code's ${INVENTORY_LEDGER_VERSION}; refusing to restore.`,
      );
    }
    const ledger = new InventoryLedger({
      evidenceEpoch: snapshot.evidenceEpoch,
      scopeDigest: snapshot.scopeDigest,
    });
    for (const candidate of snapshot.candidates) {
      ledger.rows.set(candidate.url, {
        url: candidate.url,
        discoveries: [...candidate.discoveries],
        ...(candidate.disposition !== undefined ? { disposition: candidate.disposition } : {}),
        superseded: [...candidate.superseded],
      });
    }
    return ledger;
  }

  private requireRow(url: string, action: string): CandidateState {
    const row = this.rows.get(url);
    if (row === undefined) {
      throw new Error(
        `InventoryLedger: cannot ${action} ${url}, which was never discovered; record its discovery first so the inventory keeps every candidate it answers for.`,
      );
    }
    return row;
  }
}

/**
 * Content address of an inventory. Computed from the snapshot, whose candidate
 * order is by identity rather than by discovery order, so two runs that found
 * the same inventory agree on the digest even if their frontiers scheduled it
 * differently. Discovery order *within* a candidate is preserved and does
 * count: which route found a page first is a fact about the site's link
 * graph.
 */
export function inventoryLedgerDigest(snapshot: InventoryLedgerSnapshot): string {
  return canonicalDigest(snapshot);
}
