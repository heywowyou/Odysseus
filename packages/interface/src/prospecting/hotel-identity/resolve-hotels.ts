/**
 * Turns one ingest run's immutable source records into canonical hotel
 * candidates: which establishments are independent, which belong to a chain,
 * which sit on someone else's platform, and which a human has to look at.
 *
 * **Two passes, and the order is load bearing.** Whether a domain identifies
 * one hotel or a chain of 872 is a property of the whole run, not of the row in
 * front of you. A single streaming pass would classify the first Accor property
 * as an independent hotel holding `accor.com` and only discover the truth 871
 * rows later, by which time it has already been written. So pass one counts
 * establishments per registrable domain and keeps nothing else; pass two
 * classifies. The counting map is the only thing held in memory, and at a
 * five-figure catalogue it is a few hundred kilobytes.
 *
 * That count is also why a chain property never uses its domain as an identity
 * key. Keying on the domain would merge all 872 Accor properties into one
 * candidate, which is not a deduplication but a deletion of 871 establishments.
 * Only a domain held by exactly one establishment is an identity.
 *
 * The distinction between a chain and a vendor platform is the one plan 002
 * step 5 names, and it is decided by core's curated list rather than by size.
 * Thirty hotels on `logishotels.com` are thirty independent businesses sharing
 * a marketing federation's site; they go to review. Thirty hotels on
 * `campanile.com` are one chain; they are excluded. Both look identical to a
 * counter.
 */

import { randomUUID } from 'node:crypto';
import {
  normalizeDeclaredWebsite,
  normalizeEstablishmentName,
  resolveHotelIdentity,
  type DeclaredWebsiteResolution,
  type DeclaredWebsiteUnusableReason,
  type HotelCandidate,
  type HotelCandidateReview,
  type HotelGroupStatus,
  type HotelIdentityCandidateIndexEntry,
  type HotelIdentityStatus,
  type HotelWebsiteCandidate,
} from '@odysseus/core';
import type { HotelCandidateDocument, HotelSourceRecordDocument } from '@odysseus/store';

/**
 * The persistence this pass needs, and nothing more.
 *
 * A port rather than a Connection because the risk in this file is the two-pass
 * grouping rule, not the database access, and that rule deserves a test that
 * runs anywhere rather than one gated on a Docker container. The Mongo-backed
 * implementation is createMongoHotelCandidateStore below, and the collection
 * semantics it depends on are covered by store's own integration tests.
 *
 * `streamSourceRecords` is called twice per run and must be replayable from the
 * start each time. That is the one contract an implementation can get wrong,
 * so it is stated here rather than left to be discovered.
 */
export interface HotelCandidateStorePort {
  streamSourceRecords(ingestRunId: string): AsyncIterable<HotelSourceRecordDocument>;
  listCandidates(resolutionVersion: string): Promise<HotelCandidateDocument[]>;
  upsert(candidates: HotelCandidate[]): Promise<{ created: number; updated: number }>;
}

export const RESOLVE_BATCH_SIZE = 500;

/** Bumped by hand when a resolution rule changes, never edited in place. A new
 *  version re-resolves from the same source records into a parallel generation
 *  of candidates, so a later comparison of yield between two campaigns is not
 *  silently comparing two different definitions of "independent hotel". */
export const CURRENT_RESOLUTION_VERSION = 'v1';

export interface ResolveHotelsReport {
  ingestRunId: string;
  resolutionVersion: string;
  dryRun: boolean;
  sourceRecordsRead: number;
  websites: {
    ownDomain: number;
    vendorHosted: number;
    unusable: number;
    unusableByReason: Partial<Record<DeclaredWebsiteUnusableReason, number>>;
    noneDeclared: number;
  };
  identity: Record<HotelIdentityStatus, number>;
  groups: {
    byStatus: Record<HotelGroupStatus, number>;
    distinctSharedDomains: number;
    hotelsOnSharedDomains: number;
    largestGroup: { domain: string; size: number } | null;
  };
  review: { queued: number; byReason: Record<string, number> };
  /** Eligible, independent, and holding a domain no other establishment in the
   *  run holds. The number this milestone is measured on. */
  campaignReady: number;
  created: number;
  updated: number;
}

