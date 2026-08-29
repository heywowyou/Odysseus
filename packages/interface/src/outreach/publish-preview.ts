/**
 * Publishing and withdrawing outreach previews, milestone 9c plan 009.
 *
 * The document itself is plan 008's work and is not re-decided here. This
 * module's whole job is the part that can go wrong: checking that this hotel
 * may still be contacted, assembling the preview input out of facts a prescan
 * already recorded, and keeping the object in the bucket and the record in
 * Mongo from disagreeing about whether a link is live.
 *
 * **Assembly is a mapping, never a re-derivation.** Summaries, images and their
 * alt text come from `HotelPrescanEvidence` exactly as plan 005 wrote them.
 * Nothing here decides what is worth showing a hotel; if it were, the preview
 * could say something the evidence contract had already rejected.
 *
 * **Order is chosen for the failure that matters.** Publishing writes the
 * object first and the record second, because an object with no record is a
 * file nobody can reach (its key is a hash of a token that was never handed
 * out), while a record with no object would be a link we told someone to open
 * that 404s. Revoking is the mirror image: the object goes first, because a
 * record marked revoked while the file is still served is exactly the outcome
 * revocation exists to prevent.
 */

import path from 'node:path';
import {
  HOTEL_EVIDENCE_MAX_SUMMARIES,
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  buildOutreachFactsBlock,
  type HotelEvidenceCapturedAsset,
  type HotelPrescanEvidence,
  type ObligationAssessment,
  type OutreachPreviewInput,
  type PublicFindingSummary,
} from '@odysseus/core';
import { embedOutreachEvidenceAsset, generateOutreachPreviewHtml } from '@odysseus/report';
import { effectifBandLabelFr } from '../prospecting/sirene-stock-index.js';
import { logger } from '../logger.js';
import { createPreviewToken, deriveObjectKey, hashPreviewToken } from './preview-token.js';
import type { PreviewPublisher } from './preview-publisher.js';

/** Bumped by hand when the assembled document's shape changes, so a stored
 *  preview can be told apart from one built under different rules without
 *  reopening the object. Never edited in place. */
export const CURRENT_PREVIEW_CONTENT_VERSION = 'v1';

export type PublishPreviewRefusal =
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
  recordPreview(input: RecordPreviewInput): Promise<{ previewId: string; publicExpiresAt: Date }>;
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
function registryAssessment(
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
  options: PublishPreviewOptions,
): Promise<PublishPreviewResult> {
  const now = options.now ?? new Date();
  const row = await options.store.findPublicationRow(options.candidateId);
  if (row === null) return refuse('candidate-unknown');

  // Suppression before anything else, and again in the CLI before a send. An
  // objection has to stop the next thing we do, not the next batch.
  if (await options.store.isSuppressed(row.domain)) return refuse('suppressed');

  const evidence = row.evidence;
  if (evidence === undefined || evidence.status !== 'complete')
    return refuse('evidence-incomplete');
  if (evidence.schemaVersion !== HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION) {
    return refuse('evidence-schema-outdated');
  }
  if (evidence.summaries.length < HOTEL_EVIDENCE_MIN_SUMMARIES)
    return refuse('evidence-incomplete');
  // A prescan past its own retention describes a site as it was too long ago to
  // show anybody, and its screenshots may already have been swept.
  if (row.prescanExpiresAt.getTime() <= now.getTime()) return refuse('prescan-expired');

  if (options.dryRun) {
    return {
      published: false,
      plan: {
        wouldPublish: true,
        domain: row.domain,
        language: options.language,
        summaries: evidence.summaries.length,
        images: capturedAssets(evidence).length,
      },
    };
  }

  const input = await buildPreviewInput({
    row,
    evidence,
    language: options.language,
    publicBaseUrl: options.publicBaseUrl,
  });
  // Validates and lints, and throws on either. Nothing is published if it does.
  const html = generateOutreachPreviewHtml(input);

  const token = createPreviewToken();
  const tokenHash = hashPreviewToken(token);
  const objectKey = deriveObjectKey(tokenHash);
  const publishedAt = now;
  const publicExpiresAt = new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await options.publisher.put({ objectKey, html, publicExpiresAt });

  let recorded: { previewId: string; publicExpiresAt: Date };
  try {
    recorded = await options.store.recordPreview({
      tokenHash,
      objectKey,
      candidateId: row.candidateId,
      prescanId: row.prescanId,
      domain: row.domain,
      language: options.language,
      prescanVersion: row.prescanVersion,
      evidenceVersion: String(evidence.schemaVersion),
      previewContentVersion: CURRENT_PREVIEW_CONTENT_VERSION,
      publishedAt,
    });
  } catch (error) {
    try {
      await options.publisher.delete(objectKey);
    } catch {
      // Both halves failed. The object is unreachable anyway - its key is the
      // hash of a token that was never returned - but it is real and it counts
      // against retention, so it is named here loudly enough to be swept by
      // hand. The key, never the token and never the document.
      logger.error({ objectKey, candidateId: row.candidateId }, 'orphaned preview object');
    }
    throw error;
  }

  return {
    published: true,
    previewId: recorded.previewId,
    url: previewUrl(options.publicBaseUrl, token),
    publicExpiresAt: recorded.publicExpiresAt,
  };
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
