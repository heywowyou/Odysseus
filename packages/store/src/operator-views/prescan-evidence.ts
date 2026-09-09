/**
 * Prescan and evidence views: the latest prescan's page roles and metrics,
 * the two evidence assets' status, and the stored facts a route needs to
 * serve one asset's bytes.
 */

import type { Connection } from 'mongoose';
import type {
  HotelEvidenceAsset,
  HotelEvidenceBilingualText,
  HotelEvidenceOmissionReason,
  HotelEvidenceSelectionReason,
  HotelPrescanPageRole,
  HotelPrescanRoleAbsence,
  HotelPrescanStatus,
  Severity,
} from '@odysseus/core';
import { getHotelCandidate } from '../hotel-candidates.js';
import { getLatestPrescan } from '../prescans.js';
import { createPrescanModel, type PrescanDocument } from '../schemas/prescan.schema.js';

/** The identity fields every insight sub-view (prescan, score, evidence,
 *  preview) borrows from the candidate, so its own page can headline the
 *  hotel instead of the opaque candidateId in the URL. Falls back to the id
 *  itself if the candidate record is gone by the time the sub-view is read:
 *  the sub-record can outlive a deleted candidate, and a blank heading would
 *  be worse than the id it replaces. */
export interface OperatorCandidateIdentity {
  name: string;
  commune: string | null;
  postcode: string | null;
}

/** Shared with the score and preview view families, which headline the same
 *  identity fields on their own sub-views. */
export async function candidateIdentityView(
  connection: Connection,
  candidateId: string,
): Promise<OperatorCandidateIdentity> {
  const candidate = await getHotelCandidate(connection, candidateId);
  return {
    name: candidate?.name ?? candidateId,
    commune: candidate?.commune ?? null,
    postcode: candidate?.postcode ?? null,
  };
}

export interface OperatorPrescanPageView {
  role: HotelPrescanPageRole;
  httpStatus: number | null;
  missingPercent: number | null;
  rawTextLength: number | null;
  renderedTextLength: number | null;
  consoleErrorCount: number | null;
  axe: {
    violationCount: number;
    byImpact: { critical: number; serious: number; moderate: number; minor: number };
    affectedElementCount: number;
    ruleIds: string[];
  } | null;
  metrics: {
    largestContentfulPaintMs: number | null;
    cumulativeLayoutShift: number | null;
    longTaskCount: number | null;
    mainThreadBlockingMs: number | null;
    requestCount: number;
    transferBytes: number;
    thirdPartyRequestCount: number;
    sizeUnavailableCount: number;
    observationWindowMs: number;
  } | null;
  bookingEvidenceKinds: string[];
  skippedByRobots: boolean;
  durationMs: number;
}

export interface OperatorPrescanView {
  prescanId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  prescanVersion: string;
  status: HotelPrescanStatus;
  domain: string;
  startedAt: Date;
  durationMs: number;
  robotsTxtFound: boolean;
  absentRoles: HotelPrescanRoleAbsence[];
  evidenceStatus: 'complete' | 'incomplete' | 'none';
  pages: OperatorPrescanPageView[];
}

export interface GetProspectPrescanViewOptions {
  /** Latest at this version when given; latest of any version otherwise. */
  prescanVersion?: string;
}

/** The latest prescan's page roles and metrics. Page urls, artifact paths,
 *  third-party host lists, and raw error strings stay out: the operator view
 *  is what a person reads to judge the site, and each excluded field is
 *  either an unbounded list or a string written by a tool. */
export async function getProspectPrescanView(
  connection: Connection,
  candidateId: string,
  options: GetProspectPrescanViewOptions = {},
): Promise<OperatorPrescanView | null> {
  const prescan = await latestPrescanForCandidate(connection, candidateId, options.prescanVersion);
  if (prescan === null) return null;
  const identity = await candidateIdentityView(connection, candidateId);
  return {
    prescanId: prescan.prescanId,
    ...identity,
    prescanVersion: prescan.prescanVersion,
    status: prescan.status,
    domain: prescan.domain,
    startedAt: prescan.startedAt,
    durationMs: prescan.durationMs,
    robotsTxtFound: prescan.robotsTxtFound,
    absentRoles: prescan.absentRoles.map((absence) => ({
      role: absence.role,
      reason: absence.reason,
    })),
    evidenceStatus: prescan.evidence?.status ?? 'none',
    pages: prescan.pages.map((page) => ({
      role: page.role,
      httpStatus: page.httpStatus ?? null,
      missingPercent: page.missingPercent ?? null,
      rawTextLength: page.rawTextLength ?? null,
      renderedTextLength: page.renderedTextLength ?? null,
      consoleErrorCount: page.consoleErrorCount ?? null,
      axe:
        page.axe === undefined
          ? null
          : {
              violationCount: page.axe.violationCount,
              byImpact: { ...page.axe.byImpact },
              affectedElementCount: page.axe.affectedElementCount,
              ruleIds: [...page.axe.ruleIds],
            },
      metrics:
        page.metrics === undefined
          ? null
          : {
              largestContentfulPaintMs: page.metrics.largestContentfulPaintMs,
              cumulativeLayoutShift: page.metrics.cumulativeLayoutShift,
              longTaskCount: page.metrics.longTaskCount,
              mainThreadBlockingMs: page.metrics.mainThreadBlockingMs,
              requestCount: page.metrics.requestCount,
              transferBytes: page.metrics.transferBytes,
              thirdPartyRequestCount: page.metrics.thirdPartyRequestCount,
              sizeUnavailableCount: page.metrics.sizeUnavailableCount,
              observationWindowMs: page.metrics.observationWindowMs,
            },
      bookingEvidenceKinds: page.bookingEvidenceKinds ?? [],
      skippedByRobots: page.skippedByRobots ?? false,
      durationMs: page.durationMs,
    })),
  };
}

