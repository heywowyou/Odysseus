/**
 * Current outreach-preview publication path.
 *
 * Plan 069 makes new publications v3: the public wording remains deterministic
 * and reviewed, while card ORDER comes from the selected French report
 * structure. Historical v2 rows remain resolvable for an already-published
 * first-touch link; nothing creates new v2 rows.
 */

import {
  buildOutreachFactsBlock,
  containsProhibitedPreviewContent,
  coverageFactsFromAudit,
  outreachPreviewSummaryV3Schema,
  selectOutreachProofCards,
  summarizeAuditCoverage,
  type AuditManifest,
  type Finding,
  type FindingCategory,
  type OutreachPreviewSeverity,
  type OutreachPreviewSummaryV3,
  type OutreachProofCard,
} from '@odysseus/core';
import type { AnalysisDocument, AuditDocumentFields } from '@odysseus/store';
import {
  buildRenderedPriorities,
  generateOutreachPreviewHtmlV3,
  MissingReviewedRemediationError,
  OUTREACH_PROOF_CARD_COPY,
  OutreachPreviewLintError,
  isConfinedToThirdPartyFrame,
  primaryFindingFilter,
} from '@odysseus/report';
import { createPreviewToken, deriveObjectKey, hashPreviewToken } from './preview-token.js';
import type { PreviewPublisher } from './preview-publisher.js';
import { logger } from '../logger.js';

export type PublishPreviewV3Refusal =
  | 'prospect-unknown'
  | 'no-audit'
  | 'coverage-incomplete'
  | 'report-not-ready'
  | 'domain-mismatch'
  | 'suppressed'
  | 'insufficient-safe-cards'
  | 'priority-copy-unavailable'
  | 'preview-lint-rejected'
  | 'superseded-preview-cleanup-failed';

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

export type OutreachPublicationAudit = AuditDocumentFields;

export interface OutreachPublicationRowV3 {
  prospectId: string;
  domain: string;
  businessName: string;
  dataOrigins: Array<'public-hotel-catalogue' | 'public-website' | 'public-business-registry'>;
  audit: OutreachPublicationAudit;
  findings: readonly Finding[];
  analysis: AnalysisDocument;
}

export interface PublishedPreviewFacts {
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  priorityCardCategories: OutreachProofCard['category'][];
}

export interface RecordPreviewV3Input {
  tokenHash: string;
  objectKey: string;
  previewUrl: string;
  prospectId: string;
  domain: string;
  language: 'fr' | 'en';
  publishedAt: Date;
  auditId: string;
  sourceAnalysisId: string;
  sourceFindingsDigest: string;
  publishedFacts: PublishedPreviewFacts;
}

export interface OutreachPreviewStorePortV3 {
  findPublicationRow(
    prospectId: string,
  ): Promise<OutreachPublicationRowV3 | { refused: PublishPreviewV3Refusal }>;
  isSuppressed(domain: string): Promise<boolean>;
  recordPreview(
    input: RecordPreviewV3Input,
  ): Promise<{ recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false }>;
  listLivePreviews(domain: string): Promise<{ previewId: string; objectKey: string }[]>;
  revokePreview(previewId: string, reason: string): Promise<{ changed: boolean }>;
}

export interface PublishPreviewV3Options {
  store: OutreachPreviewStorePortV3;
  publisher: PreviewPublisher;
  publicBaseUrl: string;
  prospectId: string;
  language: 'fr' | 'en';
  dryRun: boolean;
  now?: Date;
}

export interface PublishPreviewV3Result {
  published: boolean;
  refusal?: PublishPreviewV3Refusal;
  previewId?: string;
  url?: string;
  publicExpiresAt?: Date;
  plan?: {
    wouldPublish: true;
    domain: string;
    language: 'fr' | 'en';
    distinctFindings: number;
    affectedPages: number;
    priorityCards: 3;
  };
}

function aggregateFacts(
  findings: readonly Finding[],
): Pick<PublishedPreviewFacts, 'distinctFindingCount' | 'affectedPageCount' | 'severityTotals'> {
  const affectedPages = new Set<string>();
  const severityTotals: Record<OutreachPreviewSeverity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  const primaryFindings = findings.filter((finding) => !isConfinedToThirdPartyFrame(finding));
  for (const finding of primaryFindings) {
    severityTotals[finding.severity] += 1;
    for (const pageUrl of finding.pageUrls) affectedPages.add(pageUrl);
  }
  return {
    distinctFindingCount: primaryFindings.length,
    affectedPageCount: affectedPages.size,
    severityTotals,
  };
}

