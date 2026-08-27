/**
 * Decides which existing candidate, if any, one source observation belongs to.
 * Pure and synchronous, the same posture as qualify-prospect.ts: no database,
 * no ordering assumptions, one table-testable function.
 *
 * The whole design is an answer to one question: what evidence is strong enough
 * to merge two records without a human looking? Three keys clear that bar, and
 * nothing else does.
 *
 * - **SIRET.** The only identifier that names an *establishment*. Validated,
 *   never pattern-matched, so a typo can never become a merge key.
 * - **SIREN plus a corroborating establishment fact.** SIREN names a company.
 *   A company can own twelve hotels, so SIREN alone would collapse a group into
 *   one candidate. It merges only when a postcode or a normalized name agrees.
 * - **Exact own-domain agreement.** In practice the only key available today:
 *   the Atout France export carries no SIRET or SIREN column, so identifiers do
 *   not arrive until plan 003 reads the hotel's own published identification.
 *
 * Name plus postcode may *link* an observation to a candidate for review. It
 * may never select one. That asymmetry is the point: it is the difference
 * between "a human should look at these two rows" and "these two rows are the
 * same hotel", and the milestone's binding decision 4 puts fuzzy matching
 * firmly in the first category.
 *
 * Conflicting exact keys produce `ambiguous`, never a resolution by precedence.
 * Precedence orders which key *explains* a merge when several agree; it is not
 * a tie-break for keys that disagree. Two exact identifiers pointing at
 * different establishments is a data problem to look at.
 */

import { isValidSiren, isValidSiret } from '../compliance/siren.js';
import type {
  HotelCandidateConflict,
  HotelIdentityKey,
  HotelIdentityStatus,
} from '../types/hotel-candidate.js';

/** What one source row offers as identity evidence, already normalized by the
 *  caller. Deliberately not a HotelSourceRecord: this function must be usable
 *  from plan 003 too, where the identifier arrives from a scanned page rather
 *  than from a catalogue row. */
export interface HotelIdentityObservation {
  name: string;
  postcode?: string;
  siret?: string;
  siren?: string;
  /** Set only when the declared website resolved to an own domain. A
   *  vendor-hosted or unusable website contributes no identity evidence. */
  ownRegistrableDomain?: string;
}

/** The subset of a candidate this function needs. A projection rather than the
 *  full HotelCandidate so callers can index thousands of them cheaply. */
export interface HotelIdentityCandidateIndexEntry {
  candidateId: string;
  normalizedName: string;
  postcode?: string;
  siret?: string;
  siren?: string;
  ownRegistrableDomain?: string;
}

export interface HotelIdentityInput {
  observation: HotelIdentityObservation;
  candidates: HotelIdentityCandidateIndexEntry[];
}

export interface HotelIdentityResolution {
  status: HotelIdentityStatus;
  /** Set only when status is `resolved`. */
  candidateId?: string;
  /** Every candidate this observation touched, in stable ascending id order.
   *  For `resolved` that is the one; for `ambiguous` and `needs-review` it is
   *  the set a human is being asked about. */
  candidateIds: string[];
  matchedOn?: HotelIdentityKey;
  conflicts: HotelCandidateConflict[];
}

/** Case, accent, and punctuation folding, and nothing else. Deliberately does
 *  not strip words such as "hotel": two establishments called "Hôtel de la
 *  Poste" and "Hôtel de la Gare" in one commune must stay distinct, and every
 *  word-stripping rule that makes one pair match makes another pair collide. */
export function normalizeEstablishmentName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function sorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

