/**
 * The coverage facts an outreach preview states, from an audit's coverage
 * summary. Issue #530 removed the v2 summary builder and its proof-card
 * selection that used to live here; the v3 publisher
 * (packages/interface/src/outreach/publish-preview-v2.ts) is the one caller.
 */

import type { OutreachCoverageFacts } from '../types/outreach-preview.js';
import type { AuditCoverageSummary } from '../coverage-summary.js';

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