/** Counted over the same population as `aggregateFacts`, so the two
 *  breakdowns always add up to the same distinct finding count. */
function categoryTotalsFor(findings: readonly Finding[]): Record<FindingCategory, number> {
  const totals: Record<FindingCategory, number> = {
    accessibility: 0,
    seo: 0,
    geo: 0,
    performance: 0,
    rendering: 0,
    privacy: 0,
  };
  for (const finding of findings) {
    if (!isConfinedToThirdPartyFrame(finding)) totals[finding.category] += 1;
  }
  return totals;
}

const UNDER_CORRECTION_RULE_IDS = new Set<string>();
const BLOCKED_PROOF_STATUSES = new Set<string>([
  'blocked',
  'redirect-interstitial',
  'soft-error-page',
  'http-error-status',
  'skipped-external-redirect',
]);

function safePreviewFindings(row: OutreachPublicationRowV3): Finding[] {
  const inPrimaryReportPopulation = primaryFindingFilter(row.audit as unknown as AuditManifest);
  const blockedUrls = new Set(
    row.audit.pages
      .filter((page) => BLOCKED_PROOF_STATUSES.has(page.status))
      .map((page) => page.url),
  );
  return row.findings.filter(
    (finding) =>
      inPrimaryReportPopulation(finding) &&
      !UNDER_CORRECTION_RULE_IDS.has(finding.ruleId) &&
      !finding.pageUrls.some((pageUrl) => blockedUrls.has(pageUrl)),
  );
}

export function buildOutreachPreviewSummaryV3(options: {
  row: OutreachPublicationRowV3;
  language: 'fr' | 'en';
  publicBaseUrl: string;
}):
  | {
      summary: OutreachPreviewSummaryV3;
      sourceAnalysisId: string;
      sourceFindingsDigest: string;
      publishedFacts: PublishedPreviewFacts;
    }
  | {
      refused:
        | 'coverage-incomplete'
        | 'report-not-ready'
        | 'insufficient-safe-cards'
        | 'priority-copy-unavailable'
        | 'superseded-preview-cleanup-failed';
    } {
  const { row, language, publicBaseUrl } = options;
  const coverage = coverageFactsFromAudit(summarizeAuditCoverage(row.audit));
  if (coverage === undefined) return { refused: 'coverage-incomplete' };

  const sourceFindingsDigest = row.audit.findingsProvenance?.findingsDigest;
  if (sourceFindingsDigest === undefined) return { refused: 'report-not-ready' };

  const safeFindings = safePreviewFindings(row);

  let priorities: ReturnType<typeof buildRenderedPriorities>;
  try {
    priorities = buildRenderedPriorities(
      row.analysis.themes,
      safeFindings,
      row.audit as unknown as AuditManifest,
      'fr',
    );
  } catch (error) {
    if (error instanceof MissingReviewedRemediationError) {
      return { refused: 'priority-copy-unavailable' };
    }
    throw error;
  }
  if (priorities.length < 3) return { refused: 'insufficient-safe-cards' };

  const priorityCards = priorities.slice(0, 3).map((priority, index) => {
    const representative = priority.evidence.representativeFinding;
    const copy = OUTREACH_PROOF_CARD_COPY[representative.ruleId];
    if (
      copy === undefined ||
      containsProhibitedPreviewContent(copy.fr) !== null ||
      containsProhibitedPreviewContent(copy.en) !== null
    ) {
      return undefined;
    }
    return {
      rank: (index + 1) as 1 | 2 | 3,
      title: copy,
      category: priority.theme.category,
      severity: representative.severity,
      affectedPageCount: priority.evidence.uniquePageCount,
    };
  });
  if (priorityCards.some((card) => card === undefined)) {
    return { refused: 'priority-copy-unavailable' };
  }
  const cards = priorityCards as [
    NonNullable<(typeof priorityCards)[number]>,
    NonNullable<(typeof priorityCards)[number]>,
    NonNullable<(typeof priorityCards)[number]>,
  ];

  const aggregate = aggregateFacts(safeFindings);
  const facts = buildOutreachFactsBlock({
    assessment: row.analysis.obligationAssessment,
    language,
    capabilities: { argumentB: true },
  });
  const summary: OutreachPreviewSummaryV3 = {
    contentVersion: 'v3',
    language,
    recipient: {
      businessName: row.businessName,
      dataOrigins: row.dataOrigins,
    },
    links: previewLinks(publicBaseUrl),
    coverage,
    ...aggregate,
    categoryTotals: categoryTotalsFor(safeFindings),
    priorityCards: cards,
    facts,
  };
  outreachPreviewSummaryV3Schema.parse(summary);

  const publishedFacts: PublishedPreviewFacts = {
    ...aggregate,
    priorityCardCategories: cards.map((card) => card.category),
  };
  return {
    summary,
    sourceAnalysisId: row.analysis.analysisId,
    sourceFindingsDigest,
    publishedFacts,
  };
}