export function resolveHotelIdentity(input: HotelIdentityInput): HotelIdentityResolution {
  const { observation, candidates } = input;
  const conflicts: HotelCandidateConflict[] = [];

  const siret =
    observation.siret !== undefined && isValidSiret(observation.siret)
      ? observation.siret.replace(/\s/gu, '')
      : undefined;
  const siren =
    observation.siren !== undefined && isValidSiren(observation.siren)
      ? observation.siren.replace(/\s/gu, '')
      : undefined;
  const domain = observation.ownRegistrableDomain?.trim().toLowerCase();
  const normalizedName = normalizeEstablishmentName(observation.name);

  // Each exact key is collected independently, then reconciled. Collecting them
  // separately is what makes a disagreement visible: short-circuiting on the
  // first key that matched would resolve happily and never notice that a
  // second, equally exact key pointed somewhere else.
  const bySiret: string[] = [];
  const bySirenWithFact: Array<{ candidateId: string; fact: 'postcode' | 'normalized-name' }> = [];
  const byDomain: string[] = [];
  const byNameAndPostcode: string[] = [];

  for (const entry of candidates) {
    if (siret !== undefined && entry.siret !== undefined && isValidSiret(entry.siret)) {
      if (entry.siret.replace(/\s/gu, '') === siret) bySiret.push(entry.candidateId);
    }
    if (siren !== undefined && entry.siren !== undefined && isValidSiren(entry.siren)) {
      if (entry.siren.replace(/\s/gu, '') === siren) {
        if (
          observation.postcode !== undefined &&
          entry.postcode !== undefined &&
          observation.postcode === entry.postcode
        ) {
          bySirenWithFact.push({ candidateId: entry.candidateId, fact: 'postcode' });
        } else if (normalizedName !== '' && normalizedName === entry.normalizedName) {
          bySirenWithFact.push({ candidateId: entry.candidateId, fact: 'normalized-name' });
        }
      }
    }
    if (domain !== undefined && entry.ownRegistrableDomain === domain) {
      byDomain.push(entry.candidateId);
    }
    if (
      normalizedName !== '' &&
      normalizedName === entry.normalizedName &&
      observation.postcode !== undefined &&
      observation.postcode === entry.postcode
    ) {
      byNameAndPostcode.push(entry.candidateId);
    }
  }

  // A candidate matched on the domain but carrying a different valid SIRET is
  // worth recording even when the outcome is decided by something else: it is
  // the signature of two establishments sharing one website.
  for (const entry of candidates) {
    if (
      siret !== undefined &&
      entry.siret !== undefined &&
      isValidSiret(entry.siret) &&
      entry.siret.replace(/\s/gu, '') !== siret &&
      (byDomain.includes(entry.candidateId) || byNameAndPostcode.includes(entry.candidateId))
    ) {
      conflicts.push({
        kind: 'siret-disagreement',
        detail: `observation SIRET ${siret} against candidate SIRET ${entry.siret.replace(/\s/gu, '')}`,
        candidateIds: [entry.candidateId],
      });
    }
  }

  const exactMatches = sorted([
    ...bySiret,
    ...bySirenWithFact.map((m) => m.candidateId),
    ...byDomain,
  ]);

  if (exactMatches.length > 1 || conflicts.length > 0) {
    if (exactMatches.length > 1) {
      conflicts.push({
        kind: 'multiple-exact-matches',
        detail: `exact evidence pointed at ${exactMatches.length} candidates: ${exactMatches.join(', ')}`,
        candidateIds: exactMatches,
      });
    }
    const touched = sorted([...exactMatches, ...byNameAndPostcode]);
    return { status: 'ambiguous', candidateIds: touched, conflicts };
  }

  if (exactMatches.length === 1) {
    const candidateId = exactMatches[0] as string;
    // Precedence explains the merge; it does not decide it. By this point only
    // one candidate matched, so every key that fired named the same hotel.
    let matchedOn: HotelIdentityKey;
    if (bySiret.length > 0) {
      matchedOn = { kind: 'siret', value: siret as string };
    } else if (bySirenWithFact.length > 0) {
      const match = bySirenWithFact[0] as {
        candidateId: string;
        fact: 'postcode' | 'normalized-name';
      };
      matchedOn = {
        kind: 'siren-with-fact',
        value: siren as string,
        corroboratingFact: match.fact,
      };
    } else {
      matchedOn = { kind: 'own-domain', value: domain as string };
    }
    return { status: 'resolved', candidateId, candidateIds: [candidateId], matchedOn, conflicts };
  }

  // No exact evidence. A name-plus-postcode agreement, or an identifier that
  // failed validation, is a reason to ask rather than a reason to merge.
  const hasUnusableIdentifier =
    (observation.siret !== undefined && siret === undefined) ||
    (observation.siren !== undefined && siren === undefined);
  const sirenWithoutFact =
    siren !== undefined &&
    candidates.some(
      (entry) =>
        entry.siren !== undefined &&
        isValidSiren(entry.siren) &&
        entry.siren.replace(/\s/gu, '') === siren,
    );

  if (byNameAndPostcode.length > 0 || hasUnusableIdentifier || sirenWithoutFact) {
    return { status: 'needs-review', candidateIds: sorted(byNameAndPostcode), conflicts };
  }

  return { status: 'unmatched', candidateIds: [], conflicts };
}
