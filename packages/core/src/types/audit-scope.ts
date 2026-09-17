/**
 * The immutable declaration of what one full audit was asked to cover
 * (plan 059 sections 5.1 and 6). It is the first artifact of an evidence
 * epoch and the one every later coverage claim is judged against: without a
 * frozen statement of intended scope, "the audit is complete" has nothing to
 * be complete *with respect to*.
 *
 * The part that carries real weight is `bounds`. `AuditConfigSnapshot`
 * already records the effective numbers a run used, but a number alone cannot
 * answer the question plan 059 section 3.3 puts at the centre of the
 * completeness contract: when eligible pages were left unscanned because the
 * crawl hit `maxPages` or `maxDepth`, was that the operator deliberately
 * auditing a smaller site, or the implementation's own default quietly
 * truncating a paid audit? The first is a disclosable limitation. The second
 * is a defect that must block approval. Recording where each bound came from
 * at the moment scope is frozen is the only point where that distinction is
 * still knowable - by the time the crawl stops, both look like "we stopped at
 * N".
 *
 * Depth is treated exactly like page count here, deliberately. A page omitted
 * because the frontier reached `maxDepth` is just as unscanned as one omitted
 * at `maxPages`, and plan 059 section 22 lists treating depth omissions as
 * harmless among its rejected alternatives.
 */

import { canonicalDigest } from '../canonical-digest.js';
import type { ScanIntent, SitemapMode } from './manifest.js';

export const AUDIT_SCOPE_SNAPSHOT_VERSION = 'audit-scope-v1';

/**
 * Where a scope bound came from.
 *
 * `implementation-default` is a value nobody chose for this site - it is
 * whatever the scanner ships with. `operator` means a person narrowed this
 * audit on purpose. Only the second can legitimately leave eligible pages
 * unscanned in a paid full audit.
 */
export type ScopeBoundOrigin = 'implementation-default' | 'operator';

/** Where a seed or exclusion came from, kept so a later coverage gap can name
 *  the decision that caused it rather than reporting an anonymous absence. */
export type ScopeEntryOrigin = 'operator' | 'prospect-record' | 'directory' | 'configuration';

export interface AuditScopeSeed {
  url: string;
  origin: ScopeEntryOrigin;
  /** Free text from the operator where one was given. Shown back when a seed
   *  fails its required-evidence gate, so the refusal can say which seed and
   *  why it was added. */
  reason?: string;
}

export interface AuditScopeExclusion {
  /** Glob, matching what `normalizeInternalLinks` already accepts. */
  pattern: string;
  origin: ScopeEntryOrigin;
  reason?: string;
}

/**
 * A transactional flow the hotel runs somewhere Odysseus will not follow -
 * typically a third-party booking engine on another origin. Declared up front
 * so the coverage ledger can record it as a known first-party boundary rather
 * than discovering an unexplained dead end later.
 */
export interface ExternalTransactionalFlow {
  url: string;
  origin: ScopeEntryOrigin;
  reason?: string;
}

export interface AuditScopeBound {
  value: number;
  origin: ScopeBoundOrigin;
}

/**
 * The effective limits the run will use. Page count and depth carry their
 * origin because they can hide eligible pages; the timing and concurrency
 * settings cannot, so they are plain numbers recorded for reproducibility.
 */
export interface AuditScopeBounds {
  maxPages: AuditScopeBound;
  maxDepth: AuditScopeBound;
  crawlDelayMs: number;
  scanConcurrency: number;
  pageTimeoutMs: number;
  lighthouseTimeoutMs: number;
  renderSettleTimeoutMs: number;
}

export interface AuditScopeSnapshotInput {
  /** Monotonic within one audit. A scope change supersedes the epoch rather
   *  than editing this snapshot, so evidence captured under two different
   *  declarations of scope can never be merged (plan 059 section 5.1). */
  evidenceEpoch: number;
  /** Already normalized by the caller, which owns URL identity. */
  startUrl: string;
  /** Hosts treated as the same first party: the start host plus any alias the
   *  operator declared (a `www.` twin, a legacy domain). A URL on a host that
   *  is not here is off-scope, however it was discovered. */
  hostAliases: readonly string[];
  scanIntent: ScanIntent;
  seeds: readonly AuditScopeSeed[];
  exclusions: readonly AuditScopeExclusion[];
  externalTransactionalFlows: readonly ExternalTransactionalFlow[];
  bounds: AuditScopeBounds;
  sitemapMode: SitemapMode;
  /** BCP-47 tags the operator said the site publishes, where they said so.
   *  Empty means "not declared", which is not the same as "monolingual": an
   *  undeclared language variant is discovered normally. */
  expectedLanguages: readonly string[];
  /** Which `NetworkTargetPolicy` profile governs this run. Part of scope
   *  because the production and test-only profiles admit different targets,
   *  so two runs under different profiles are not comparable evidence. */
  networkPolicyId: string;
}

export interface AuditScopeSnapshot extends AuditScopeSnapshotInput {
  version: typeof AUDIT_SCOPE_SNAPSHOT_VERSION;
  /** Content address of every field above. Later evidence artifacts reference
   *  this rather than copying scope, so a scope edit cannot pass unnoticed. */
  digest: string;
}

/**
 * Freezes a scope declaration and content-addresses it.
 *
 * The digest covers the version and all declared fields. It deliberately does
 * not cover a timestamp: two runs that declare identical scope should produce
 * identical digests, which is what makes the cross-run comparability checks in
 * plan 059 section 16 possible.
 */
export function buildAuditScopeSnapshot(input: AuditScopeSnapshotInput): AuditScopeSnapshot {
  const body = { ...input, version: AUDIT_SCOPE_SNAPSHOT_VERSION } as const;
  return { ...body, digest: canonicalDigest(body) };
}

/** Recomputes the digest and compares, for the resume and read-back paths
 *  that must refuse a scope snapshot edited after it was frozen. */
export function verifyAuditScopeSnapshot(snapshot: AuditScopeSnapshot): boolean {
  const { digest, ...body } = snapshot;
  return canonicalDigest(body) === digest;
}

/**
 * Whether a bound that actually truncated the crawl may be disclosed as a
 * limitation instead of blocking approval.
 *
 * Only an operator-set bound qualifies, and only outside a paid full audit is
 * an implementation default tolerable at all. A quick check is bounded by
 * definition and says so; a paid full audit that silently stopped at the
 * shipped default is the exact failure plan 059 exists to prevent.
 */
export function isScopeTruncationDisclosable(
  snapshot: AuditScopeSnapshot,
  bound: 'maxPages' | 'maxDepth',
): boolean {
  if (snapshot.bounds[bound].origin === 'operator') return true;
  return snapshot.scanIntent !== 'full-audit';
}
