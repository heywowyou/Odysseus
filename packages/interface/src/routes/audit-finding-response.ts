/**
 * The audit page's view of a finding (issue #510). The page polls every
 * five seconds while report work runs, and it shows at most eight pages and
 * five elements per finding and never reads rawEvidence. Sending each
 * finding whole cost about 29 MB per poll on a 598-finding audit. Counts,
 * the grade and the third-party summary are computed from the full list
 * before this trims it; the page reads the totals from the two counts.
 */

import type { Finding } from '@odysseus/core';

/** Mirrors the dashboard's expansion (audit-detail-model.ts). */
const FINDING_PAGE_PREVIEW_COUNT = 8;
const FINDING_ELEMENT_PREVIEW_COUNT = 5;

export type AuditPageFinding = Omit<Finding, 'rawEvidence'> & {
  /** Unique affected pages, of which `pageUrls` lists the first eight. */
  pageUrlCount: number;
  /** Captured elements, of which `elements` lists the first five. */
  elementCount: number;
};

export function toAuditPageFinding(finding: Finding): AuditPageFinding {
  const { rawEvidence: _rawEvidence, ...rest } = finding;
  const pages = [...new Set(finding.pageUrls)];
  return {
    ...rest,
    pageUrls: pages.slice(0, FINDING_PAGE_PREVIEW_COUNT),
    pageUrlCount: pages.length,
    elements: finding.elements.slice(0, FINDING_ELEMENT_PREVIEW_COUNT),
    elementCount: finding.elements.length,
  };
}
