/**
 * Pure builder for the v2 outreach preview summary (plan 037): the aggregate
 * scorecard derived from one coverage-complete outreach full audit.
 *
 * Everything here is deterministic. The proof cards are selected in code from
 * the reviewed public-safe copy catalog, never by a model, and a rule without
 * catalog copy is card-ineligible (fail closed): an audit whose findings
 * cannot yield three eligible, public-safe cards refuses to build a summary
 * at all, which is the intended behaviour, not a gap.
 *
 * This module owns the selection ranking; the caller owns the coverage gate
 * (a preview is built only after `assessCrawlCoverage` passes) and the
 * recipient facts. Occurrences never enter: the summary counts distinct
 * findings, the union of affected pages, and nothing finer than that.
 */

import {
  containsProhibitedPreviewContent,
  OUTREACH_PREVIEW_CONTENT_VERSION_V2,
  type OutreachCoverageFacts,
  type OutreachPreviewRecipientFacts,
  type OutreachPreviewSeverity,
  type OutreachPreviewSummary,
  type OutreachProofCard,
} from '../types/outreach-preview.js';
import type { AuditCoverageSummary } from '../coverage-summary.js';
import type { Finding } from '../types/findings.js';
import { SEVERITY_ORDER } from '../normalize/severity.js';

/** One reviewed catalog entry. The catalog itself lives in `report` beside
 *  the renderer's other copy; `core` only sees the lookup, so the contract
 *  stays decoupled from where the copy lives. */
export type OutreachProofCardCopy = { fr: string; en: string };
export type OutreachProofCardCopyLookup = (ruleId: string) => OutreachProofCardCopy | undefined;

export type OutreachPreviewSummaryBuildResult =
  | { state: 'built'; summary: OutreachPreviewSummary }
  | { state: 'refused'; reason: 'insufficient-safe-cards' };

export interface BuildOutreachPreviewSummaryInput {
  auditId: string;
  observedAt: Date;
  coverage: OutreachCoverageFacts;
  findings: readonly Finding[];
  recipient: OutreachPreviewRecipientFacts;
  links: OutreachPreviewSummary['links'];
  /** Rendering language of the document this summary feeds. */
  language: 'fr' | 'en';
  facts: OutreachPreviewSummary['facts'];
  gradeOverride?: OutreachPreviewSummary['gradeOverride'];
  proofCardCopy: OutreachProofCardCopyLookup;
}

/** Maps the audit's coverage summary onto the three public counts. A legacy
 *  summary (kind `legacy-unknown`) maps to undefined: absence of coverage
 *  facts is a refusal upstream, never a zero presented as a measurement. */
export function coverageFactsFromAudit(
  summary: AuditCoverageSummary,
): OutreachCoverageFacts | undefined {
  if (summary.kind !== 'current') return undefined;
  return {
    inventoriedPageCount: summary.inventoriedUrlCount,
    contentCheckedPageCount: summary.content.completed + summary.content.partial,
    performanceMeasuredPageCount:
      summary.passes.lighthouse.completed + summary.passes.lighthouse.partial,
  };
}

interface RankedCandidate {
  ruleId: string;
  title: OutreachProofCardCopy;
  category: OutreachProofCard['category'];
  severity: OutreachPreviewSeverity;
  affectedPageCount: number;
}

/** Severity first, then affected-page count, then the rule id, so two audits
 *  of the same site cannot reorder cards on a whim: equal-severity,
 *  equal-spread findings keep one stable order everywhere. */
function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
    return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  }
  if (a.affectedPageCount !== b.affectedPageCount) {
    return b.affectedPageCount - a.affectedPageCount;
  }
  return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
}

/**
 * Picks up to three cards: strict rank order, except that from the second
 * slot on, a candidate whose category is not on the card set yet is preferred
 * whenever one exists. Three critical accessibility findings and nothing else
 * still yields three accessibility cards; a mixed finding set yields a mixed
 * card set, deterministically.
 */
export function selectOutreachProofCards(
  findings: readonly Finding[],
  proofCardCopy: OutreachProofCardCopyLookup,
): OutreachProofCard[] {
  const eligible: RankedCandidate[] = [];
  for (const finding of findings) {
    const title = proofCardCopy(finding.ruleId);
    if (title === undefined) continue;
    // The catalog is reviewed copy, but the same content guard that judges
    // every other string in the document judges these too. A future catalog
    // entry that composed an unsafe sentence fails closed here.
    if (
      containsProhibitedPreviewContent(title.fr) !== null ||
      containsProhibitedPreviewContent(title.en) !== null
    ) {
      continue;
    }
    eligible.push({
      ruleId: finding.ruleId,
      title,
      category: finding.category,
      severity: finding.severity,
      affectedPageCount: new Set(finding.pageUrls).size,
    });
  }
  eligible.sort(compareCandidates);

  const picked: RankedCandidate[] = [];
  while (picked.length < 3) {
    const chosenCategories = new Set(picked.map((card) => card.category));
    const next =
      eligible.find(
        (candidate) => !picked.includes(candidate) && !chosenCategories.has(candidate.category),
      ) ?? eligible.find((candidate) => !picked.includes(candidate));
    if (next === undefined) break;
    picked.push(next);
  }
  return picked.map((candidate) => ({
    title: candidate.title,
    category: candidate.category,
    severity: candidate.severity,
    affectedPageCount: candidate.affectedPageCount,
  }));
}

export function buildOutreachPreviewSummary(
  input: BuildOutreachPreviewSummaryInput,
): OutreachPreviewSummaryBuildResult {
  const proofCards = selectOutreachProofCards(input.findings, input.proofCardCopy);
  if (proofCards.length < 3) {
    return { state: 'refused', reason: 'insufficient-safe-cards' };
  }

  const affectedPages = new Set<string>();
  const severityTotals: Record<OutreachPreviewSeverity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const finding of input.findings) {
    severityTotals[finding.severity] += 1;
    for (const pageUrl of finding.pageUrls) affectedPages.add(pageUrl);
  }

  const summary: OutreachPreviewSummary = {
    contentVersion: OUTREACH_PREVIEW_CONTENT_VERSION_V2,
    auditId: input.auditId,
    observedAt: input.observedAt,
    language: input.language,
    recipient: input.recipient,
    links: input.links,
    coverage: input.coverage,
    distinctFindingCount: input.findings.length,
    affectedPageCount: affectedPages.size,
    severityTotals,
    ...(input.gradeOverride !== undefined ? { gradeOverride: input.gradeOverride } : {}),
    proofCards: [proofCards[0]!, proofCards[1]!, proofCards[2]!],
    facts: input.facts,
  };
  return { state: 'built', summary };
}
