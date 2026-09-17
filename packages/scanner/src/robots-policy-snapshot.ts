/**
 * Versioned robots policy for one evidence epoch (plan 059 sections 3.7, 5.3
 * and 8).
 *
 * A full audit can run for hours. The robots.txt read in its first minute is
 * a fact about that minute, not a licence for the rest of the run, and the
 * recovery and mobile phases that come later are exactly where a stale
 * permissive snapshot would quietly authorise requests the site has since
 * forbidden. So the epoch keeps a chain of snapshots rather than one, and
 * every snapshot stays in it.
 *
 * The chain is evaluated as an intersection: a path is fetchable only if
 * every snapshot taken so far allows it, and the effective delay is the
 * largest any of them asked for. That is deliberately stricter than "obey the
 * latest", and it avoids having to define which of two robots files is
 * "stricter" in general - a question with no total ordering, since a file can
 * tighten one subtree while loosening another.
 *
 * The consequence of the intersection rule is that a mid-run *loosening* does
 * not widen the audit. That is intended. Admitting pages halfway through
 * under rules the earlier pages were never eligible for would produce a
 * coverage set that no single policy explains, and the next epoch picks the
 * wider scope up cleanly.
 *
 * Evidence already captured under an earlier snapshot keeps its timestamp and
 * its snapshot reference. A policy that tightens mid-run stops further
 * requests; it does not retroactively invalidate what was lawfully collected
 * before it existed (section 8).
 */

import { canonicalDigest } from '@odysseus/core';
import { createHash } from 'node:crypto';
import { isAllowedByRobots, robotsProductToken, type RobotsRules } from './robots.js';

export const ROBOTS_POLICY_SNAPSHOT_VERSION = 'robots-policy-v1';

export interface RobotsPolicySnapshot {
  version: typeof ROBOTS_POLICY_SNAPSHOT_VERSION;
  evidenceEpoch: number;
  /** 0 is the snapshot taken at scan start; each revalidation increments. */
  revision: number;
  origin: string;
  /** The identity the policy was matched for. Recorded because a policy read
   *  for one product token says nothing about another (section 8: never
   *  change the user agent to bypass a rule). */
  userAgent: string;
  productToken: string;
  /** null when robots.txt was unreachable, which robots.ts treats as
   *  allow-all. Kept verbatim so a later dispute can be settled against the
   *  exact bytes rather than the parse. */
  robotsText: string | null;
  robotsTextDigest: string;
  retrievedAt: string;
  rules: RobotsRules;
  /** What this snapshot alone asks for: the configured floor raised to the
   *  crawl-delay directive where there is one. */
  requestedDelayMs: number;
  digest: string;
}

export interface RobotsPolicySnapshotInput {
  evidenceEpoch: number;
  revision: number;
  origin: string;
  userAgent: string;
  robotsText: string | null;
  retrievedAt: Date;
  rules: RobotsRules;
  /** The operator/config delay, which robots can raise but never lower. */
  configuredDelayMs: number;
}