function refuse(refusal: PublishPreviewV3Refusal): PublishPreviewV3Result {
  return { published: false, refusal };
}

/** The final lint is fail-closed by design; a rejection is reported as a
 *  refusal the dashboard can name rather than an unhandled server error. */
export function renderOutreachPreviewHtmlV3(
  summary: OutreachPreviewSummaryV3,
): { html: string } | { refused: 'preview-lint-rejected' } {
  try {
    return { html: generateOutreachPreviewHtmlV3(summary) };
  } catch (error) {
    if (!(error instanceof OutreachPreviewLintError)) throw error;
    logger.error({ rule: error.rule }, 'outreach preview rejected by its final lint');
    return { refused: 'preview-lint-rejected' };
  }
}

export type PublishedPreviewDraftRefusal =
  | 'preview-not-published'
  | 'preview-revoked'
  | 'preview-expired'
  | 'preview-wrong-audit'
  | 'preview-stale';

export interface ResolvedPublishedPreview {
  previewId: string;
  url: string;
  publicExpiresAt: Date;
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  /** Compatibility name consumed by the deterministic Touch-1 template.
   * V3 values are the published priority-card categories, in report order. */
  proofCardCategories: OutreachProofCard['category'][];
}

function v2ProofCardCategoriesFor(findings: readonly Finding[]): OutreachProofCard['category'][] {
  return selectOutreachProofCards(findings, (ruleId) => OUTREACH_PROOF_CARD_COPY[ruleId])
    .slice(0, 3)
    .map((card) => card.category);
}

/** V3 uses the exact bounded facts persisted at publication. V2 remains
 * resolvable for historical live links and keeps its old recomputation rule. */
export async function resolvePublishedPreviewForDraft(options: {
  findByTokenHash: (tokenHash: string) => Promise<{
    previewId: string;
    status: string;
    sourceKind?: string;
    previewContentVersion: string;
    prospectId: string;
    auditId?: string;
    publicExpiresAt: Date;
    sourceAnalysisId?: string;
    sourceFindingsDigest?: string;
    publishedFacts?: PublishedPreviewFacts;
  } | null>;
  resolveOutreachAudit: (prospectId: string) => Promise<
    | {
        state: 'resolved';
        audit: {
          auditId: string;
          findingsDigest?: string;
          selectedFrAnalysisId?: string;
        };
      }
    | { state: 'refused' }
  >;
  findingsForAudit: (auditId: string) => Promise<readonly Finding[]>;
  prospectId: string;
  previewToken: string;
  publicBaseUrl: string;
  now?: Date;
}): Promise<ResolvedPublishedPreview | { refusal: PublishedPreviewDraftRefusal }> {
  const record = await options.findByTokenHash(hashPreviewToken(options.previewToken));
  if (record === null) return { refusal: 'preview-not-published' };
  if (record.status !== 'live') return { refusal: 'preview-revoked' };
  if (record.sourceKind !== 'full-audit') return { refusal: 'preview-not-published' };
  if ((options.now ?? new Date()).getTime() >= record.publicExpiresAt.getTime()) {
    return { refusal: 'preview-expired' };
  }
  if (record.prospectId !== options.prospectId) return { refusal: 'preview-wrong-audit' };

  const resolution = await options.resolveOutreachAudit(options.prospectId);
  if (resolution.state !== 'resolved' || resolution.audit.auditId !== record.auditId) {
    return { refusal: 'preview-wrong-audit' };
  }

  if (record.previewContentVersion === 'v3') {
    const facts = record.publishedFacts;
    if (
      record.sourceAnalysisId === undefined ||
      record.sourceFindingsDigest === undefined ||
      facts === undefined ||
      facts.priorityCardCategories.length !== 3
    ) {
      return { refusal: 'preview-stale' };
    }
    if (
      resolution.audit.selectedFrAnalysisId !== record.sourceAnalysisId ||
      resolution.audit.findingsDigest !== record.sourceFindingsDigest
    ) {
      return { refusal: 'preview-stale' };
    }
    return {
      previewId: record.previewId,
      url: previewUrl(options.publicBaseUrl, options.previewToken),
      publicExpiresAt: record.publicExpiresAt,
      distinctFindingCount: facts.distinctFindingCount,
      affectedPageCount: facts.affectedPageCount,
      severityTotals: facts.severityTotals,
      proofCardCategories: [...facts.priorityCardCategories],
    };
  }

  if (record.previewContentVersion !== 'v2') return { refusal: 'preview-not-published' };

  const findings = await options.findingsForAudit(resolution.audit.auditId);
  const proofCardCategories = v2ProofCardCategoriesFor(findings);
  if (proofCardCategories.length !== 3) return { refusal: 'preview-wrong-audit' };
  return {
    previewId: record.previewId,
    url: previewUrl(options.publicBaseUrl, options.previewToken),
    publicExpiresAt: record.publicExpiresAt,
    ...aggregateFacts(findings),
    proofCardCategories,
  };
}

