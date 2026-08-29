/**
 * Milestone 9c plan 010: which two pieces of evidence the outreach prose
 * generator is shown, chosen without a model.
 *
 * Touch 1 is doctrinally the render diff (docs/outreach-rules.md section 6),
 * but evidence schema v2 made the render composite a bonus rather than a
 * requirement (hotel-prescan-evidence.ts): a server-rendered site has no
 * render gap to photograph, measured at 17 of 25 real hotels with genuine
 * photographed failures. So touch 1 falls back to the measured failure crop
 * when no composite exists, and touch 2 then takes a different observation.
 * This is the one place that fallback is decided, so a change to it changes
 * every future draft the same way rather than drifting call site by call
 * site.
 *
 * Pure and total: every input either selects two distinct evidence items or
 * returns a typed reason it could not, never throws. The caller (the prose
 * input builder in `llm`) must remain able to build its input without a
 * database, an evidence store, or the shipped selectionReason table for
 * anything beyond what this function already resolved.
 */

import { SEVERITY_ORDER } from '../normalize/severity.js';
import type { Severity } from '../types/findings.js';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelEvidenceBilingualText,
  type HotelEvidenceSelectionReason,
  type HotelPrescanEvidence,
} from '../types/hotel-prescan-evidence.js';
import type { HotelPrescanPageRole } from '../types/hotel-prescan.js';

export const OUTREACH_EVIDENCE_SELECTION_VERSION = 'render-then-failure-v1';

export type OutreachEvidenceAlias = 'e1' | 'e2';

/** Which asset, if any, backs the chosen observation. 'summary' means the
 *  observation is real (it came from a stored summary) but is not the one
 *  captured asset this prescan produced - there is only ever one crop and,
 *  optionally, one composite, and touch 1 usually takes whichever backs it. */
export type OutreachEvidenceSlot = 'render-comparison' | 'specific-failure' | 'summary';

export interface SelectedOutreachEvidence {
  alias: OutreachEvidenceAlias;
  slot: OutreachEvidenceSlot;
  /** Key into HOTEL_EVIDENCE_OBSERVATIONS. Never shown to the model - it is
   *  an internal handle for the guards to compare against. */
  observationKey: string;
  observation: HotelEvidenceBilingualText;
  severity: Severity;
  pageRole: HotelPrescanPageRole;
  /** Present only when a captured asset backs this slot. Never shown to the
   *  model - see hotel-prescan-evidence.ts's own note that a factRef is not a
   *  finding id, which is exactly why it still must not leave this package's
   *  boundary toward a prompt. */
  factRef?: string;
}

export type OutreachEvidenceRefusal =
  | 'evidence-incomplete'
  | 'evidence-schema-outdated'
  | 'observation-not-in-allowlist'
  | 'no-distinct-second-observation';

export type OutreachEvidenceSelection =
  | {
      state: 'selected';
      version: typeof OUTREACH_EVIDENCE_SELECTION_VERSION;
      touch1: SelectedOutreachEvidence;
      touch2: SelectedOutreachEvidence;
    }
  | { state: 'cannot-draft'; refusal: OutreachEvidenceRefusal };

interface Candidate {
  index: number;
  observationKey: string;
  observation: HotelEvidenceBilingualText;
  severity: Severity;
  pageRole: HotelPrescanPageRole;
}

const PAGE_ROLE_RANK: Record<HotelPrescanPageRole, number> = {
  booking: 0,
  homepage: 1,
  content: 2,
};

/** No ties possible: severity, then page role, then the summary's own stored
 *  position. Selection must be reproducible across runs and across whichever
 *  order an evidence store happens to return summaries in. */
function compareCandidates(a: Candidate, b: Candidate): number {
  const severityDifference = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  if (severityDifference !== 0) return severityDifference;
  const roleDifference = PAGE_ROLE_RANK[a.pageRole] - PAGE_ROLE_RANK[b.pageRole];
  if (roleDifference !== 0) return roleDifference;
  return a.index - b.index;
}

function findObservationKey(observation: HotelEvidenceBilingualText): string | undefined {
  return Object.entries(HOTEL_EVIDENCE_OBSERVATIONS).find(
    ([, candidate]) => candidate.fr === observation.fr && candidate.en === observation.en,
  )?.[0];
}

/** What touch 1 prefers when it must fall back to the measured crop, keyed on
 *  the crop's own selectionReason so the two decisions - which crop was
 *  captured, which observation describes it - stay linked. The two generic
 *  reasons carry no preference: any resolvable observation is as good as
 *  another when the failure itself was not one of the named booking-specific
 *  ones. */
