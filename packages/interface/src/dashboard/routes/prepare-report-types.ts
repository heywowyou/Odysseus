/**
 * Declared by value rather than imported from @odysseus/core: this file
 * describes what crosses the HTTP boundary for the Prepare report card
 * (plan 019), the same convention as audit-detail-types.ts. The dashboard
 * TypeScript project reads no workspace packages.
 */

export interface LocalizedTextResponse {
  fr?: string;
  en?: string;
}

export interface AnalysisPairRefResponse {
  frAnalysisId: string;
  enAnalysisId: string;
}

export type WritingCandidateResponse =
  | { status: 'ready'; pair: AnalysisPairRefResponse; createdAt: string }
  | {
      status: 'failed';
      reason: string;
      createdAt: string;
      /** Issue #409: which guards rejected each attempt of the failed run.
       *  Optional so an older server's response still reads. */
      guardRejections?: { attempt: number; totalAttempts: number; guards: string[] }[];
    }
  | { status: 'selected'; pair: AnalysisPairRefResponse; approvedAt: string };

export interface PreparationResponse {
  customCoverQuestion?: LocalizedTextResponse;
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

export interface PreparationPreviewLanguageResponse {
  language: 'fr' | 'en';
  coverQuestion: PreviewQuestionResponse;
  hook: { family: string; value: string; evidenceUnavailable: boolean };
}

/** The GET/PATCH/confirm response of the report-preparation endpoints. */
export interface PreparationViewResponse {
  preparation: PreparationResponse;
  preview: {
    fr: PreparationPreviewLanguageResponse;
    en: PreparationPreviewLanguageResponse;
    warnings: 'commercial-name'[];
    warningDigest: string;
  };
  regenerationInFlight: boolean;
  /** Issue #281: how the last background writing run ended. */
  lastWritingRun?:
    | {
        status: 'succeeded';
        pdfsGenerated: boolean;
        pdfsRefusedReason?: string;
        finishedAt: string;
      }
    | { status: 'failed'; message: string; finishedAt: string };
  /** Issue #376: the server's canonical report production state. Optional
   *  so an older server's response still reads as idle. */
  production?: ReportProductionStateResponse;
}

export type ReportProductionStateResponse =
  | { status: 'idle' }
  | { status: 'writing' | 'pdf-generation'; startedAt: string; updatedAt: string }
  | { status: 'completed'; finishedAt: string }
  | {
      status: 'failed';
      stage: 'writing' | 'pdf-generation';
      message: string;
      finishedAt: string;
    };
