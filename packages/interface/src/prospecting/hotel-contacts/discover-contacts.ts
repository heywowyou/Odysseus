/**
 * Plan 007's contact pass: read the few pages the selected cohort publishes,
 * keep at most one professional role address each, and park everything else
 * with a reason.
 *
 * Behind a store port and an injected fetcher and resolver, for the reason
 * qualify-hotels.ts states about its own: the risk here is the batching, the
 * suppression ordering and the loss-reason arithmetic, none of which is
 * database access or DNS, and all of which deserve a test that runs without
 * Docker and without a network.
 *
 * **A dry run plans; it does not decide.** It reports the cohort population and
 * the request budget and leaves every outcome at zero, because it has observed
 * no outcome. qualify-hotels.ts had to learn this the expensive way, reporting
 * 9,545 rejections against a catalogue nobody had looked at.
 *
 * **Suppression is checked twice, and the two checks are different questions.**
 * Before fetching, because a suppressed hotel must not receive a request at
 * all. Again immediately before persisting, against the discovered address as
 * well as the domain, because an address-level opt-out can only be tested once
 * there is an address, and because a batch over thousands of sites takes long
 * enough for an opt-out to arrive mid-run.
 */

import {
  discoverRoleContact,
  type HotelContactReason,
  type HotelContactState,
  type MailDomainStatus,
} from '@odysseus/core';
import type { CohortMemberToContact, RecordHotelContactInput } from '@odysseus/store';
import type { ContactPagesFetch } from './fetch-contact-pages.js';
import type { MailDomainVerifier } from './verify-mail-domain.js';

/** Bumped by hand when a contact rule changes, never edited in place - the
 *  discipline CURRENT_QUALIFICATION_VERSION records, and for the same reason: a
 *  later comparison of contact yield must not silently mix two definitions of
 *  "usable address". Widening the role allowlist is such a change. */
export const CURRENT_CONTACT_VERSION = 'v1';

export interface HotelContactStorePort {
  listMembers(options: { limit?: number; domain?: string }): Promise<CohortMemberToContact[]>;
  /** Domain-level suppression for the whole population, in one query. */
  findSuppressedDomains(domains: readonly string[]): Promise<Set<string>>;
  /** The late check, against one domain and the address just discovered. */
  isSuppressed(domain: string, address?: string): Promise<boolean>;
  /** The mentions legales URL plan 003 already found, when it found one. */
  knownMentionsLegalesUrl(candidateId: string): Promise<string | null>;
  record(inputs: readonly RecordHotelContactInput[]): Promise<{ created: number; updated: number }>;
}

export type ContactPagesFetcher = (
  domain: string,
  knownMentionsLegalesUrl: string | null,
) => Promise<ContactPagesFetch>;

export interface DiscoverContactsOptions {
  store: HotelContactStorePort;
  fetchPages: ContactPagesFetcher;
  verifyMailDomain: MailDomainVerifier;
  contactVersion: string;
  concurrency: number;
  limit?: number;
  domain?: string;
  dryRun: boolean;
  onProgress?: (processed: number) => void;
}

export interface DiscoverContactsReport {
  contactVersion: string;
  dryRun: boolean;
  membersConsidered: number;
  processed: number;
  byState: Record<HotelContactState, number>;
  byReason: Record<string, number>;
  byLocalPart: Record<string, number>;
  /** Requests actually made to third-party sites, robots.txt excluded. */
  requestsMade: number;
  /** What a dry run reports instead of outcomes: the population and the
   *  ceiling on requests it would spend. */
  plan: { wouldFetch: number; maxRequests: number; suppressedBeforeFetch: number } | null;
  /** False when the state counts do not add up to the number processed, which
   *  makes the whole report unreliable rather than merely incomplete. */
  reconciles: boolean;
}

/** Three requests per site: homepage, mentions legales, contact page. */
const MAX_REQUESTS_PER_SITE = 3;

function toLanes<T>(items: readonly T[], laneCount: number): T[][] {
  const lanes: T[][] = Array.from({ length: Math.max(1, laneCount) }, () => []);
  items.forEach((item, index) => {
    lanes[index % lanes.length]?.push(item);
  });
  return lanes;
}

function emptyStates(): Record<HotelContactState, number> {
  return { found: 0, parked: 0, rejected: 0, suppressed: 0 };
}

interface Decision {
  state: HotelContactState;
  reason: HotelContactReason;
  address?: string;
  localPart?: string;
  source?: RecordHotelContactInput['source'];
  sourceUrl?: string;
  mxStatus: MailDomainStatus;
}

/** The whole per-hotel decision, given what was read. Separated from the loop
 *  so the interesting cases are testable one at a time. */
