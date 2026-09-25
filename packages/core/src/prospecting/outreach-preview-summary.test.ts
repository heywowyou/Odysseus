import { describe, expect, it } from 'vitest';
import { coverageFactsFromAudit } from './outreach-preview-summary.js';
import type { AuditCoverageSummary, CurrentAuditCoverageSummary } from '../coverage-summary.js';

function currentCoverage(): CurrentAuditCoverageSummary {
  return {
    kind: 'current',
    inventoriedUrlCount: 12,
    noindexPageCount: 0,
    continuationOmittedUrlCount: 0,
    content: { completed: 12, partial: 0, failed: 0 },
    passes: {
      rendered: { completed: 12, partial: 0, failed: 0, notPlanned: 0 },
      axe: { completed: 12, partial: 0, failed: 0, notPlanned: 0 },
      extended: { completed: 12, partial: 0, failed: 0, notPlanned: 0 },
      lighthouse: { completed: 5, partial: 0, failed: 0, notPlanned: 7 },
    },
    pagesWithoutContentAnalysis: {},
    templateFamilyCount: 3,
  };
}

describe('coverageFactsFromAudit', () => {
  it('maps the current summary onto the three public counts', () => {
    expect(coverageFactsFromAudit(currentCoverage())).toEqual({
      inventoriedPageCount: 12,
      contentCheckedPageCount: 12,
      performanceMeasuredPageCount: 5,
    });
  });

  it('counts partial content pages as checked, and refuses a legacy summary', () => {
    const partial = currentCoverage();
    partial.content = { completed: 10, partial: 2, failed: 0 };
    partial.passes.lighthouse = { completed: 4, partial: 1, failed: 0, notPlanned: 7 };
    const mapped = coverageFactsFromAudit(partial);
    expect(mapped).toMatchObject({ contentCheckedPageCount: 12, performanceMeasuredPageCount: 5 });

    const legacy: AuditCoverageSummary = {
      kind: 'legacy-unknown',
      inventoriedUrlCount: 3,
      continuationOmittedUrlCount: 0,
    };
    expect(coverageFactsFromAudit(legacy)).toBeUndefined();
  });
});
