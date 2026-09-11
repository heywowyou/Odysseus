/**
 * Publishing and withdrawing the v2 full-scan scorecard preview (plan 037).
 *
 * The safety shape is inherited unchanged from the v1 port
 * (`publish-preview.ts`): object first, record second; revoke deletes the
 * object before it marks anything; the raw token exists only in the publish
 * result; suppression is re-checked after the insert. What changes is the
 * source of the document: the aggregate scorecard of ONE candidate-linked,
 * coverage-complete outreach full audit, resolved exactly by
 * `resolveOutreachAuditForCandidate`, never by domain and never from a
 * later rerun.
 *
 * This port refuses the v1 path implicitly by being the only publish path
 * the product exposes: it has no field a prescan could satisfy, and its
 * gates are the full-audit gates.
 */

import {
  buildOutreachPreviewSummary,
  coverageFactsFromAudit,
  selectOutreachProofCards,
  summarizeAuditCoverage,
  type OutreachPreviewSummary,
  type OutreachProofCard,
} from '@odysseus/core';
import type { AuditDocumentFields } from '@odysseus/store';
import type { Finding } from '@odysseus/core';
import { generateOutreachPreviewHtmlV2, OUTREACH_PROOF_CARD_COPY } from '@odysseus/report';
import { createPreviewToken, deriveObjectKey, hashPreviewToken } from './preview-token.js';
import type { PreviewPublisher } from './preview-publisher.js';
import {
  previewLinks,
  previewUrl,
  registryAssessment,
  type PreviewSireneFacts,
} from './publish-preview.js';
import type { OutreachAuditRefusal } from '@odysseus/store';
import { buildOutreachFactsBlock } from '@odysseus/core';
import { logger } from '../logger.js';

export type PublishPreviewV2Refusal = OutreachAuditRefusal | 'insufficient-safe-cards';

/** Everything publication needs about one candidate's outreach audit, read
 *  in one go by the store adapter: the resolved audit itself, its findings,
 *  the catalogue name, and the qualification's stored Sirene join. No query
 *  is issued inside this module. */
export interface OutreachPublicationRowV2 {
  candidateId: string;
  domain: string;
  businessName: string;
  audit: AuditDocumentFields;
  findings: readonly Finding[];
  sirene?: PreviewSireneFacts;
}

export interface RecordPreviewV2Input {
  tokenHash: string;
  objectKey: string;
  candidateId: string;
  domain: string;
  language: 'fr' | 'en';
  publishedAt: Date;
  auditId: string;
}

export interface OutreachPreviewStorePortV2 {
  findPublicationRow(
    candidateId: string,
  ): Promise<OutreachPublicationRowV2 | { refused: OutreachAuditRefusal }>;
  isSuppressed(domain: string): Promise<boolean>;
  /** Same insert-then-recheck-suppression contract as the v1 port: a
   *  `recorded: false` return means the object must come back down. */
  recordPreview(
    input: RecordPreviewV2Input,
  ): Promise<{ recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false }>;
  listLivePreviews(domain: string): Promise<{ previewId: string; objectKey: string }[]>;
  revokePreview(previewId: string, reason: string): Promise<{ changed: boolean }>;
}

export interface PublishPreviewV2Options {
  store: OutreachPreviewStorePortV2;
  publisher: PreviewPublisher;
  publicBaseUrl: string;
  candidateId: string;
  language: 'fr' | 'en';
  dryRun: boolean;
  now?: Date;
}

export interface PublishPreviewV2Result {
  published: boolean;
  refusal?: PublishPreviewV2Refusal;
  previewId?: string;
  /** The raw token, returned exactly once and never stored. */
  url?: string;
  publicExpiresAt?: Date;
  plan?: {
    wouldPublish: true;
    domain: string;
    language: 'fr' | 'en';
    distinctFindings: number;
    affectedPages: number;
    proofCards: 3;
  };
}

export function buildOutreachPreviewSummaryV2(options: {
  row: OutreachPublicationRowV2;
  language: 'fr' | 'en';
  publicBaseUrl: string;
}): { summary: OutreachPreviewSummary } | { refused: 'insufficient-safe-cards' } {
  const { row, language, publicBaseUrl } = options;
  const coverage = coverageFactsFromAudit(summarizeAuditCoverage(row.audit));
  if (coverage === undefined) {
    // A legacy-shaped audit carries no per-page coverage facts; the scorecard
    // would have to invent the numbers, so it refuses instead.
    return { refused: 'insufficient-safe-cards' };
  }
  // Same argument-B posture as v1: the assessment carries only the registry
  // snapshot the qualification pass already stored; no scope determination
  // is computed, because this document is forbidden from stating one.
  const assessment = registryAssessment(row.sirene);
  const facts = buildOutreachFactsBlock({
    assessment,
    language,
    capabilities: { argumentB: true },
  });

  const built = buildOutreachPreviewSummary({
    auditId: row.audit.auditId,
    observedAt: row.audit.finishedAt,
    coverage,
    findings: row.findings,
    recipient: {
      businessName: row.businessName,
      dataOrigins:
        assessment === undefined
          ? ['public-hotel-catalogue', 'public-website']
          : ['public-hotel-catalogue', 'public-website', 'public-business-registry'],
    },
    links: previewLinks(publicBaseUrl),
    language,
    facts,
    proofCardCopy: (ruleId) => OUTREACH_PROOF_CARD_COPY[ruleId],
  });
  if (built.state === 'refused') return { refused: built.reason };
  return { summary: built.summary };
}

function refuse(refusal: PublishPreviewV2Refusal): PublishPreviewV2Result {
  return { published: false, refusal };
}

