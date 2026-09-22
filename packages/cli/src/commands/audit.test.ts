import { describe, expect, it } from 'vitest';
import type { AuditCoverageSummary } from '@odysseus/core';
import { formatAuditCoverageSummary } from './audit.js';

describe('formatAuditCoverageSummary', () => {
  it('prints inventory, content, axe, Lighthouse, failures, and guarded omissions separately', () => {
    const summary: AuditCoverageSummary = {
      kind: 'current',
      inventoriedUrlCount: 8,
      noindexPageCount: 0,
      continuationOmittedUrlCount: 4,
      content: { completed: 5, partial: 1, failed: 1 },
      passes: {
        rendered: { completed: 6, partial: 1, failed: 0, notPlanned: 0 },
        axe: { completed: 6, partial: 0, failed: 1, notPlanned: 0 },
        extended: { completed: 5, partial: 1, failed: 1, notPlanned: 0 },
        lighthouse: { completed: 2, partial: 0, failed: 1, notPlanned: 4 },
      },
      pagesWithoutContentAnalysis: { 'skipped-robots': 1 },
      templateFamilyCount: 3,
    };

    expect(formatAuditCoverageSummary(summary)).toEqual([
      '  URLs inventoried: 8',
      '  Content checks: 5 completed, 1 partial, 1 failed',
      '  Axe: 6 completed, 1 failed',
      '  Lighthouse: 2 measured, 1 failed, 4 not planned',
      '  Pages without content analysis: 1 (skipped robots: 1)',
      '  Template families represented: 3',
      '  Continuation URLs omitted: 4',
    ]);
  });

  it('labels historical pass coverage as unknown', () => {
    expect(
      formatAuditCoverageSummary({
        kind: 'legacy-unknown',
        inventoriedUrlCount: 5,
        continuationOmittedUrlCount: 0,
      }),
    ).toEqual([
      '  URLs inventoried: 5',
      '  Pass-specific coverage: unknown (legacy manifest)',
      '  Continuation URLs omitted: 0',
    ]);
  });
});
