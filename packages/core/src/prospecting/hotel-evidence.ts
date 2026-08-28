import { createHash } from 'node:crypto';
import type { FindingCandidate } from '../normalize/candidate.js';
import { SEVERITY_ORDER } from '../normalize/severity.js';
import type { Severity } from '../types/findings.js';
import {
  HOTEL_EVIDENCE_MAX_SUMMARIES,
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  hotelPrescanEvidenceSchema,
  type HotelEvidenceAsset,
  type HotelEvidencePublicSummary,
  type HotelEvidenceSelectionReason,
  type HotelPrescanEvidence,
} from '../types/hotel-prescan-evidence.js';
import type { HotelPrescanPageRole } from '../types/hotel-prescan.js';

export const HOTEL_RENDER_GAP_THRESHOLD_PERCENT = 20;

export interface HotelEvidenceFact {
  source: 'axe' | 'custom' | 'renderdiff';
  ruleId: string;
  severity: Severity;
  wcagCriteria: string[];
  pageRole: HotelPrescanPageRole;
  pageUrl: string;
  selector?: string;
  isBookingCallToAction?: boolean;
  missingPercent?: number;
  rawTextLength?: number;
  renderedTextLength?: number;
}

export interface RankedHotelFailure extends HotelEvidenceFact {
  selector: string;
  factRef: string;
  priority: number;
  selectionReason: HotelEvidenceSelectionReason;
}

const ROLE_ORDER: Record<HotelPrescanPageRole, number> = {
  homepage: 0,
  booking: 1,
  content: 2,
};

const RENDER_ROLE_ORDER: Record<HotelPrescanPageRole, number> = {
  booking: 0,
  homepage: 1,
  content: 2,
};

const CALL_TO_ACTION_RULES = new Set(['color-contrast', 'target-size', 'button-name', 'link-name']);

