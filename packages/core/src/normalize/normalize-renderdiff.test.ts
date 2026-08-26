import { describe, expect, it } from 'vitest';
import { extractRenderDiffCandidates, RENDERDIFF_RULE_ID } from './normalize-renderdiff.js';
import { buildRenderDiffResult } from './fixtures.js';

describe('extractRenderDiffCandidates', () => {
  it('emits nothing below the emission threshold (19%)', () => {
    const result = buildRenderDiffResult({ missingPercent: 19 });
    expect(extractRenderDiffCandidates(result, result.pageUrl)).toEqual([]);
  });

  it('emits exactly one page-scoped candidate at the threshold (20%)', () => {
    const result = buildRenderDiffResult({ missingPercent: 20 });
    const candidates = extractRenderDiffCandidates(result, result.pageUrl);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element).toBeNull();
    expect(candidates[0]?.source).toBe('renderdiff');
    expect(candidates[0]?.ruleId).toBe(RENDERDIFF_RULE_ID);
    expect(candidates[0]?.category).toBe('rendering');
  });

  it('maps severity via severityFromRenderDiff', () => {
    expect(
      extractRenderDiffCandidates(buildRenderDiffResult({ missingPercent: 99 }), 'u')[0]?.severity,
    ).toBe('critical');
    expect(
      extractRenderDiffCandidates(buildRenderDiffResult({ missingPercent: 60 }), 'u')[0]?.severity,
    ).toBe('serious');
    expect(
      extractRenderDiffCandidates(buildRenderDiffResult({ missingPercent: 25 }), 'u')[0]?.severity,
    ).toBe('moderate');
  });

  it('stores the full RenderDiffResult in rawEvidenceForPage, not just the percentage', () => {
    const result = buildRenderDiffResult({ missingPercent: 50, httpStatus: 200 });
    const candidates = extractRenderDiffCandidates(result, result.pageUrl);
    expect(candidates[0]?.rawEvidenceForPage).toEqual(result);
  });

  it('does not embed the percentage in the static title/description', () => {
    const result = buildRenderDiffResult({ missingPercent: 50 });
    const candidates = extractRenderDiffCandidates(result, result.pageUrl);
    expect(candidates[0]?.title).not.toMatch(/\d/);
    expect(candidates[0]?.description).not.toMatch(/50/);
  });
});
