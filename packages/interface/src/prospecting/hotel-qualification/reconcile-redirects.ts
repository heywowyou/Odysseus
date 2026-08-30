/**
 * Re-decides the qualification rows whose declared website redirected
 * somewhere else, and writes the result as a new complete generation.
 *
 * ## Why this is a second pass rather than a fix inside qualify-hotels.ts
 *
 * The evidence that separates a chain from a rename is how many
 * establishments arrive at the landing domain. That is a property of the
 * whole run, and the qualification pass is deliberately streamed in pages of
 * 200 across concurrent lanes - it never has the run in hand. So the decision
 * is taken here, over the verdicts already stored, in the same order
 * trade-off 33 requires of group detection: count everything first, classify
 * nothing until the counting is done.
 *
 * ## Why it does not re-probe the whole catalogue
 *
 * The redirect targets are already on disk as `siteFacts.finalUrl`. Only the
 * rows being adopted need a fresh look, because only they are about to be
 * qualified on a domain nobody has checked. Measured 2026-08-28 that is 312
 * requests, not 13,301, and the 81-minute full run does not have to happen
 * again.
 *
 * ## Why every untouched verdict is copied forward
 *
 * `listCandidatesToPrescan` filters on `qualification.qualificationVersion`.
 * A v2 generation containing only the reconciled rows would silently shrink
 * the prescan population from thousands to a few hundred, and the shrink
 * would look like a correct filter rather than a bug. A version means one
 * complete pass over the catalogue, so copy-forward is not bookkeeping - it
 * is what makes the version true.
 */

import {
  classifyRedirectTarget,
  normalizeDeclaredWebsite,
  qualifyHotelCandidate,
  type HotelQualificationOutcome,
  type HotelSiteFacts,
} from '@odysseus/core';
import type {
  HotelCandidateDocument,
  HotelQualificationDocument,
  RecordHotelQualificationInput,
  RedirectReclassification,
} from '@odysseus/store';
import { factsFor, type HotelSiteChecker } from './qualify-hotels.js';
import { toLanes } from '../to-lanes.js';

export const RECONCILE_BATCH_SIZE = 200;

/** The reasons a v1 row was given because of where its redirect landed.
 *  `domain-moved` is here only because v1's retired same-name heuristic
 *  emitted it; nothing writes it any more. */
const REDIRECT_REASONS = new Set(['redirect-offsite', 'domain-moved']);

export interface ReconcileRedirectsStorePort {
  /** One page of the source generation, ordered by candidateId. */
  listQualifications(options: {
    qualificationVersion: string;
    limit: number;
    after?: string;
  }): Promise<HotelQualificationDocument[]>;
  /** Establishments already declaring each of these domains as their own. */
  countCandidatesByOwnDomain(options: {
    resolutionVersion: string;
    domains: readonly string[];
  }): Promise<Map<string, number>>;
  getCandidates(candidateIds: readonly string[]): Promise<HotelCandidateDocument[]>;
  applyReclassifications(inputs: readonly RedirectReclassification[]): Promise<{ applied: number }>;
  record(inputs: RecordHotelQualificationInput[]): Promise<unknown>;
}

export interface ReconcileRedirectsOptions {
  store: ReconcileRedirectsStorePort;
  checkSite: HotelSiteChecker;
  resolutionVersion: string;
  /** Generation being read. */
  fromVersion: string;
  /** Generation being written. Must differ from `fromVersion`: a version is
   *  one rule set's complete verdict, and rewriting a generation in place
   *  would make an earlier comparison silently describe two different rules. */
  toVersion: string;
  /** Maximum adopted domains to re-probe this run. The classification and the
   *  copy-forward are free; this bounds the only part that contacts anybody. */
  limit?: number;
  concurrency: number;
  dryRun: boolean;
  onProgress?: (reprobed: number) => void;
}

export interface ReconcileRedirectsReport {
  resolutionVersion: string;
  fromVersion: string;
  toVersion: string;
  dryRun: boolean;
  /** Rows read from the source generation. */
  rowsRead: number;
  /** Rows carrying a redirect verdict, which are the only ones re-decided.
   *  Includes the rows with no usable landing URL, so this is the whole
   *  population the pass considered and byVerdict sums to it. */
  redirectRows: number;
  /** Distinct registrable targets behind those rows. */
  distinctTargets: number;
  byVerdict: {
    'own-moved-domain': number;
    'shared-target': number;
    'vendor-or-federation': number;
    /** No usable landing URL was recorded, so there is nothing to classify.
     *  The v1 rejection stands. */
    'no-target': number;
  };
  /** Domains actually re-probed. Zero on a dry run. */
  domainsReprobed: number;
  /** What the re-probed rows became. Zero everywhere on a dry run: a plan
   *  reports the work, never an outcome nobody observed. */
  adoptedOutcomes: Record<HotelQualificationOutcome, number>;
  /** Verdicts carried into the new generation unchanged. */
  copiedForward: number;
  /** Rows written to the new generation. Equals rowsRead when the run was not
   *  limited, which is the property that makes the new version complete. */
  rowsWritten: number;
  plan?: ReconcileRedirectsPlan;
}