export function createHotelEvidenceFactRef(fact: HotelEvidenceFact): string {
  const identity = [
    fact.source,
    fact.ruleId,
    fact.pageRole,
    fact.pageUrl,
    fact.selector ?? '',
  ].join('\u0000');
  return `fact_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

export function toHotelEvidenceFact(
  candidate: FindingCandidate,
  pageRole: HotelPrescanPageRole,
  isBookingCallToAction = false,
): HotelEvidenceFact {
  return {
    source: candidate.source === 'axe' ? 'axe' : 'custom',
    ruleId: candidate.ruleId,
    severity: candidate.severity,
    wcagCriteria: candidate.wcagCriteria,
    pageRole,
    pageUrl: candidate.pageUrl,
    ...(candidate.element !== null ? { selector: candidate.element.selector } : {}),
    ...(isBookingCallToAction ? { isBookingCallToAction: true } : {}),
  };
}

function failurePriority(fact: HotelEvidenceFact): {
  rank: number;
  selectionReason: HotelEvidenceSelectionReason;
} | null {
  if (fact.selector === undefined || HOTEL_EVIDENCE_OBSERVATIONS[fact.ruleId] === undefined)
    return null;
  if (fact.pageRole === 'booking' && fact.ruleId === 'keyboard-trap') {
    return { rank: 0, selectionReason: 'booking-keyboard-trap' };
  }
  if (fact.pageRole === 'booking' && fact.ruleId === 'form-error-not-associated') {
    return { rank: 1, selectionReason: 'booking-form-error' };
  }
  if (
    fact.pageRole === 'booking' &&
    fact.isBookingCallToAction === true &&
    CALL_TO_ACTION_RULES.has(fact.ruleId)
  ) {
    return { rank: 2, selectionReason: 'booking-call-to-action' };
  }
  if (
    fact.pageRole === 'booking' &&
    (fact.severity === 'critical' || fact.severity === 'serious')
  ) {
    return { rank: 3, selectionReason: 'booking-severe-element-failure' };
  }
  return { rank: 4, selectionReason: 'generic-element-failure' };
}

export function rankHotelSpecificFailures(
  facts: readonly HotelEvidenceFact[],
): RankedHotelFailure[] {
  return facts
    .flatMap((fact) => {
      const priority = failurePriority(fact);
      if (priority === null || fact.selector === undefined) return [];
      return [
        {
          ...fact,
          selector: fact.selector,
          factRef: createHotelEvidenceFactRef(fact),
          priority: priority.rank,
          selectionReason: priority.selectionReason,
        },
      ];
    })
    .sort((a, b) => {
      const rankDifference = a.priority - b.priority;
      if (rankDifference !== 0) return rankDifference;
      const severityDifference = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (severityDifference !== 0) return severityDifference;
      const ruleDifference = a.ruleId.localeCompare(b.ruleId);
      if (ruleDifference !== 0) return ruleDifference;
      const roleDifference = ROLE_ORDER[a.pageRole] - ROLE_ORDER[b.pageRole];
      if (roleDifference !== 0) return roleDifference;
      return a.factRef.localeCompare(b.factRef);
    });
}

export function selectHotelRenderEvidence(
  facts: readonly HotelEvidenceFact[],
): (HotelEvidenceFact & { factRef: string }) | null {
  const eligible = facts.filter(
    (fact) =>
      fact.ruleId === 'text-missing-from-raw-html' &&
      (fact.missingPercent ?? 0) >= HOTEL_RENDER_GAP_THRESHOLD_PERCENT,
  );
  eligible.sort((a, b) => {
    const roleDifference = RENDER_ROLE_ORDER[a.pageRole] - RENDER_ROLE_ORDER[b.pageRole];
    if (roleDifference !== 0) return roleDifference;
    const missingCharsA = Math.max(0, (a.renderedTextLength ?? 0) - (a.rawTextLength ?? 0));
    const missingCharsB = Math.max(0, (b.renderedTextLength ?? 0) - (b.rawTextLength ?? 0));
    if (missingCharsA !== missingCharsB) return missingCharsB - missingCharsA;
    if ((a.missingPercent ?? 0) !== (b.missingPercent ?? 0)) {
      return (b.missingPercent ?? 0) - (a.missingPercent ?? 0);
    }
    return a.pageUrl.localeCompare(b.pageUrl);
  });
  const selected = eligible[0];
  return selected === undefined
    ? null
    : { ...selected, factRef: createHotelEvidenceFactRef(selected) };
}

export function buildHotelEvidenceSummaries(
  facts: readonly HotelEvidenceFact[],
): HotelEvidencePublicSummary[] {
  const ordered = [...facts].sort((a, b) => {
    const severityDifference = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (severityDifference !== 0) return severityDifference;
    const ruleDifference = a.ruleId.localeCompare(b.ruleId);
    if (ruleDifference !== 0) return ruleDifference;
    const roleDifference = ROLE_ORDER[a.pageRole] - ROLE_ORDER[b.pageRole];
    if (roleDifference !== 0) return roleDifference;
    return createHotelEvidenceFactRef(a).localeCompare(createHotelEvidenceFactRef(b));
  });
  const seen = new Set<string>();
  const summaries: HotelEvidencePublicSummary[] = [];
  for (const fact of ordered) {
    const observation = HOTEL_EVIDENCE_OBSERVATIONS[fact.ruleId];
    if (observation === undefined) continue;
    // Keyed on the rule alone, not on rule-and-role. The observation is a pure
    // function of the rule id, so two roles of one rule are two copies of one
    // sentence, and a reader cannot tell them apart. Keying on the role instead
    // spends a slot in a list capped at five on a claim already made. The sort
    // above runs role-ordered, so the copy kept is the most important role.
    if (seen.has(fact.ruleId)) continue;
    seen.add(fact.ruleId);
    summaries.push({
      observation,
      severity: fact.severity,
      wcagCriteria: [...fact.wcagCriteria].sort(),
      pageRole: fact.pageRole,
    });
    if (summaries.length === HOTEL_EVIDENCE_MAX_SUMMARIES) break;
  }
  return summaries;
}

export function finalizeHotelPrescanEvidence(input: {
  renderComparison: HotelEvidenceAsset;
  specificFailure: HotelEvidenceAsset;
  summaries: HotelEvidencePublicSummary[];
}): HotelPrescanEvidence {
  const complete =
    input.renderComparison.state === 'captured' &&
    input.specificFailure.state === 'captured' &&
    input.summaries.length >= HOTEL_EVIDENCE_MIN_SUMMARIES;
  return hotelPrescanEvidenceSchema.parse({
    schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
    status: complete ? 'complete' : 'incomplete',
    ...input,
  });
}
