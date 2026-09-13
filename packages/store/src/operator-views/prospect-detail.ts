/**
 * Composed prospect detail: one candidate's whole funnel, assembled from the
 * per-stage view families in one bounded response.
 */

import type { Connection } from 'mongoose';
import type {
  HotelCampaignEligibility,
  HotelCandidateReviewState,
  HotelGroupStatus,
  HotelIdentityStatus,
  HotelPrescanStatus,
  HotelQualificationOutcome,
  HotelQualificationReason,
} from '@odysseus/core';
import { getHotelCandidate } from '../hotel-candidates.js';
import { getHotelQualification } from '../hotel-qualifications.js';
import {
  getProspectSourceConflicts,
  type OperatorSourceConflictRow,
  type OperatorSourceRefRow,
} from './source-conflicts.js';
import {
  getProspectQualificationHistory,
  type OperatorQualificationEvent,
} from './qualification-history.js';
import {
  getProspectEvidenceView,
  getProspectPrescanView,
  type OperatorEvidenceView,
  type OperatorPrescanView,
} from './prescan-evidence.js';
import { getProspectScoreView, type OperatorScoreView } from './score-views.js';
import {
  getProspectContactView,
  getProspectOutcomeView,
  getProspectPreviewView,
  getProspectThreadView,
  type OperatorContactView,
  type OperatorOutcomeEventView,
  type OperatorPreviewView,
  type OperatorThreadView,
} from './contact-preview-thread-outcome.js';
import type { OperatorViewPage } from './shared.js';

export interface OperatorWebsiteCandidateView {
  raw: string;
  kind: string;
  hostname: string | null;
  registrableDomain: string | null;
  unusableReason: string | null;
}

export interface OperatorProspectDetail {
  candidateId: string;
  resolutionVersion: string;
  identityKey: string;
  identityStatus: HotelIdentityStatus;
  matchedOn: { kind: string; value: string } | null;
  siret: string | null;
  siren: string | null;
  name: string;
  commune: string | null;
  postcode: string | null;
  starRating: number | null;
  roomCount: number | null;
  capacity: number | null;
  campaignEligibility: HotelCampaignEligibility;
  groupStatus: HotelGroupStatus;
  groupDomain: string | null;
  groupSize: number | null;
  ownRegistrableDomain: string | null;
  domainProvenance: string | null;
  declaredRegistrableDomain: string | null;
  reviewState: HotelCandidateReviewState;
  review: {
    queuedReason: string | null;
    actor: string | null;
    reason: string | null;
    decidedAt: Date | null;
  };
  qualificationOutcome: HotelQualificationOutcome | 'not-evaluated';
  prescanStatus: HotelPrescanStatus | null;
  /** The declared websites, which is the evidence a join reviewer reads. The
   *  catalogue's street address stays out of every view here; commune and
   *  postcode locate the establishment. */
  websites: OperatorWebsiteCandidateView[];
  conflicts: OperatorSourceConflictRow[];
  sourceRefs: OperatorSourceRefRow[];
  qualification: OperatorQualificationEvent | null;
  prescan: OperatorPrescanView | null;
  evidence: OperatorEvidenceView | null;
  score: OperatorScoreView | null;
  contact: OperatorContactView | null;
  thread: OperatorThreadView | null;
  preview: OperatorPreviewView | null;
  outcomes: OperatorViewPage<OperatorOutcomeEventView>;
}

export interface GetOperatorProspectOptions {
  /** When supplied, contact metadata follows plan 045 precedence: manual-v1
   *  first, otherwise this exact discovered generation. */
  contactVersion?: string;
}

/** One candidate's whole funnel, composed from the per-stage views above. A
 *  detail response is bounded by construction: at most one qualification
 *  generation, one prescan, one score, one contact row, one thread with its
 *  draft metadata, one preview, and one page of outcome events. */