export interface ResolveHotelsOptions {
  store: HotelCandidateStorePort;
  ingestRunId: string;
  resolutionVersion?: string;
  /** Stop after this many source records. */
  limit?: number;
  /** Classify and count without writing anything. */
  dryRun?: boolean;
}

interface Classified {
  websiteCandidate: HotelWebsiteCandidate;
  groupStatus: HotelGroupStatus;
  groupDomain?: string;
  groupSize?: number;
  ownRegistrableDomain?: string;
  queuedReason?: string;
}

/** Decides what one row's declared website means, given what the whole run
 *  knows about how many establishments share each domain. */
function classify(
  resolution: DeclaredWebsiteResolution,
  raw: string,
  source: string,
  sourceId: string,
  establishmentsPerDomain: Map<string, number>,
): Classified {
  if (resolution.kind === 'unusable') {
    return {
      websiteCandidate: {
        raw,
        source,
        sourceId,
        kind: 'unusable',
        unusableReason: resolution.reason,
      },
      groupStatus: 'unknown',
      queuedReason: `declared-website-${resolution.reason}`,
    };
  }

  if (resolution.kind === 'vendor-hosted') {
    const size = establishmentsPerDomain.get(resolution.registrableDomain) ?? 1;
    return {
      websiteCandidate: {
        raw,
        source,
        sourceId,
        kind: 'vendor-hosted',
        hostname: resolution.hostname,
        registrableDomain: resolution.registrableDomain,
        vendor: resolution.vendor,
      },
      groupStatus: 'vendor-hosted',
      groupDomain: resolution.registrableDomain,
      groupSize: size,
      queuedReason: `vendor-hosted-on-${resolution.vendor.domain}`,
    };
  }

  const size = establishmentsPerDomain.get(resolution.registrableDomain) ?? 1;
  const websiteCandidate: HotelWebsiteCandidate = {
    raw,
    source,
    sourceId,
    kind: 'own-domain',
    hostname: resolution.hostname,
    registrableDomain: resolution.registrableDomain,
  };

  if (size > 1) {
    // A corporate domain held by several establishments. Retained and labelled,
    // never deleted: binding decision 5 keeps group evidence visible so one
    // decision does not fan out across a chain unnoticed.
    return {
      websiteCandidate,
      groupStatus: 'group-member',
      groupDomain: resolution.registrableDomain,
      groupSize: size,
    };
  }

  return {
    websiteCandidate,
    groupStatus: 'independent',
    ownRegistrableDomain: resolution.registrableDomain,
  };
}

function emptyIdentityCounts(): Record<HotelIdentityStatus, number> {
  return { resolved: 0, 'needs-review': 0, ambiguous: 0, unmatched: 0 };
}

function emptyGroupCounts(): Record<HotelGroupStatus, number> {
  return { independent: 0, 'group-member': 0, 'vendor-hosted': 0, unknown: 0 };
}

function toIndexEntry(candidate: HotelCandidateDocument): HotelIdentityCandidateIndexEntry {
  const entry: HotelIdentityCandidateIndexEntry = {
    candidateId: candidate.candidateId,
    normalizedName: candidate.normalizedName,
  };
  if (candidate.postcode !== undefined) entry.postcode = candidate.postcode;
  if (candidate.siret !== undefined) entry.siret = candidate.siret;
  if (candidate.siren !== undefined) entry.siren = candidate.siren;
  if (candidate.ownRegistrableDomain !== undefined) {
    entry.ownRegistrableDomain = candidate.ownRegistrableDomain;
  }
  return entry;
}

