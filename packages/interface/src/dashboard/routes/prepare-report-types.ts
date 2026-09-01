/**
 * Declared by value rather than imported from @odysseus/core: this file
 * describes what crosses the HTTP boundary for the Prepare report card
 * (plan 019), the same convention as audit-detail-types.ts. The dashboard
 * TypeScript project reads no workspace packages.
 */

export type SituationVocab =
  | 'no-work-started'
  | 'redesign-underway'
  | 'corrections-underway'
  | 'accessibility-programme'
  | 'periodic-review'
  | 'unknown';

export type TriggerVocab =
  | 'legal-question'
  | 'customer-complaint'
  | 'booking-or-conversion'
  | 'search-visibility'
  | 'redesign'
  | 'procurement'
  | 'commercial-discussion'
  | 'proactive-review'
  | 'other';

export type JourneyVocab = 'discovery-navigation' | 'transaction-booking';

export type JourneyDecisionKind = 'confirmed' | 'removed';

export interface LocalizedTextResponse {
  fr?: string;
  en?: string;
}

export interface AnalysisPairRefResponse {
  frAnalysisId: string;
  enAnalysisId: string;
}

export type ManualTurnoverSourceResponse =
  'official-annual-accounts' | 'client-stated' | 'other-documented';

export type ManualTurnoverResponse =
  | {
      kind: 'exact';
      amountEur: number;
      year: number;
      source: ManualTurnoverSourceResponse;
      sourceNote?: string;
    }
  | {
      kind: 'range';
      lowerEur: number;
      upperEur: number;
      year: number;
      source: ManualTurnoverSourceResponse;
      sourceNote?: string;
    };

export interface TurnoverChoiceResponse {
  detected?: { amountEur: number; year: number; source: 'sirene-api' };
  replacement?: ManualTurnoverResponse;
  useReplacement: boolean;
}

export type EffectiveTurnoverResponse =
  | {
      status: 'available';
      amountEur: number;
      calculationAmountEur: number;
      rangeUpperEur?: number;
      year: number;
      source: 'sirene-api' | ManualTurnoverSourceResponse;
      provenance: 'detected' | 'replacement';
      inputKind: 'exact' | 'range';
    }
  | { status: 'omitted'; reason: 'missing-turnover' | 'missing-replacement' };

export type WritingCandidateResponse =
  | { status: 'ready'; pair: AnalysisPairRefResponse; createdAt: string }
  | { status: 'failed'; reason: string; createdAt: string }
  | { status: 'selected'; pair: AnalysisPairRefResponse; approvedAt: string };

export interface PreparationResponse {
  context: {
    situation?: SituationVocab;
    trigger?: TriggerVocab;
    triggerOther?: LocalizedTextResponse;
  };
  customCoverQuestion?: LocalizedTextResponse;
  stakeholders: Partial<Record<'management' | 'technical' | 'communications' | 'legal', string>>;
  journeyDecisions: { journeyId: JourneyVocab; decision: JourneyDecisionKind }[];
  turnover: TurnoverChoiceResponse;
  warningAcknowledgement?: { digest: string; acknowledgedAt: string };
  writingSelection?: {
    selected?: AnalysisPairRefResponse;
    candidate?: WritingCandidateResponse;
  };
  updatedAt: string;
}

export interface PreviewQuestionResponse {
  value: string;
  source: 'custom' | 'automatic' | 'fallback';
}

export interface PreviewJourneyStepResponse {
  stepId: string;
  label: string;
  description: string;
  state: 'issue-observed' | 'no-issue-detected' | 'not-evaluated';
  stateLabel: string;
  notEvaluatedReason?: string;
}

export interface PreviewJourneyResponse {
  journeyId: string;
  label: string;
  description: string;
  steps: PreviewJourneyStepResponse[];
}

export interface PreparationPreviewLanguageResponse {
  language: 'fr' | 'en';
  coverQuestion: PreviewQuestionResponse;
  hook: { family: string; value: string; evidenceUnavailable: boolean };
  stakeholders: { role: string; roleLabel: string; name: string }[];
  journeys: PreviewJourneyResponse[];
}

export type JourneySuggestionResponse =
  | { journeyId: JourneyVocab; available: true }
  | {
      journeyId: JourneyVocab;
      available: false;
      reason:
        | 'evidence-unavailable'
        | 'no-visited-pages'
        | 'no-transactional-flow'
        | 'no-transactional-page-visited';
    };

/** The GET/PATCH/confirm response of the report-preparation endpoints. */
export interface PreparationViewResponse {
  preparation: PreparationResponse;
  preview: {
    fr: PreparationPreviewLanguageResponse;
    en: PreparationPreviewLanguageResponse;
    warnings: ('commercial-name' | 'situation' | 'trigger' | 'journey-scope')[];
    warningDigest: string;
    excludedJourneys: { journeyId: string; reason: string }[];
    turnover: EffectiveTurnoverResponse;
  };
  suggestions: JourneySuggestionResponse[];
  acknowledgementCurrent: boolean;
  regenerationInFlight: boolean;
}