export type OperatorEvidenceAssetView =
  | {
      state: 'captured';
      pageRole: HotelPrescanPageRole;
      selectionReason: HotelEvidenceSelectionReason;
      byteSize: number;
      width: number;
      height: number;
      /** The evidence record's own bilingual alternative text (issue #92), so
       *  the dashboard can render the asset accessibly. Part of the public
       *  preview already, so nothing new leaves the operator boundary. */
      altText: HotelEvidenceBilingualText;
    }
  | { state: 'omitted'; reason: HotelEvidenceOmissionReason };

export interface OperatorEvidenceSummaryView {
  observation: { fr: string; en: string };
  severity: Severity;
  wcagCriteria: string[];
  pageRole: HotelPrescanPageRole;
}

export interface OperatorEvidenceView {
  prescanId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  evidenceStatus: 'complete' | 'incomplete';
  renderComparison: OperatorEvidenceAssetView;
  specificFailure: OperatorEvidenceAssetView;
  summaries: OperatorEvidenceSummaryView[];
}

export interface GetProspectEvidenceViewOptions {
  prescanVersion?: string;
}

/** The two evidence assets' status. Captured assets are described by size and
 *  selection reason only: the sha256, the artifact ref, and the fact ref all
 *  stay out, because a view that returned them would let a route hand over
 *  artifact addresses without deciding to. */
export async function getProspectEvidenceView(
  connection: Connection,
  candidateId: string,
  options: GetProspectEvidenceViewOptions = {},
): Promise<OperatorEvidenceView | null> {
  const prescan = await latestPrescanForCandidate(connection, candidateId, options.prescanVersion);
  if (prescan === null || prescan.evidence === undefined) return null;
  const evidence = prescan.evidence;
  const identity = await candidateIdentityView(connection, candidateId);
  return {
    prescanId: prescan.prescanId,
    ...identity,
    evidenceStatus: evidence.status,
    renderComparison: projectEvidenceAsset(evidence.renderComparison),
    specificFailure: projectEvidenceAsset(evidence.specificFailure),
    summaries: evidence.summaries.map((summary) => ({
      observation: { fr: summary.observation.fr, en: summary.observation.en },
      severity: summary.severity,
      wcagCriteria: [...summary.wcagCriteria],
      pageRole: summary.pageRole,
    })),
  };
}

/** Which of the two evidence assets is asked for. The dashboard slot names
 *  the same two assets by page (homepage, contact); this is the store's
 *  evidence-field naming. */
export type OperatorEvidenceAssetSlot = 'renderComparison' | 'specificFailure';

/** What a route needs to resolve one evidence asset's bytes without the JSON
 *  view ever carrying an artifact address (issue #92): the prescan's own
 *  location facts plus the asset ref and digest it already stores. This type
 *  is for the byte-serving path only - a caller that sends it to a client
 *  verbatim would defeat the projection rule above. */
export interface OperatorEvidenceAssetSource {
  prescanId: string;
  /** The prescan's domain: the hostname of the artifacts layout. */
  domain: string;
  startedAt: Date;
  /** Prescan directory relative to the prescans root, exactly as stored. */
  artifactsDir: string;
  /** Asset ref relative to the prescan directory (evidence/<sha256>.png). */
  ref: string;
  sha256: string;
  mimeType: 'image/png';
  byteSize: number;
}

export interface GetProspectEvidenceAssetSourceOptions {
  prescanVersion?: string;
}

/** The stored facts needed to resolve one captured evidence asset's bytes.
 *  Null when there is no prescan, no evidence, or the slot's asset was
 *  omitted: a missing asset has nothing to serve, and the caller answers 404
 *  rather than inventing a placeholder. */
export async function getProspectEvidenceAssetSource(
  connection: Connection,
  candidateId: string,
  slot: OperatorEvidenceAssetSlot,
  options: GetProspectEvidenceAssetSourceOptions = {},
): Promise<OperatorEvidenceAssetSource | null> {
  const prescan = await latestPrescanForCandidate(connection, candidateId, options.prescanVersion);
  if (prescan === null || prescan.evidence === undefined) return null;
  const asset: HotelEvidenceAsset = prescan.evidence[slot];
  if (asset.state !== 'captured') return null;
  return {
    prescanId: prescan.prescanId,
    domain: prescan.domain,
    startedAt: prescan.startedAt,
    artifactsDir: prescan.artifactsDir,
    ref: asset.ref,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
  };
}

function projectEvidenceAsset(asset: HotelEvidenceAsset): OperatorEvidenceAssetView {
  if (asset.state === 'omitted') {
    return { state: 'omitted', reason: asset.reason };
  }
  return {
    state: 'captured',
    pageRole: asset.pageRole,
    selectionReason: asset.selectionReason,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    altText: { fr: asset.altText.fr, en: asset.altText.en },
  };
}

async function latestPrescanForCandidate(
  connection: Connection,
  candidateId: string,
  prescanVersion?: string,
): Promise<PrescanDocument | null> {
  // Versioned lookups compose getLatestPrescan; the any-version case has no
  // existing helper and is one indexed query by candidateId.
  if (prescanVersion !== undefined) {
    return getLatestPrescan(connection, candidateId, prescanVersion);
  }
  return createPrescanModel(connection)
    .findOne({ candidateId })
    .sort({ startedAt: -1, prescanId: 1 })
    .lean<PrescanDocument>();
}