export async function resolveHotels(options: ResolveHotelsOptions): Promise<ResolveHotelsReport> {
  const { store, ingestRunId } = options;
  const resolutionVersion = options.resolutionVersion ?? CURRENT_RESOLUTION_VERSION;
  const dryRun = options.dryRun ?? false;

  // Pass one: how many establishments hold each registrable domain. Nothing
  // else is kept, so memory stays proportional to distinct domains rather than
  // to the catalogue.
  const establishmentsPerDomain = new Map<string, number>();
  let seen = 0;
  for await (const record of store.streamSourceRecords(ingestRunId)) {
    seen += 1;
    if (options.limit !== undefined && seen > options.limit) break;
    if (record.declaredWebsite === undefined) continue;
    const resolved = normalizeDeclaredWebsite(record.declaredWebsite);
    if (resolved.kind === 'unusable') continue;
    establishmentsPerDomain.set(
      resolved.registrableDomain,
      (establishmentsPerDomain.get(resolved.registrableDomain) ?? 0) + 1,
    );
  }

  // Candidates already stored for this resolution version, so resolving a
  // second ingest run merges into the existing catalogue instead of building a
  // parallel one. Empty on a first run, which is why every observation in that
  // run legitimately comes back `unmatched`.
  const existing = dryRun ? [] : await store.listCandidates(resolutionVersion);
  const index: HotelIdentityCandidateIndexEntry[] = existing.map(toIndexEntry);
  const identityKeyToCandidateId = new Map<string, string>(
    existing.map((candidate) => [candidate.identityKey, candidate.candidateId]),
  );

  const report: ResolveHotelsReport = {
    ingestRunId,
    resolutionVersion,
    dryRun,
    sourceRecordsRead: 0,
    websites: {
      ownDomain: 0,
      vendorHosted: 0,
      unusable: 0,
      unusableByReason: {},
      noneDeclared: 0,
    },
    identity: emptyIdentityCounts(),
    groups: {
      byStatus: emptyGroupCounts(),
      distinctSharedDomains: 0,
      hotelsOnSharedDomains: 0,
      largestGroup: null,
    },
    review: { queued: 0, byReason: {} },
    campaignReady: 0,
    created: 0,
    updated: 0,
  };

  for (const [domain, count] of establishmentsPerDomain) {
    if (count <= 1) continue;
    report.groups.distinctSharedDomains += 1;
    report.groups.hotelsOnSharedDomains += count;
    if (report.groups.largestGroup === null || count > report.groups.largestGroup.size) {
      report.groups.largestGroup = { domain, size: count };
    }
  }

  let batch: HotelCandidate[] = [];
  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    if (!dryRun) {
      const result = await store.upsert(batch);
      report.created += result.created;
      report.updated += result.updated;
    }
    batch = [];
  }

  // Pass two: classify, resolve, and write.
  let read = 0;
  for await (const record of store.streamSourceRecords(ingestRunId)) {
    read += 1;
    if (options.limit !== undefined && read > options.limit) break;
    report.sourceRecordsRead += 1;

    let classified: Classified | null = null;
    if (record.declaredWebsite === undefined) {
      report.websites.noneDeclared += 1;
    } else {
      const resolution = normalizeDeclaredWebsite(record.declaredWebsite);
      classified = classify(
        resolution,
        record.declaredWebsite,
        record.source,
        record.sourceId,
        establishmentsPerDomain,
      );
      if (resolution.kind === 'own-domain') report.websites.ownDomain += 1;
      else if (resolution.kind === 'vendor-hosted') report.websites.vendorHosted += 1;
      else {
        report.websites.unusable += 1;
        report.websites.unusableByReason[resolution.reason] =
          (report.websites.unusableByReason[resolution.reason] ?? 0) + 1;
      }
    }

    const groupStatus = classified?.groupStatus ?? 'unknown';
    const ownRegistrableDomain = classified?.ownRegistrableDomain;
    report.groups.byStatus[groupStatus] += 1;

    const normalizedName = normalizeEstablishmentName(record.name);

    // Only a domain held by exactly one establishment is an identity. A chain
    // property, a vendor-hosted hotel, and a hotel with no usable website are
    // each keyed by their own source row, because nothing else distinguishes
    // them from their neighbours yet.
    const identityKey =
      ownRegistrableDomain !== undefined
        ? `domain:${ownRegistrableDomain}`
        : `source:${record.source}:${record.sourceId}`;

    // The key is computed before the identity search, and a key already in the
    // catalogue short-circuits it. Without this, re-resolving a run makes every
    // source row search an index that already contains the candidate built from
    // that same row, and the row matches itself on name and postcode. Measured
    // against the real national export: a second resolve reported 3,820
    // needs-review links, every one of them a row matching its own candidate.
    const existingCandidateId = identityKeyToCandidateId.get(identityKey);
    const identity =
      existingCandidateId !== undefined
        ? {
            status: 'resolved' as HotelIdentityStatus,
            candidateId: existingCandidateId,
            candidateIds: [existingCandidateId],
            ...(ownRegistrableDomain !== undefined
              ? { matchedOn: { kind: 'own-domain' as const, value: ownRegistrableDomain } }
              : {}),
            conflicts: [],
          }
        : resolveHotelIdentity({
            observation: {
              name: record.name,
              ...(record.postcode !== undefined ? { postcode: record.postcode } : {}),
              ...(ownRegistrableDomain !== undefined ? { ownRegistrableDomain } : {}),
            },
            candidates: index,
          });
    report.identity[identity.status] += 1;

    const queuedReason =
      classified?.queuedReason ??
      (record.declaredWebsite === undefined
        ? 'no-website-declared'
        : identity.status === 'ambiguous'
          ? 'identity-ambiguous'
          : identity.status === 'needs-review'
            ? 'identity-needs-review'
            : undefined);

    const review: HotelCandidateReview =
      queuedReason === undefined ? { state: 'not-required' } : { state: 'pending', queuedReason };
    if (queuedReason !== undefined) {
      report.review.queued += 1;
      report.review.byReason[queuedReason] = (report.review.byReason[queuedReason] ?? 0) + 1;
    }

    const candidateId = identity.candidateId ?? randomUUID();

    const candidate: HotelCandidate = {
      candidateId,
      resolutionVersion,
      identityKey,
      identityStatus: identity.status,
      ...(identity.matchedOn !== undefined ? { matchedOn: identity.matchedOn } : {}),
      sourceRefs: [
        {
          source: record.source,
          sourceId: record.sourceId,
          sourceVersion: record.sourceVersion,
          ingestRunId: record.ingestRunId,
        },
      ],
      name: record.name,
      normalizedName,
      ...(record.address !== undefined ? { address: record.address } : {}),
      ...(record.postcode !== undefined ? { postcode: record.postcode } : {}),
      ...(record.commune !== undefined ? { commune: record.commune } : {}),
      ...(record.starRating !== undefined ? { starRating: record.starRating } : {}),
      ...(record.roomCount !== undefined ? { roomCount: record.roomCount } : {}),
      ...(record.capacity !== undefined ? { capacity: record.capacity } : {}),
      campaignEligibility: record.campaignEligibility,
      websiteCandidates: classified === null ? [] : [classified.websiteCandidate],
      ...(ownRegistrableDomain !== undefined ? { ownRegistrableDomain } : {}),
      groupStatus,
      ...(classified?.groupDomain !== undefined ? { groupDomain: classified.groupDomain } : {}),
      ...(classified?.groupSize !== undefined ? { groupSize: classified.groupSize } : {}),
      conflicts: identity.conflicts,
      review,
    };

    if (
      candidate.campaignEligibility === 'eligible' &&
      groupStatus === 'independent' &&
      ownRegistrableDomain !== undefined
    ) {
      report.campaignReady += 1;
    }

    // Keep the in-run index current so a later row in the same run can merge
    // into a candidate this run just created.
    if (!identityKeyToCandidateId.has(identityKey)) {
      identityKeyToCandidateId.set(identityKey, candidateId);
      index.push({
        candidateId,
        normalizedName,
        ...(record.postcode !== undefined ? { postcode: record.postcode } : {}),
        ...(ownRegistrableDomain !== undefined ? { ownRegistrableDomain } : {}),
      });
    }

    batch.push(candidate);
    if (batch.length >= RESOLVE_BATCH_SIZE) await flush();
  }
  await flush();

  return report;
}
