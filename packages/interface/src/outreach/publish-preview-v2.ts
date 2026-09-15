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
import { buildOutreachFactsBlock } from '@odysseus/core';
import { logger } from '../logger.js';

export type PublishPreviewV2Refusal =
  | 'prospect-unknown'
  | 'no-audit'
  | 'stale-provenance'
  | 'coverage-incomplete'
  | 'domain-mismatch'
  | 'suppressed'
  | 'insufficient-safe-cards';

export function previewLinks(publicBaseUrl: string): {
  offer: string;
  privacy: string;
  optOut: string;
} {
  const base = publicBaseUrl.replace(/\/+$/u, '');
  return {
    offer: `${base}/offre`,
    privacy: `${base}/confidentialite-prospection`,
    optOut: `${base}/desinscription`,
  };
}

function previewUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/u, '')}/apercu/${token}`;
}

/** Everything publication needs about one candidate's outreach audit, read
 *  in one go by the store adapter: the resolved audit itself, its findings,
 *  the catalogue name, and the qualification's stored Sirene join. No query
 *  is issued inside this module. */
export type OutreachPublicationAudit = Pick<
  AuditDocumentFields,
  'auditId' | 'finishedAt' | 'pages' | 'continuationGuardSummary' | 'gradeOverride'
>;

export interface OutreachPublicationRowV2 {
  prospectId: string;
  domain: string;
  businessName: string;
  audit: OutreachPublicationAudit;
  findings: readonly Finding[];
}

export interface RecordPreviewV2Input {
  tokenHash: string;
  objectKey: string;
  prospectId: string;
  domain: string;
  language: 'fr' | 'en';
  publishedAt: Date;
  auditId: string;
}

export interface OutreachPreviewStorePortV2 {
  findPublicationRow(
    prospectId: string,
  ): Promise<OutreachPublicationRowV2 | { refused: PublishPreviewV2Refusal }>;
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
  prospectId: string;
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
  // The prospect hub publication contract contains only the public audit
  // facts. Keep the compliance block deterministic without a registry join.
  const assessment = undefined;
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
      dataOrigins: ['public-hotel-catalogue', 'public-website'],
    },
    links: previewLinks(publicBaseUrl),
    language,
    facts,
    ...(row.audit.gradeOverride !== undefined
      ? { gradeOverride: row.audit.gradeOverride.grade }
      : {}),
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
  /** The safe aggregate facts rendered by the scorecard and reused by Touch 1. */
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: OutreachPreviewSummary['severityTotals'];
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

function aggregateFacts(
  findings: readonly Finding[],
): Pick<ResolvedPublishedPreview, 'distinctFindingCount' | 'affectedPageCount' | 'severityTotals'> {
  const affectedPages = new Set<string>();
  const severityTotals: OutreachPreviewSummary['severityTotals'] = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const finding of findings) {
    severityTotals[finding.severity] += 1;
    for (const pageUrl of finding.pageUrls) affectedPages.add(pageUrl);
  }
  return {
    distinctFindingCount: findings.length,
    affectedPageCount: affectedPages.size,
    severityTotals,
  };
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
    prospectId: string;
    auditId?: string;
    publicExpiresAt: Date;
  } | null>;
  resolveOutreachAudit: (
    prospectId: string,
  ) => Promise<{ state: 'resolved'; audit: { auditId: string } } | { state: 'refused' }>;
  /** The immutable audit findings used both for the preview and the email aggregates. */
  findingsForAudit: (auditId: string) => Promise<readonly Finding[]>;
  prospectId: string;
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
  if (record.prospectId !== options.prospectId) return { refusal: 'preview-wrong-audit' };
  const resolution = await options.resolveOutreachAudit(options.prospectId);
  if (resolution.state !== 'resolved' || resolution.audit.auditId !== record.auditId) {
    return { refusal: 'preview-wrong-audit' };
  }
  const findings = await options.findingsForAudit(resolution.audit.auditId);
  // A published v2 preview always had exactly three cards. If deterministic
  // selection no longer yields three, the underlying audit data drifted and
  // the draft must not claim numbers against the already-published page.
  const proofCardCategories = proofCardCategoriesFor(findings);
  if (proofCardCategories.length !== 3) return { refusal: 'preview-wrong-audit' };
  return {
    previewId: record.previewId,
    url: previewUrl(options.publicBaseUrl, options.previewToken),
    publicExpiresAt: record.publicExpiresAt,
    ...aggregateFacts(findings),
    proofCardCategories,
  };
}

export async function publishPreviewV2(
  options: PublishPreviewV2Options,
): Promise<PublishPreviewV2Result> {
  const now = options.now ?? new Date();
  const resolved = await options.store.findPublicationRow(options.prospectId);
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
      prospectId: row.prospectId,
      domain: row.domain,
      language: options.language,
      publishedAt,
      auditId: row.audit.auditId,
    });
  } catch (error) {
    try {
      await options.publisher.delete(objectKey);
    } catch {
      logger.error({ objectKey, prospectId: row.prospectId }, 'orphaned preview object');
    }
    throw error;
  }

  if (!recorded.recorded) {
    // An objection landed between the suppression gate and this write.
    try {
      await options.publisher.delete(objectKey);
    } catch {
      logger.error({ objectKey, prospectId: row.prospectId }, 'orphaned preview object');
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