const FAILURE_REASON_PREFERRED_KEYS: Readonly<
  Record<HotelEvidenceSelectionReason, readonly string[]>
> = {
  'booking-keyboard-trap': ['keyboard-trap'],
  'booking-form-error': ['form-error-not-associated'],
  'booking-call-to-action': ['button-name', 'link-name'],
  'material-render-gap': ['text-missing-from-raw-html'],
  'booking-severe-element-failure': [],
  'generic-element-failure': [],
};

function toSelected(
  alias: OutreachEvidenceAlias,
  slot: OutreachEvidenceSlot,
  candidate: Candidate,
  factRef: string | undefined,
): SelectedOutreachEvidence {
  return {
    alias,
    slot,
    observationKey: candidate.observationKey,
    observation: candidate.observation,
    severity: candidate.severity,
    pageRole: candidate.pageRole,
    ...(factRef !== undefined ? { factRef } : {}),
  };
}

export function selectOutreachEvidence(evidence: HotelPrescanEvidence): OutreachEvidenceSelection {
  if (evidence.schemaVersion !== HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION) {
    return { state: 'cannot-draft', refusal: 'evidence-schema-outdated' };
  }
  if (evidence.status !== 'complete') {
    return { state: 'cannot-draft', refusal: 'evidence-incomplete' };
  }

  const candidates = evidence.summaries
    .map((summary, index): Candidate | null => {
      const observationKey = findObservationKey(summary.observation);
      if (observationKey === undefined) return null;
      return {
        index,
        observationKey,
        observation: summary.observation,
        severity: summary.severity,
        pageRole: summary.pageRole,
      };
    })
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort(compareCandidates);

  if (candidates.length === 0) {
    return { state: 'cannot-draft', refusal: 'observation-not-in-allowlist' };
  }

  // Schema version 2 requires the specific-failure crop to be captured
  // whenever status is 'complete', which was already checked above - see
  // hotel-prescan-evidence.ts's own superRefine. The render composite has no
  // such guarantee; it may be captured or omitted independently of status.
  const specificFailure = evidence.specificFailure;
  const specificFailureFactRef =
    specificFailure.state === 'captured' ? specificFailure.factRef : undefined;

  let touch1Candidate: Candidate;
  let touch1Slot: OutreachEvidenceSlot;
  let touch1FactRef: string | undefined;

  if (evidence.renderComparison.state === 'captured') {
    const renderComparison = evidence.renderComparison;
    touch1Candidate =
      candidates.find((candidate) => candidate.observationKey === 'text-missing-from-raw-html') ??
      candidates.find((candidate) => candidate.pageRole === renderComparison.pageRole) ??
      candidates[0]!;
    touch1Slot = 'render-comparison';
    touch1FactRef = renderComparison.factRef;
  } else {
    const preferredKeys =
      specificFailure.state === 'captured'
        ? FAILURE_REASON_PREFERRED_KEYS[specificFailure.selectionReason]
        : [];
    touch1Candidate =
      candidates.find((candidate) => preferredKeys.includes(candidate.observationKey)) ??
      candidates[0]!;
    touch1Slot = 'specific-failure';
    touch1FactRef = specificFailureFactRef;
  }

  const touch2Candidate = candidates.find(
    (candidate) => candidate.observationKey !== touch1Candidate.observationKey,
  );
  if (touch2Candidate === undefined) {
    return { state: 'cannot-draft', refusal: 'no-distinct-second-observation' };
  }

  const touch2MatchesFailureReason =
    specificFailure.state === 'captured' &&
    FAILURE_REASON_PREFERRED_KEYS[specificFailure.selectionReason].includes(
      touch2Candidate.observationKey,
    );
  const touch2Slot: OutreachEvidenceSlot =
    touch2MatchesFailureReason && touch1Slot !== 'specific-failure'
      ? 'specific-failure'
      : 'summary';
  const touch2FactRef = touch2Slot === 'specific-failure' ? specificFailureFactRef : undefined;

  return {
    state: 'selected',
    version: OUTREACH_EVIDENCE_SELECTION_VERSION,
    touch1: toSelected('e1', touch1Slot, touch1Candidate, touch1FactRef),
    touch2: toSelected('e2', touch2Slot, touch2Candidate, touch2FactRef),
  };
}