export async function getOperatorProspect(
  connection: Connection,
  candidateId: string,
  options: GetOperatorProspectOptions = {},
): Promise<OperatorProspectDetail | null> {
  const candidate = await getHotelCandidate(connection, candidateId);
  if (candidate === null) return null;

  // The composed stages are read in parallel; none depends on another's
  // result. The qualification event follows the candidate's pointer so the
  // detail always shows the generation the catalogue currently believes.
  const [conflicts, historyPage, prescan, evidence, score, contact, thread, preview, outcomes] =
    await Promise.all([
      getProspectSourceConflicts(connection, candidateId),
      candidate.qualification === undefined
        ? getProspectQualificationHistory(connection, candidateId, { limit: 1 })
        : Promise.resolve({ rows: [], total: 0, limit: 1, offset: 0 }),
      getProspectPrescanView(connection, candidateId),
      getProspectEvidenceView(connection, candidateId),
      getProspectScoreView(connection, candidateId),
      getProspectContactView(
        connection,
        candidateId,
        options.contactVersion === undefined ? {} : { contactVersion: options.contactVersion },
      ),
      getProspectThreadView(connection, candidateId),
      getProspectPreviewView(connection, candidateId),
      getProspectOutcomeView(connection, candidateId, { limit: 10 }),
    ]);

  let qualification: OperatorQualificationEvent | null = null;
  if (candidate.qualification !== undefined) {
    const pointed = await getHotelQualification(
      connection,
      candidate.qualification.qualificationVersion,
      candidateId,
    );
    if (pointed !== null) {
      qualification = {
        qualificationId: pointed.qualificationId,
        qualificationVersion: pointed.qualificationVersion,
        domain: pointed.domain ?? null,
        outcome: pointed.outcome,
        reasons: pointed.reasons as HotelQualificationReason[],
        notes: [...pointed.notes],
        sireneStatus: pointed.sireneJoin?.status ?? null,
        effectifBandCode: pointed.sireneJoin?.effectifBandCode ?? null,
        evaluatedAt: pointed.evaluatedAt,
      };
    }
  } else {
    qualification = historyPage.rows[0] ?? null;
  }

  return {
    candidateId: candidate.candidateId,
    resolutionVersion: candidate.resolutionVersion,
    identityKey: candidate.identityKey,
    identityStatus: candidate.identityStatus,
    matchedOn:
      candidate.matchedOn === undefined
        ? null
        : { kind: candidate.matchedOn.kind, value: candidate.matchedOn.value },
    siret: candidate.siret ?? null,
    siren: candidate.siren ?? null,
    name: candidate.name,
    commune: candidate.commune ?? null,
    postcode: candidate.postcode ?? null,
    starRating: candidate.starRating ?? null,
    roomCount: candidate.roomCount ?? null,
    capacity: candidate.capacity ?? null,
    campaignEligibility: candidate.campaignEligibility,
    groupStatus: candidate.groupStatus,
    groupDomain: candidate.groupDomain ?? null,
    groupSize: candidate.groupSize ?? null,
    ownRegistrableDomain: candidate.ownRegistrableDomain ?? null,
    domainProvenance: candidate.domainProvenance ?? null,
    declaredRegistrableDomain: candidate.declaredRegistrableDomain ?? null,
    reviewState: candidate.review.state,
    review: {
      queuedReason: candidate.review.queuedReason ?? null,
      actor: candidate.review.actor ?? null,
      reason: candidate.review.reason ?? null,
      decidedAt: candidate.review.decidedAt ?? null,
    },
    qualificationOutcome: candidate.qualification?.outcome ?? 'not-evaluated',
    prescanStatus: candidate.prescan?.status ?? null,
    websites: candidate.websiteCandidates.map((website) => ({
      raw: website.raw,
      kind: website.kind,
      hostname: website.hostname ?? null,
      registrableDomain: website.registrableDomain ?? null,
      unusableReason: website.unusableReason ?? null,
    })),
    conflicts: conflicts?.conflicts ?? [],
    sourceRefs: conflicts?.sourceRefs ?? [],
    qualification,
    prescan,
    evidence,
    score,
    contact,
    thread,
    preview,
    outcomes,
  };
}