export type PublishedPreviewDraftRefusal =
  'preview-not-published' | 'preview-revoked' | 'preview-expired' | 'preview-wrong-audit';

export interface ResolvedPublishedPreview {
  previewId: string;
  url: string;
  publicExpiresAt: Date;
  proofCardCategories: OutreachProofCard['category'][];
}

/** The categories of the three proof cards a preview of these findings
 *  shows, in card order. The same deterministic selection publication ran
 *  over the same audit, so the email names what the linked page names. */
function proofCardCategoriesFor(findings: readonly Finding[]): OutreachProofCard['category'][] {
  return selectOutreachProofCards(findings, (ruleId) => OUTREACH_PROOF_CARD_COPY[ruleId])
    .slice(0, 3)
    .map((card) => card.category);
}

/** Validates the one-time token the operator copied at publication against
 *  the record, the candidate, and the candidate's CURRENT outreach audit.
 *  The draft flow consumes this instead of ever publishing on its own: a
 *  token that names nothing, a revoked row, an expired one, or a preview of
 *  a different audit all refuse, so the email can only ever carry a link
 *  the operator deliberately published for exactly this audit. */
export async function resolvePublishedPreviewForDraft(options: {
  findByTokenHash: (tokenHash: string) => Promise<{
    previewId: string;
    status: string;
    sourceKind?: string;
    previewContentVersion: string;
    candidateId: string;
    auditId?: string;
    publicExpiresAt: Date;
  } | null>;
  resolveOutreachAudit: (
    candidateId: string,
  ) => Promise<{ state: 'resolved'; audit: { auditId: string } } | { state: 'refused' }>;
  /** The audit's findings, read only to recompute the proof-card categories. */
  findingsForAudit: (auditId: string) => Promise<readonly Finding[]>;
  candidateId: string;
  previewToken: string;
  publicBaseUrl: string;
  now?: Date;
}): Promise<ResolvedPublishedPreview | { refusal: PublishedPreviewDraftRefusal }> {
  const record = await options.findByTokenHash(hashPreviewToken(options.previewToken));
  if (record === null) return { refusal: 'preview-not-published' };
  if (record.status !== 'live') return { refusal: 'preview-revoked' };
  if (record.sourceKind !== 'full-audit' || record.previewContentVersion !== 'v2') {
    return { refusal: 'preview-not-published' };
  }
  if ((options.now ?? new Date()).getTime() >= record.publicExpiresAt.getTime()) {
    return { refusal: 'preview-expired' };
  }
  if (record.candidateId !== options.candidateId) return { refusal: 'preview-wrong-audit' };
  const resolution = await options.resolveOutreachAudit(options.candidateId);
  if (resolution.state !== 'resolved' || resolution.audit.auditId !== record.auditId) {
    return { refusal: 'preview-wrong-audit' };
  }
  // A published preview always had three cards; none now means the audit's
  // findings changed under it, and the email must not guess what it showed.
  const proofCardCategories = proofCardCategoriesFor(
    await options.findingsForAudit(resolution.audit.auditId),
  );
  if (proofCardCategories.length === 0) return { refusal: 'preview-wrong-audit' };
  return {
    previewId: record.previewId,
    url: previewUrl(options.publicBaseUrl, options.previewToken),
    publicExpiresAt: record.publicExpiresAt,
    proofCardCategories,
  };
}

export async function publishPreviewV2(
  options: PublishPreviewV2Options,
): Promise<PublishPreviewV2Result> {
  const now = options.now ?? new Date();
  const resolved = await options.store.findPublicationRow(options.candidateId);
  if ('refused' in resolved) return refuse(resolved.refused);
  const row = resolved;

  if (await options.store.isSuppressed(row.domain)) return refuse('suppressed');

  if (options.dryRun) {
    return {
      published: false,
      plan: {
        wouldPublish: true,
        domain: row.domain,
        language: options.language,
        distinctFindings: row.findings.length,
        affectedPages: new Set(row.findings.flatMap((finding) => finding.pageUrls)).size,
        proofCards: 3,
      },
    };
  }

  const built = buildOutreachPreviewSummaryV2({
    row,
    language: options.language,
    publicBaseUrl: options.publicBaseUrl,
  });
  if ('refused' in built) return refuse(built.refused);

  // Validates and lints, and throws on either. Nothing is published if it does.
  const html = generateOutreachPreviewHtmlV2(built.summary);

  const token = createPreviewToken();
  const tokenHash = hashPreviewToken(token);
  const objectKey = deriveObjectKey(tokenHash);
  const publishedAt = now;
  const publicExpiresAt = new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await options.publisher.put({ objectKey, html, publicExpiresAt });

  let recorded: { recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false };
  try {
    recorded = await options.store.recordPreview({
      tokenHash,
      objectKey,
      candidateId: row.candidateId,
      domain: row.domain,
      language: options.language,
      publishedAt,
      auditId: row.audit.auditId,
    });
  } catch (error) {
    try {
      await options.publisher.delete(objectKey);
    } catch {
      logger.error({ objectKey, candidateId: row.candidateId }, 'orphaned preview object');
    }
    throw error;
  }

  if (!recorded.recorded) {
    // An objection landed between the suppression gate and this write.
    try {
      await options.publisher.delete(objectKey);
    } catch {
      logger.error({ objectKey, candidateId: row.candidateId }, 'orphaned preview object');
    }
    return refuse('suppressed');
  }

  return {
    published: true,
    previewId: recorded.previewId,
    url: previewUrl(options.publicBaseUrl, token),
    publicExpiresAt: recorded.publicExpiresAt,
  };
}
