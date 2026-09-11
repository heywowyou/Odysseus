/**
 * Publishing and withdrawing outreach previews, milestone 9c plan 009.
 *
 * Plan 037 retired publication: `publishPreview` refuses with 'v1-retired'
 * and never assembles a new prescan-backed document. What remains live here
 * is the read and teardown half of the contract: the stored row's render
 * input (`buildPreviewInput`, for the legacy operator view), the domain
 * revoke, and the small helpers the v2 port (`publish-preview-v2.ts`)
 * reuses so both document kinds keep one definition of a link's shape.
 *
 * The document itself is plan 008's work and is not re-decided here. This
 * module's whole job is the part that can go wrong: checking that this hotel
 * may still be contacted, assembling the preview input out of facts a prescan
 * already recorded, and keeping the object in the bucket and the record in
 * Mongo from disagreeing about whether a link is live.
 *
 * **Order is chosen for the failure that matters.** Publishing wrote the
 * object first and the record second, because an object with no record is a
 * file nobody can reach (its key is a hash of a token that was never handed
 * out), while a record with no object would be a link we told someone to open
 * that 404s. Revoking is the mirror image: the object goes first, because a
 * record marked revoked while the file is still served is exactly the outcome
 * revocation exists to prevent. The v2 port keeps exactly this ordering.
 */

import path from 'node:path';
import {
  HOTEL_EVIDENCE_MAX_SUMMARIES,
  buildOutreachFactsBlock,
  type HotelEvidenceCapturedAsset,
  type HotelPrescanEvidence,
  type ObligationAssessment,
  type OutreachPreviewInput,
  type PublicFindingSummary,
} from '@odysseus/core';
import { embedOutreachEvidenceAsset } from '@odysseus/report';
import { effectifBandLabelFr } from '../prospecting/sirene-stock-index.js';
import type { PreviewPublisher } from './preview-publisher.js';

/** Bumped by hand when the assembled document's shape changes, so a stored
 *  preview can be told apart from one built under different rules without
 *  reopening the object. Never edited in place. */
export const CURRENT_PREVIEW_CONTENT_VERSION = 'v1';

export type PublishPreviewRefusal =
  | 'v1-retired'
  | 'candidate-unknown'
  | 'no-prescan'
  | 'evidence-incomplete'
  | 'evidence-schema-outdated'
  | 'prescan-expired'
  | 'suppressed';

export interface PreviewSireneFacts {
  denomination: string;
  effectifBandCode?: string;
  checkedAt: Date;
  stockVersion?: string;
}

/** Everything publication needs about one hotel, read in one go by the store
 *  adapter so this module never issues a query of its own. */
export interface PreviewPublicationRow {
  candidateId: string;
  domain: string;
  businessName: string;
  prescanId: string;
  prescanVersion: string;
  artifactsDir: string;
  observedAt: Date;
  prescanExpiresAt: Date;
  evidence?: HotelPrescanEvidence;
  sirene?: PreviewSireneFacts;
}

export interface LivePreviewRef {
  previewId: string;
  objectKey: string;
  domain: string;
}

export interface RecordPreviewInput {
  tokenHash: string;
  objectKey: string;
  candidateId: string;
  prescanId: string;
  domain: string;
  language: 'fr' | 'en';
  prescanVersion: string;
  evidenceVersion: string;
  previewContentVersion: string;
  publishedAt: Date;
}

export interface OutreachPreviewStorePort {
  findPublicationRow(candidateId: string): Promise<PreviewPublicationRow | null>;
  isSuppressed(domain: string): Promise<boolean>;
  /** `recorded: false` means the domain was suppressed between the gate below
   *  and this write: the store has already revoked the row it created, and the
   *  publisher must take the uploaded object back down. */
  recordPreview(
    input: RecordPreviewInput,
  ): Promise<{ recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false }>;
  listLivePreviews(domain: string): Promise<LivePreviewRef[]>;
  revokePreview(previewId: string, reason: string): Promise<{ changed: boolean }>;
}

export interface PublishPreviewOptions {
  store: OutreachPreviewStorePort;
  publisher: PreviewPublisher;
  /** Base URL the token is appended to. `www`, because the apex redirects and a
   *  redirect would carry a live token through a second host's request log. */
  publicBaseUrl: string;
  candidateId: string;
  language: 'fr' | 'en';
  dryRun: boolean;
  now?: Date;
}

export interface PublishPreviewResult {
  published: boolean;
  refusal?: PublishPreviewRefusal;
  previewId?: string;
  /** The raw token, returned exactly once and never stored. */
  url?: string;
  publicExpiresAt?: Date;
  /** Populated only by `--dry-run`: what would have happened, nothing observed. */
  plan?: {
    wouldPublish: true;
    domain: string;
    language: 'fr' | 'en';
    summaries: number;
    images: number;
  };
}

/** The registry facts argument B may quote, built from what the qualification
 *  pass already stored. `assessObligations` is deliberately not called: it
 *  decides scope, and `buildOutreachFactsBlock` reads only `registrySnapshot`
 *  and never a verdict (trade-off 42), so running a scope determination here
 *  would compute a conclusion this document is forbidden from stating. */
