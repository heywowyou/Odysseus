import { describe, expect, it, vi } from 'vitest';
import { emptyWritingPerformanceEvidence } from './writing-schema.js';
import type { CorrectionReviewInput, CorrectionReviewOutput } from './correction-review-schema.js';
import {
  correctionReviewOutputSchema,
  describeCorrectionFieldMismatch,
} from './correction-review-schema.js';
import { buildCorrectionReviewOutputJsonSchema } from './correction-review-output-schema.js';
import { buildCorrectionReviewSystemPrompt } from './correction-review-prompt.js';

vi.mock('./client.js', () => ({ callOpenAiForCorrectionReview: vi.fn() }));

const { callOpenAiForCorrectionReview } = await import('./client.js');
const { analyzeCorrectionReview } = await import('./analyze-correction-review.js');

const input: CorrectionReviewInput = {
  writingInput: {
    language: 'fr',
    siteContext: {
      businessType: 'hotel',
      primaryGoal: 'bookings',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
    },
    themes: [{ themeKey: 't1', category: 'accessibility', findings: [], trustedRemediations: [] }],
    siteStats: {
      pagesScanned: 1,
      totalFindings: 1,
      critical: 0,
      serious: 1,
      moderate: 0,
      minor: 0,
    },
    performanceEvidence: emptyWritingPerformanceEvidence(),
    summaryEvidence: {
      siteStats: {
        pagesScanned: 1,
        totalFindings: 1,
        critical: 0,
        serious: 1,
        moderate: 0,
        minor: 0,
      },
      categoriesPresent: ['accessibility'],
      performance: emptyWritingPerformanceEvidence(),
      limitations: ['real-user-performance-unavailable'],
    },
  },
  written: {
    executiveSummary: 'Résumé.',
    notes: '',
    themes: [
      {
        themeKey: 't1',
        title: 'Titre',
        businessImpact: 'Impact.',
        recommendedActions: ['Action.'],
      },
    ],
  },
};

function output(overrides: Partial<CorrectionReviewOutput> = {}): CorrectionReviewOutput {
  return {
    proposals: [
      { field: 'executiveSummary', checks: [], verdict: 'keep', reason: 'No unsupported claim.' },
      { field: 'notes', checks: [], verdict: 'keep', reason: 'Empty notes remain appropriate.' },
      {
        field: 'themes(t1).businessImpact',
        checks: ['unhedged-causality'],
        verdict: 'propose-change',
        reason: 'The wording states causality without a hedge.',
        replacement: 'Impact possible.',
      },
      {
        field: 'themes(t1).recommendedActions[0]',
        checks: [],
        verdict: 'unsure',
        reason: 'No clear editorial issue observed.',
      },
    ],
    ...overrides,
  };
}

describe('correction-review schema and correlation', () => {
  it('accepts all eligible address forms and every checklist label', () => {
    const parsed = correctionReviewOutputSchema.parse(
      output({
        proposals: [
          {
            field: 'executiveSummary',
            checks: ['unsupported-specific-claim'],
            verdict: 'keep',
            reason: 'x',
          },
          { field: 'notes', checks: ['unhedged-causality'], verdict: 'keep', reason: 'x' },
          {
            field: 'themes(t1).businessImpact',
            checks: ['language-quality', 'repetition'],
            verdict: 'keep',
            reason: 'x',
          },
          {
            field: 'themes(t1).recommendedActions[0]',
            checks: ['translation-parity'],
            verdict: 'keep',
            reason: 'x',
          },
        ],
      }),
    );
    expect(describeCorrectionFieldMismatch(input, parsed)).toBeUndefined();
  });

  it('rejects extra keys and invalid replacement combinations', () => {
    expect(() =>
      correctionReviewOutputSchema.parse({
        proposals: [{ ...output().proposals[0], extra: true }],
      }),
    ).toThrow();
    expect(() =>
      correctionReviewOutputSchema.parse({
        proposals: [{ ...output().proposals[0], replacement: 'No' }],
      }),
    ).toThrow();
    expect(() =>
      correctionReviewOutputSchema.parse({
        proposals: [{ ...output().proposals[2], replacement: '' }],
      }),
    ).toThrow();
  });

  it('identifies a foreign theme key or action index after parsing', () => {
    const foreign = output({
      proposals: output().proposals.map((proposal) =>
        proposal.field === 'themes(t1).recommendedActions[0]'
          ? { ...proposal, field: 'themes(other).recommendedActions[9]' }
          : proposal,
      ) as CorrectionReviewOutput['proposals'],
    });
    expect(describeCorrectionFieldMismatch(input, foreign)).toContain(
      'extra: themes(other).recommendedActions[9]',
    );
  });

  it('builds an API schema that enumerates exactly the eligible fields', () => {
    const schema = buildCorrectionReviewOutputJsonSchema([
      'executiveSummary',
      'notes',
      'themes(t1).businessImpact',
      'themes(t1).recommendedActions[0]',
    ]);
    expect(JSON.stringify(schema)).toContain('themes(t1).recommendedActions[0]');
    expect(JSON.stringify(schema)).toContain('propose-change');
  });
});

describe('analyzeCorrectionReview', () => {
  it('skips exactly once for provider and correlation failures', async () => {
    vi.mocked(callOpenAiForCorrectionReview)
      .mockReset()
      .mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(analyzeCorrectionReview(input)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'provider unavailable',
    });

    vi.mocked(callOpenAiForCorrectionReview)
      .mockReset()
      .mockResolvedValueOnce({ output: output({ proposals: [] }) });
    await expect(analyzeCorrectionReview(input)).resolves.toMatchObject({ status: 'skipped' });
    expect(callOpenAiForCorrectionReview).toHaveBeenCalledTimes(1);
  });
});

describe('correction review prompt', () => {
  it('pins the generic-consequence carve-out and excluded judgment areas', () => {
    const prompt = buildCorrectionReviewSystemPrompt();
    expect(prompt).toContain('Generic commercial consequences are not unsupported');
    expect(prompt).toContain('deterministic legal text');
    expect(prompt).toContain('PDF layout');
  });
});
