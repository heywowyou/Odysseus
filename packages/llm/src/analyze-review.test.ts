import { describe, expect, it, vi } from 'vitest';
import { MISTRAL_MODEL, MISTRAL_TEMPERATURE } from './constants.js';
import type { ReviewerInput, ReviewerPassOutput } from './reviewer-schema.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

vi.mock('./client.js', () => ({
  callMistralForReview: vi.fn(),
}));

const { callMistralForReview } = await import('./client.js');
const { analyzeReview, summarizeUnsupportedReviews } = await import('./analyze-review.js');

const writingInput: WritingInput = {
  language: 'fr',
  siteContext: {
    businessType: 'hotel',
    primaryGoal: 'bookings',
    languagesServed: ['fr'],
    targetMarkets: ['fr'],
  },
  themes: [
    {
      themeKey: 't1',
      category: 'accessibility',
      findings: [
        {
          findingId: 'f1',
          source: 'axe',
          ruleId: 'color-contrast',
          category: 'accessibility',
          severity: 'serious',
          wcagCriteria: ['1.4.3'],
          title: 'Insufficient color contrast',
          description: 'Text does not meet minimum contrast ratio',
          pageUrls: ['https://example.com/'],
          occurrences: 1,
        },
      ],
    },
  ],
  siteStats: { pagesScanned: 1, totalFindings: 1, critical: 0, serious: 1, moderate: 0, minor: 0 },
  dominantPerformanceMetric: null,
};

const written: WritingPassOutput = {
  themes: [
    {
      themeKey: 't1',
      title: 'Contraste des couleurs insuffisant',
      businessImpact: 'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu.',
      recommendedActions: ['Augmenter le contraste des couleurs.'],
    },
  ],
  executiveSummary: 'Votre site présente des obstacles pour certains visiteurs.',
  notes: '',
};

const reviewerInput: ReviewerInput = { writingInput, written };

function buildReviewOutput(overrides: Partial<ReviewerPassOutput> = {}): ReviewerPassOutput {
  const field = { verdict: 'supported' as const, reason: 'matches finding f1' };
  return {
    themes: [
      {
        themeKey: 't1',
        businessImpact: field,
        recommendedActions: [field],
      },
    ],
    executiveSummary: field,
    notes: field,
    ...overrides,
  };
}

describe('analyzeReview', () => {
  it('returns ok with the verdicts and the model constants on a clean pass', async () => {
    vi.mocked(callMistralForReview).mockReset().mockResolvedValueOnce({
      output: buildReviewOutput(),
    });

    const outcome = await analyzeReview(reviewerInput);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.model).toBe(MISTRAL_MODEL);
    expect(outcome.temperature).toBe(MISTRAL_TEMPERATURE);
    expect(outcome.output.themes[0]!.themeKey).toBe('t1');
    expect(callMistralForReview).toHaveBeenCalledTimes(1);
  });

  it('is called with exactly the writer input and written prose', async () => {
    vi.mocked(callMistralForReview).mockReset().mockResolvedValueOnce({
      output: buildReviewOutput(),
    });

    await analyzeReview(reviewerInput);

    expect(callMistralForReview).toHaveBeenCalledWith(reviewerInput);
  });

  it('returns skipped when the API call fails, without throwing', async () => {
    vi.mocked(callMistralForReview).mockReset().mockRejectedValueOnce(new Error('HTTP 429'));

    const outcome = await analyzeReview(reviewerInput);

    expect(outcome).toEqual({ status: 'skipped', reason: 'HTTP 429' });
  });

  it('returns skipped when the review echoes the wrong themeKey set', async () => {
    vi.mocked(callMistralForReview)
      .mockReset()
      .mockResolvedValueOnce({
        output: buildReviewOutput({
          themes: [
            {
              themeKey: 'wrong-key',
              businessImpact: { verdict: 'supported', reason: 'matches finding f1' },
              recommendedActions: [{ verdict: 'supported', reason: 'matches finding f1' }],
            },
          ],
        }),
      });

    const outcome = await analyzeReview(reviewerInput);

    expect(outcome.status).toBe('skipped');
    if (outcome.status !== 'skipped') return;
    expect(outcome.reason).toContain('missing: [t1]');
    expect(outcome.reason).toContain('extra: [wrong-key]');
  });
});

describe('summarizeUnsupportedReviews', () => {
  it('lists only unsupported fields, using the guards field naming convention', () => {
    const output = buildReviewOutput({
      executiveSummary: {
        verdict: 'unsupported',
        reason: 'asserts the quote page is the most booked; no input contains booking data',
      },
      themes: [
        {
          themeKey: 't1',
          businessImpact: { verdict: 'supported', reason: 'matches finding f1' },
          recommendedActions: [
            { verdict: 'supported', reason: 'generic advice' },
            {
              verdict: 'unsupported',
              reason: 'claims users abandon on mobile; abandonment was not measured',
            },
          ],
        },
      ],
    });

    const lines = summarizeUnsupportedReviews(output);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('executiveSummary: ');
    expect(lines[1]).toContain('themes(t1).recommendedActions[1]: ');
    expect(lines[1]).toContain('abandonment was not measured');
  });

  it('returns nothing when every field is supported or unsure', () => {
    const output = buildReviewOutput({
      notes: { verdict: 'unsure', reason: 'would need traffic data' },
    });

    expect(summarizeUnsupportedReviews(output)).toHaveLength(0);
  });
});