export async function publishPreviewV3(
  options: PublishPreviewV3Options,
): Promise<PublishPreviewV3Result> {
  const now = options.now ?? new Date();
  const resolved = await options.store.findPublicationRow(options.prospectId);
  if ('refused' in resolved) return refuse(resolved.refused);
  const row = resolved;

  if (await options.store.isSuppressed(row.domain)) return refuse('suppressed');

  const built = buildOutreachPreviewSummaryV3({
    row,
    language: options.language,
    publicBaseUrl: options.publicBaseUrl,
  });
  if ('refused' in built) return refuse(built.refused);

  const rendered = renderOutreachPreviewHtmlV3(built.summary);
  if ('refused' in rendered) return refuse(rendered.refused);

  if (options.dryRun) {
    return {
      published: false,
      plan: {
        wouldPublish: true,
        domain: row.domain,
        language: options.language,
        distinctFindings: built.publishedFacts.distinctFindingCount,
        affectedPages: built.publishedFacts.affectedPageCount,
        priorityCards: 3,
      },
    };
  }

  const { html } = rendered;
  const token = createPreviewToken();
  const tokenHash = hashPreviewToken(token);
  const objectKey = deriveObjectKey(tokenHash);
  const publishedAt = now;
  const publicExpiresAt = new Date(publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const url = previewUrl(options.publicBaseUrl, token);

  await options.publisher.put({ objectKey, html, publicExpiresAt });

  let recorded: { recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false };
  try {
    recorded = await options.store.recordPreview({
      tokenHash,
      objectKey,
      previewUrl: url,
      prospectId: row.prospectId,
      domain: row.domain,
      language: options.language,
      publishedAt,
      auditId: row.audit.auditId,
      sourceAnalysisId: built.sourceAnalysisId,
      sourceFindingsDigest: built.sourceFindingsDigest,
      publishedFacts: built.publishedFacts,
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
    try {
      await options.publisher.delete(objectKey);
    } catch {
      logger.error({ objectKey, prospectId: row.prospectId }, 'orphaned preview object');
    }
    return refuse('suppressed');
  }

  const livePreviews = await options.store.listLivePreviews(row.domain);
  for (const previous of livePreviews) {
    if (previous.previewId === recorded.previewId) continue;
    try {
      await options.publisher.delete(previous.objectKey);
      await options.store.revokePreview(previous.previewId, 'superseded by a new first-email call');
    } catch (error) {
      // Do not leave the newly published replacement behind when an older
      // public object could not be safely taken down. The failed old cleanup
      // leaves its database record live, so the link remains valid.
      try {
        await options.publisher.delete(objectKey);
      } catch (cleanupError) {
        logger.error(
          { objectKey, prospectId: row.prospectId, err: cleanupError },
          'orphaned preview object',
        );
      }
      try {
        await options.store.revokePreview(recorded.previewId, 'superseded-preview cleanup failed');
      } catch (cleanupError) {
        logger.error(
          { previewId: recorded.previewId, err: cleanupError },
          'orphaned preview record',
        );
      }
      logger.error(
        { previewId: previous.previewId, err: error },
        'could not clean superseded preview',
      );
      return refuse('superseded-preview-cleanup-failed');
    }
  }

  return {
    published: true,
    previewId: recorded.previewId,
    url,
    publicExpiresAt: recorded.publicExpiresAt,
  };
}