export function buildRobotsPolicySnapshot(input: RobotsPolicySnapshotInput): RobotsPolicySnapshot {
  const body = {
    version: ROBOTS_POLICY_SNAPSHOT_VERSION,
    evidenceEpoch: input.evidenceEpoch,
    revision: input.revision,
    origin: input.origin,
    userAgent: input.userAgent,
    productToken: robotsProductToken(input.userAgent),
    robotsText: input.robotsText,
    robotsTextDigest: `sha256:${createHash('sha256')
      .update(input.robotsText ?? '')
      .digest('hex')}`,
    retrievedAt: input.retrievedAt.toISOString(),
    rules: input.rules,
    requestedDelayMs: Math.max(input.configuredDelayMs, input.rules.crawlDelayMs ?? 0),
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

/** The epoch's snapshots in the order they were taken, oldest first. */
export type RobotsPolicyChain = readonly RobotsPolicySnapshot[];

/**
 * Whether a path may be requested now. Every snapshot must allow it, so a
 * path disallowed by any revalidation stops being fetchable from that moment
 * on, and one that only a later, looser file permits never becomes fetchable
 * within this epoch.
 */
export function isPathAllowedForEpoch(chain: RobotsPolicyChain, pathname: string): boolean {
  return chain.every((snapshot) => isAllowedByRobots(snapshot.rules, pathname));
}

/**
 * The delay every request in this epoch must respect: the largest any
 * snapshot asked for. Monotonic by construction, which is what section 8
 * means by an effective delay that is never reduced.
 */
export function effectiveCrawlDelayMs(chain: RobotsPolicyChain): number {
  return chain.reduce((largest, snapshot) => Math.max(largest, snapshot.requestedDelayMs), 0);
}

/** Every Sitemap: directive seen across the epoch, de-duplicated in first-seen
 *  order. Collected from the whole chain because a revalidation can add one. */
export function epochSitemapUrls(chain: RobotsPolicyChain): readonly string[] {
  return [...new Set(chain.flatMap((snapshot) => snapshot.rules.sitemapUrls))];
}

export interface RobotsRevalidationDecision {
  due: boolean;
  reason: 'no-snapshot' | 'interval-elapsed' | 'phase-boundary' | 'not-due';
}

export interface RobotsRevalidationOptions {
  /** How long a snapshot is trusted before a long run must re-read it. */
  intervalMs: number;
  /** True when the run is crossing into a new acquisition phase - mobile
   *  surfaces, recovery, diagnostics. Phase boundaries revalidate regardless
   *  of elapsed time, since they are where new request patterns begin. */
  atPhaseBoundary?: boolean;
}

/**
 * Whether the epoch owes robots.txt another read before its next request.
 *
 * Time-based and phase-based, not request-count-based: the risk being managed
 * is the site changing its mind while we are not looking, which tracks
 * wall-clock, not how many pages happened to be in the frontier.
 */
export function shouldRevalidateRobots(
  chain: RobotsPolicyChain,
  now: Date,
  options: RobotsRevalidationOptions,
): RobotsRevalidationDecision {
  const latest = chain.at(-1);
  if (latest === undefined) return { due: true, reason: 'no-snapshot' };
  if (options.atPhaseBoundary === true) return { due: true, reason: 'phase-boundary' };
  const elapsedMs = now.getTime() - new Date(latest.retrievedAt).getTime();
  if (elapsedMs >= options.intervalMs) return { due: true, reason: 'interval-elapsed' };
  return { due: false, reason: 'not-due' };
}

export interface RobotsPolicyTransition {
  changed: boolean;
  /** Paths from the sample that this epoch may no longer request. */
  newlyDisallowed: readonly string[];
  /** Paths the new file permits that the epoch still refuses, because the
   *  intersection rule does not widen scope mid-run. Recorded so the coverage
   *  ledger can explain the gap rather than leave it unaccounted for. */
  stillRefusedDespiteLoosening: readonly string[];
  delayIncreasedToMs?: number;
}

/**
 * Describes what a revalidation changed, against the paths the run actually
 * cares about. Sampled rather than exhaustive because robots patterns describe
 * an infinite path space; the caller passes the inventory it holds.
 */
export function describeRobotsPolicyTransition(
  chain: RobotsPolicyChain,
  next: RobotsPolicySnapshot,
  samplePaths: readonly string[],
): RobotsPolicyTransition {
  const previous = chain.at(-1);
  if (previous === undefined) {
    return { changed: true, newlyDisallowed: [], stillRefusedDespiteLoosening: [] };
  }
  const newlyDisallowed = samplePaths.filter(
    (path) => isPathAllowedForEpoch(chain, path) && !isAllowedByRobots(next.rules, path),
  );
  const stillRefusedDespiteLoosening = samplePaths.filter(
    (path) => !isPathAllowedForEpoch(chain, path) && isAllowedByRobots(next.rules, path),
  );
  const previousDelay = effectiveCrawlDelayMs(chain);
  const nextDelay = Math.max(previousDelay, next.requestedDelayMs);
  return {
    changed: previous.robotsTextDigest !== next.robotsTextDigest,
    newlyDisallowed,
    stillRefusedDespiteLoosening,
    ...(nextDelay > previousDelay ? { delayIncreasedToMs: nextDelay } : {}),
  };
}