export interface ReconcileRedirectsPlan {
  /** Domains a real run would fetch: one request each, plus robots.txt. */
  wouldReprobe: number;
  /** Rows a real run would write. */
  wouldWrite: number;
}

interface RedirectRow {
  row: HotelQualificationDocument;
  target: string;
}

function emptyOutcomes(): Record<HotelQualificationOutcome, number> {
  return { qualified: 0, parked: 0, rejected: 0, 'already-engaged': 0, 'group-routed': 0 };
}

function hasRedirectReason(row: HotelQualificationDocument): boolean {
  return row.reasons.some((reason) => REDIRECT_REASONS.has(reason));
}

/** The registrable domain a row's redirect landed on, or null when the row
 *  recorded no usable landing URL. */
function targetOf(row: HotelQualificationDocument): string | null {
  const finalUrl = row.siteFacts.finalUrl;
  if (typeof finalUrl !== 'string' || finalUrl === '') return null;
  const resolved = normalizeDeclaredWebsite(finalUrl);
  return resolved.kind === 'unusable' ? null : resolved.registrableDomain;
}

export async function reconcileRedirects(
  options: ReconcileRedirectsOptions,
): Promise<ReconcileRedirectsReport> {
  if (options.fromVersion === options.toVersion) {
    throw new Error(
      'odysseus: reconcile-redirects must write a new qualification version, not rewrite ' +
        `'${options.fromVersion}' in place`,
    );
  }

  // Pass one: read the whole source generation. Nothing is classified here,
  // because nothing can be until every target has been counted.
  const allRows: HotelQualificationDocument[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await options.store.listQualifications({
      qualificationVersion: options.fromVersion,
      limit: RECONCILE_BATCH_SIZE,
      ...(after === undefined ? {} : { after }),
    });
    if (page.length === 0) break;
    allRows.push(...page);
    after = page[page.length - 1]?.candidateId;
    if (page.length < RECONCILE_BATCH_SIZE) break;
  }

  const redirectRows: RedirectRow[] = [];
  let noTarget = 0;
  for (const row of allRows) {
    if (!hasRedirectReason(row)) continue;
    const target = targetOf(row);
    if (target === null) {
      noTarget += 1;
      continue;
    }
    redirectRows.push({ row, target });
  }

  // Pass two: count. Establishments arriving at a target, plus establishments
  // already declaring it - see countCandidatesByOwnDomain for why the second
  // half is not optional.
  const arrivals = new Map<string, number>();
  for (const { target } of redirectRows) {
    arrivals.set(target, (arrivals.get(target) ?? 0) + 1);
  }
  const declaredOwners = await options.store.countCandidatesByOwnDomain({
    resolutionVersion: options.resolutionVersion,
    domains: [...arrivals.keys()],
  });
  const establishmentsAt = (target: string): number =>
    (arrivals.get(target) ?? 0) + (declaredOwners.get(target) ?? 0);

  // Pass three: classify. Every row now, so the counts below describe the
  // whole population rather than whatever a --limit happened to reach.
  const byVerdict = {
    'own-moved-domain': 0,
    'shared-target': 0,
    'vendor-or-federation': 0,
    'no-target': noTarget,
  };
  const toAdopt: RedirectRow[] = [];
  const toRoute: { row: RedirectRow; groupStatus: 'group-member' | 'vendor-hosted' }[] = [];
  for (const entry of redirectRows) {
    const verdict = classifyRedirectTarget({
      target: entry.target,
      establishmentsAtTarget: establishmentsAt(entry.target),
    });
    byVerdict[verdict] += 1;
    if (verdict === 'own-moved-domain') toAdopt.push(entry);
    else {
      toRoute.push({
        row: entry,
        groupStatus: verdict === 'vendor-or-federation' ? 'vendor-hosted' : 'group-member',
      });
    }
  }

  const bounded = options.limit === undefined ? toAdopt : toAdopt.slice(0, options.limit);

  if (options.dryRun) {
    return {
      resolutionVersion: options.resolutionVersion,
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      dryRun: true,
      rowsRead: allRows.length,
      redirectRows: redirectRows.length + noTarget,
      distinctTargets: arrivals.size,
      byVerdict,
      domainsReprobed: 0,
      adoptedOutcomes: emptyOutcomes(),
      copiedForward: 0,
      rowsWritten: 0,
      plan: { wouldReprobe: bounded.length, wouldWrite: allRows.length },
    };
  }

  // Routed rows first: they need no request, and recording the group before
  // anything is fetched means an interrupted run still leaves the chain
  // evidence visible rather than losing it.
  const reclassifications: RedirectReclassification[] = toRoute.map(({ row, groupStatus }) => ({
    kind: 'route',
    candidateId: row.row.candidateId,
    groupStatus,
    groupDomain: row.target,
    groupSize: establishmentsAt(row.target),
  }));
  for (const entry of bounded) {
    reclassifications.push({
      kind: 'adopt',
      candidateId: entry.row.candidateId,
      adoptedDomain: entry.target,
      ...(entry.row.domain === null ? {} : { declaredDomain: entry.row.domain }),
    });
  }
  await options.store.applyReclassifications(reclassifications);

  // Re-probe the adopted domains. The candidates are re-read rather than
  // patched in memory, so the decision below sees exactly what the catalogue
  // now says, including the adoption just written.
  const adopted = await options.store.getCandidates(bounded.map((entry) => entry.row.candidateId));
  const adoptedById = new Map(adopted.map((candidate) => [candidate.candidateId, candidate]));
  const probed = new Map<string, { site: HotelSiteFacts; outcome: HotelQualificationOutcome }>();
  const evaluatedAt = new Date();
  const rewritten = new Map<string, RecordHotelQualificationInput>();
  let reprobed = 0;

  await Promise.all(
    toLanes(bounded, options.concurrency).map(async (lane) => {
      for (const entry of lane) {
        const candidate = adoptedById.get(entry.row.candidateId);
        if (candidate === undefined) continue;
        const site = await options.checkSite(entry.target);
        reprobed += 1;
        const result = qualifyHotelCandidate({
          ...factsFor(candidate, site),
          domainAdoptedAfterRedirect: true,
        });
        probed.set(entry.row.candidateId, { site, outcome: result.outcome });
        rewritten.set(entry.row.candidateId, {
          candidateId: entry.row.candidateId,
          resolutionVersion: options.resolutionVersion,
          qualificationVersion: options.toVersion,
          domain: entry.target,
          outcome: result.outcome,
          reasons: result.reasons,
          notes: result.notes,
          siteFacts: site,
          evaluatedAt,
        });
        options.onProgress?.(reprobed);
      }
    }),
  );

  // Routed rows are re-decided too, from the group status just written, so
  // their new verdict comes from the same function every other verdict does.
  const routedCandidates = await options.store.getCandidates(
    toRoute.map((entry) => entry.row.row.candidateId),
  );
  const routedById = new Map(routedCandidates.map((row) => [row.candidateId, row]));
  for (const { row } of toRoute) {
    const candidate = routedById.get(row.row.candidateId);
    if (candidate === undefined) continue;
    const result = qualifyHotelCandidate(factsFor(candidate, row.row.siteFacts));
    rewritten.set(row.row.candidateId, {
      candidateId: row.row.candidateId,
      resolutionVersion: options.resolutionVersion,
      qualificationVersion: options.toVersion,
      domain: row.row.domain,
      outcome: result.outcome,
      reasons: result.reasons,
      notes: result.notes,
      siteFacts: row.row.siteFacts,
      evaluatedAt,
    });
  }

  // Everything else carries over untouched. Written in batches for the same
  // reason it was read in them: this is the whole catalogue.
  const adoptedOutcomes = emptyOutcomes();
  for (const value of probed.values()) adoptedOutcomes[value.outcome] += 1;

  let copiedForward = 0;
  let rowsWritten = 0;
  let batch: RecordHotelQualificationInput[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await options.store.record(batch);
    rowsWritten += batch.length;
    batch = [];
  };

  for (const row of allRows) {
    const replacement = rewritten.get(row.candidateId);
    if (replacement !== undefined) {
      batch.push(replacement);
    } else {
      copiedForward += 1;
      batch.push({
        candidateId: row.candidateId,
        resolutionVersion: options.resolutionVersion,
        qualificationVersion: options.toVersion,
        domain: row.domain,
        outcome: row.outcome,
        reasons: row.reasons,
        notes: row.notes,
        siteFacts: row.siteFacts,
        evaluatedAt: row.evaluatedAt,
      });
    }
    if (batch.length >= RECONCILE_BATCH_SIZE) await flush();
  }
  await flush();

  return {
    resolutionVersion: options.resolutionVersion,
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    dryRun: false,
    rowsRead: allRows.length,
    redirectRows: redirectRows.length + noTarget,
    distinctTargets: arrivals.size,
    byVerdict,
    domainsReprobed: reprobed,
    adoptedOutcomes,
    copiedForward,
    rowsWritten,
  };
}
