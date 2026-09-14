/**
 * Qualifies one named hotel on demand (issue #217's per-prospect refresh
 * action): the same per-candidate check qualifyHotels runs inside its batch
 * loop, bounded to a single domain so a stale prospect can be brought
 * current from the dashboard without waiting for the next whole-catalogue
 * CLI pass. Mirrors score-on-demand.ts's shape for the same reason: the
 * batch pass is the only place this logic used to run.
 */

import type { Connection } from 'mongoose';
import { OriginLock } from '@odysseus/scanner';
import { getCrawlDelayMs, getCrawlerUserAgent } from '@odysseus/scanner';
import { recordHotelQualifications, getHotelCandidate } from '@odysseus/store';
import {
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  getSireneStockPath,
  getSireneStockIndexCachePath,
} from '../../config.js';
import { checkHotelSite } from '../check-hotel-site.js';
import { createHotelSireneJoiner } from '../hotel-identity/hotel-sirene-join.js';
import { CURRENT_QUALIFICATION_VERSION, factsFor, joinSireneFor } from './qualify-hotels.js';
import { qualifyHotelCandidate, type HotelQualificationOutcome } from '@odysseus/core';

export type QualifyOnDemandOutcome =
  | { outcome: 'qualified'; result: HotelQualificationOutcome }
  | { outcome: 'skipped'; reason: 'candidate-unknown' | 'no-own-domain' | 'not-worth-checking' }
  | { outcome: 'error'; errorMessage?: string };

/** A candidate with no own domain, or one already routed/excluded on
 *  catalogue facts alone, is decided without a request - the same
 *  isWorthChecking rule qualifyHotels applies in its batch loop. */
function isWorthChecking(
  domain: string | undefined,
  groupStatus: string,
  eligibility: string,
): boolean {
  if ((domain ?? '') === '') return false;
  if (groupStatus !== 'independent') return false;
  return eligibility === 'eligible';
}

export async function qualifyHotelOnDemand(
  connection: Connection,
  candidateId: string,
): Promise<QualifyOnDemandOutcome> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return { outcome: 'skipped', reason: 'candidate-unknown' };
  const domain = candidate.ownRegistrableDomain;
  if ((domain ?? '') === '') return { outcome: 'skipped', reason: 'no-own-domain' };
  if (!isWorthChecking(domain, candidate.groupStatus, candidate.campaignEligibility)) {
    return { outcome: 'skipped', reason: 'not-worth-checking' };
  }

  try {
    const originLock = new OriginLock();
    const site = await checkHotelSite(domain as string, originLock, {
      crawlDelayMs: getCrawlDelayMs(),
      userAgent: getCrawlerUserAgent(),
      timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
    });
    // A joiner degrades to stock-file-unavailable rather than throwing when
    // the operator-placed INSEE stock file is absent, the same tolerance
    // qualifyHotels gives the batch pass - one hotel's refresh must not fail
    // for want of an optional input.
    const sireneJoiner = await createHotelSireneJoiner(
      getSireneStockPath(),
      getSireneStockIndexCachePath(),
    );
    const sireneJoin = joinSireneFor(site, sireneJoiner);
    const result = qualifyHotelCandidate(factsFor(candidate, site, sireneJoin));

    await recordHotelQualifications(connection, [
      {
        candidateId: candidate.candidateId,
        resolutionVersion: candidate.resolutionVersion,
        qualificationVersion: CURRENT_QUALIFICATION_VERSION,
        domain: domain ?? null,
        outcome: result.outcome,
        reasons: result.reasons,
        notes: result.notes,
        siteFacts: site,
        ...(sireneJoin !== undefined ? { sireneJoin } : {}),
        evaluatedAt: new Date(),
      },
    ]);

    return { outcome: 'qualified', result: result.outcome };
  } catch (error) {
    return {
      outcome: 'error',
      ...(error instanceof Error && error.message !== '' ? { errorMessage: error.message } : {}),
    };
  }
}
