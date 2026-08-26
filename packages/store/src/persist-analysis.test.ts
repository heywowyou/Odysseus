import { afterAll, describe, expect, it } from 'vitest';
import type { LlmOutput } from '@odysseus/core';
import { persistAnalysis } from './persist-analysis.js';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

function buildOutput(overrides: Partial<LlmOutput> = {}): LlmOutput {
  return {
    executiveSummary: 'Summary text.',
    overallRisk: 'medium',
    themes: [
      {
        title: 'Color contrast',
        category: 'accessibility',
        businessImpact: 'Users with low vision may not read key text.',
        effort: 'low',
        impact: 'medium',
        priorityRank: 1,
        findingIds: ['f001'],
        recommendedActions: ['Increase contrast ratio to 4.5:1.'],
      },
    ],
    quickWins: ['Increase contrast ratio.'],
    notes: 'No additional notes.',
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('persistAnalysis', () => {
  it('inserts a new document rather than upserting: two calls with the same auditId produce two distinct documents', async () => {
    const output = buildOutput();

    await persistAnalysis(
      connection!,
      'persist-analysis-test-1',
      'en',
      'mistral-large',
      0.2,
      new Date('2026-08-02T00:00:00.000Z'),
      output,
    );
    await persistAnalysis(
      connection!,
      'persist-analysis-test-1',
      'fr',
      'mistral-large',
      0.2,
      new Date('2026-08-02T00:05:00.000Z'),
      buildOutput({ executiveSummary: 'Resume texte.' }),
    );

    const AnalysisModel = createAnalysisModel(connection!);
    const stored = await AnalysisModel.find({ auditId: 'persist-analysis-test-1' });

    expect(stored).toHaveLength(2);
    expect(stored.map((doc) => doc.language).sort()).toEqual(['en', 'fr']);
  });

  it('stores obligationAssessment only when provided', async () => {
    const output = buildOutput();

    await persistAnalysis(
      connection!,
      'persist-analysis-test-2',
      'en',
      'mistral-large',
      0.2,
      new Date('2026-08-02T00:00:00.000Z'),
      output,
    );

    const AnalysisModel = createAnalysisModel(connection!);
    const stored = await AnalysisModel.findOne({ auditId: 'persist-analysis-test-2' });

    expect(stored).not.toBeNull();
    expect(stored?.obligationAssessment).toBeUndefined();
  });
});