export function registryAssessment(
  sirene: PreviewSireneFacts | undefined,
): ObligationAssessment | undefined {
  if (sirene === undefined || sirene.denomination === '') return undefined;
  return {
    status: 'undetermined',
    basis: [],
    registrySnapshot: {
      denomination: sirene.denomination,
      effectifBandLabel:
        sirene.effectifBandCode === undefined ? null : effectifBandLabelFr(sirene.effectifBandCode),
      retrievedAt: sirene.checkedAt,
      source:
        sirene.stockVersion === undefined ? 'sirene-stock' : `sirene-stock:${sirene.stockVersion}`,
    },
  };
}

function capturedAssets(
  evidence: HotelPrescanEvidence,
): { asset: HotelEvidenceCapturedAsset; slot: 'renderComparison' | 'specificFailure' }[] {
  const slots = [
    { asset: evidence.renderComparison, slot: 'renderComparison' as const },
    { asset: evidence.specificFailure, slot: 'specificFailure' as const },
  ];
  return slots.flatMap((entry) =>
    entry.asset.state === 'captured' ? [{ asset: entry.asset, slot: entry.slot }] : [],
  );
}

/** Straight through from the evidence record. The cap is re-applied because the
 *  preview schema's own bound is narrower than nothing, and a stored record
 *  that somehow carried more should be trimmed here rather than rejected at
 *  render time with a message about a schema. */
function toSummaries(evidence: HotelPrescanEvidence): PublicFindingSummary[] {
  return evidence.summaries.slice(0, HOTEL_EVIDENCE_MAX_SUMMARIES).map((summary) => ({
    observation: summary.observation,
    severity: summary.severity,
    wcagCriteria: summary.wcagCriteria,
    pageRole: summary.pageRole,
  }));
}

export function previewLinks(publicBaseUrl: string): OutreachPreviewInput['links'] {
  const base = publicBaseUrl.replace(/\/+$/u, '');
  return {
    offer: `${base}/offre`,
    privacy: `${base}/confidentialite-prospection`,
    optOut: `${base}/desinscription`,
  };
}

export function previewUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/u, '')}/apercu/${token}`;
}

export async function buildPreviewInput(options: {
  row: PreviewPublicationRow;
  evidence: HotelPrescanEvidence;
  language: 'fr' | 'en';
  publicBaseUrl: string;
}): Promise<OutreachPreviewInput> {
  // A relative artifacts directory reads as an evidence file that does not
  // exist, which is indistinguishable from a swept prescan. It is neither: it
  // is a store adapter that forgot the prescans root, and it should say so.
  if (!path.isAbsolute(options.row.artifactsDir)) {
    throw new Error(
      `outreach preview: artifactsDir "${options.row.artifactsDir}" is relative. The store ` +
        'adapter must resolve it against the prescans root before publication.',
    );
  }

  const images = await Promise.all(
    capturedAssets(options.evidence).map(async (entry) =>
      embedOutreachEvidenceAsset({
        prescanDir: options.row.artifactsDir,
        asset: entry.asset,
        slot: entry.slot,
      }),
    ),
  );

  const assessment = registryAssessment(options.row.sirene);

  return {
    language: options.language,
    businessName: options.row.businessName,
    links: previewLinks(options.publicBaseUrl),
    dataOrigins:
      assessment === undefined
        ? ['public-hotel-catalogue', 'public-website']
        : ['public-hotel-catalogue', 'public-website', 'public-business-registry'],
    summaries: toSummaries(options.evidence),
    images,
    facts: buildOutreachFactsBlock({
      assessment,
      language: options.language,
      capabilities: { argumentB: true },
    }),
    observedAt: options.row.observedAt,
  };
}

function refuse(refusal: PublishPreviewRefusal): PublishPreviewResult {
  return { published: false, refusal };
}

export async function publishPreview(
  _options: PublishPreviewOptions,
): Promise<PublishPreviewResult> {
  // Plan 037: the prescan-backed preview is retired. No path may create a
  // new v1 preview, so this is a refusal before any gate, any build, and
  // any write - the function survives only because stored v1 rows keep
  // their render and revocation paths until they expire. The retired
  // publication body itself lives in git history (the slice 6 commit).
  return refuse('v1-retired');
}

export interface RevokePreviewsResult {
  revoked: number;
  alreadyRevoked: number;
}

/**
 * Withdraws every live preview for a domain. The object goes first: a record
 * that says revoked while the file is still served is the one outcome this must
 * never produce, so a delete that throws stops the whole operation rather than
 * marking anything.
 */
export async function revokePreviewsForDomain(options: {
  store: OutreachPreviewStorePort;
  publisher: PreviewPublisher;
  domain: string;
  reason: string;
}): Promise<RevokePreviewsResult> {
  const live = await options.store.listLivePreviews(options.domain);
  let revoked = 0;
  let alreadyRevoked = 0;

  for (const preview of live) {
    await options.publisher.delete(preview.objectKey);
    const result = await options.store.revokePreview(preview.previewId, options.reason);
    if (result.changed) revoked += 1;
    else alreadyRevoked += 1;
  }

  return { revoked, alreadyRevoked };
}