export async function decideContact(
  member: CohortMemberToContact,
  fetched: ContactPagesFetch,
  verify: MailDomainVerifier,
): Promise<Decision> {
  if (fetched.outcome === 'robots-denied') {
    return { state: 'parked', reason: 'robots-denied', mxStatus: 'unknown' };
  }
  if (fetched.outcome === 'unreachable') {
    return { state: 'parked', reason: 'site-unreachable', mxStatus: 'unknown' };
  }

  const discovery = discoverRoleContact(fetched.sources, member.domain);
  if (discovery.outcome === 'absent') {
    return { state: 'parked', reason: 'no-address-published', mxStatus: 'unknown' };
  }
  if (discovery.outcome === 'rejected') {
    return { state: 'rejected', reason: discovery.reason, mxStatus: 'unknown' };
  }

  const mxStatus = await verify(discovery.domain);
  return {
    // A domain with no mail service parks rather than rejects, and keeps the
    // address: the hotel did publish one, and an operator reading the row needs
    // to see what was found. `unknown` never parks - a resolver timeout is not
    // evidence about the hotel.
    state: mxStatus === 'no-mx' ? 'parked' : 'found',
    reason: mxStatus === 'no-mx' ? 'no-mail-service' : 'role-address-published',
    address: discovery.address,
    localPart: discovery.localPart,
    source: discovery.source,
    sourceUrl: discovery.sourceUrl,
    mxStatus,
  };
}

export async function discoverContacts(
  options: DiscoverContactsOptions,
): Promise<DiscoverContactsReport> {
  const members = await options.store.listMembers({
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.domain === undefined ? {} : { domain: options.domain }),
  });

  const suppressedUpFront = await options.store.findSuppressedDomains(
    members.map((member) => member.domain),
  );

  const byState = emptyStates();
  const byReason: Record<string, number> = {};
  const byLocalPart: Record<string, number> = {};
  let requestsMade = 0;
  let processed = 0;

  if (options.dryRun) {
    const wouldFetch = members.filter((member) => !suppressedUpFront.has(member.domain)).length;
    return {
      contactVersion: options.contactVersion,
      dryRun: true,
      membersConsidered: members.length,
      processed: 0,
      byState,
      byReason,
      byLocalPart,
      requestsMade: 0,
      plan: {
        wouldFetch,
        maxRequests: wouldFetch * MAX_REQUESTS_PER_SITE,
        suppressedBeforeFetch: members.length - wouldFetch,
      },
      reconciles: true,
    };
  }

  const decisions = new Map<string, Decision>();
  await Promise.all(
    toLanes(members, options.concurrency).map(async (lane) => {
      for (const member of lane) {
        if (suppressedUpFront.has(member.domain)) {
          decisions.set(member.candidateId, {
            state: 'suppressed',
            reason: 'domain-suppressed',
            mxStatus: 'unknown',
          });
          continue;
        }

        const knownUrl = await options.store.knownMentionsLegalesUrl(member.candidateId);
        const fetched = await options.fetchPages(member.domain, knownUrl);
        requestsMade += fetched.requestCount;
        decisions.set(
          member.candidateId,
          await decideContact(member, fetched, options.verifyMailDomain),
        );
        options.onProgress?.(decisions.size);
      }
    }),
  );

  const validatedAt = new Date();
  const inputs: RecordHotelContactInput[] = [];
  for (const member of members) {
    const decision = decisions.get(member.candidateId);
    if (decision === undefined) continue;

    // The late check. An opt-out that arrived during the run, or an
    // address-level opt-out that could not be tested before there was an
    // address, overrides whatever was discovered. Asked as two questions
    // rather than one so the stored reason says which opt-out applied; the
    // second is only ever asked of a row that found an address.
    const domainSuppressed =
      decision.state === 'suppressed' || (await options.store.isSuppressed(member.domain));
    const addressSuppressed =
      !domainSuppressed &&
      decision.address !== undefined &&
      (await options.store.isSuppressed(member.domain, decision.address));

    // A suppressed row keeps no address: the opt-out is the whole point.
    const final: Decision =
      domainSuppressed || addressSuppressed
        ? {
            state: 'suppressed',
            reason: domainSuppressed ? 'domain-suppressed' : 'address-suppressed',
            mxStatus: decision.mxStatus,
          }
        : decision;

    processed += 1;
    byState[final.state] += 1;
    byReason[final.reason] = (byReason[final.reason] ?? 0) + 1;
    if (final.state === 'found' && final.localPart !== undefined) {
      byLocalPart[final.localPart] = (byLocalPart[final.localPart] ?? 0) + 1;
    }

    inputs.push({
      candidateId: member.candidateId,
      cohortId: member.cohortId,
      domain: member.domain,
      contactVersion: options.contactVersion,
      state: final.state,
      reason: final.reason,
      ...(final.address === undefined ? {} : { address: final.address }),
      ...(final.localPart === undefined ? {} : { localPart: final.localPart }),
      ...(final.source === undefined ? {} : { source: final.source }),
      ...(final.sourceUrl === undefined ? {} : { sourceUrl: final.sourceUrl }),
      mxStatus: final.mxStatus,
      validatedAt,
    });
  }

  await options.store.record(inputs);

  const counted = Object.values(byState).reduce((total, count) => total + count, 0);
  return {
    contactVersion: options.contactVersion,
    dryRun: false,
    membersConsidered: members.length,
    processed,
    byState,
    byReason,
    byLocalPart,
    requestsMade,
    plan: null,
    reconciles: counted === processed,
  };
}
