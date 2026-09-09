import { afterAll, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT, type LlmOutput } from '@odysseus/core';
import type { AnalysisDocumentFields } from './schemas/analysis.schema.js';
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

function buildFields(
  analysisId: string,
  auditId: string,
  language: 'fr' | 'en',
  generatedAt: Date,
  overrides: Partial<LlmOutput> = {},
): AnalysisDocumentFields {
  return {
    analysisId,
    auditId,
    findingsProvenance: {
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      normalizationFingerprint: NORMALIZATION_FINGERPRINT,
      findingsDigest: `sha256:${'0'.repeat(64)}`,
    },
    language,
    model: 'mistral-large',
    temperature: 0.2,
    generatedAt,
    ...buildOutput(overrides),
  };
}

describe.skipIf(!mongoAvailable)('persistAnalysis', () => {
  it('inserts a new document rather than upserting: two calls with the same auditId produce two distinct documents', async () => {
    await persistAnalysis(
      connection!,
      buildFields(
        '00000000-0000-4000-8000-000000000001',
        'persist-analysis-test-1',
        'en',
        new Date('2026-08-02T00:00:00.000Z'),
      ),
    );
    await persistAnalysis(
      connection!,
      buildFields(
        '00000000-0000-4000-8000-000000000002',
        'persist-analysis-test-1',
        'fr',
        new Date('2026-08-02T00:05:00.000Z'),
        { executiveSummary: 'Resume texte.' },
      ),
    );

    const AnalysisModel = createAnalysisModel(connection!);
    const stored = await AnalysisModel.find({ auditId: 'persist-analysis-test-1' });

    expect(stored).toHaveLength(2);
    expect(stored.map((doc) => doc.language).sort()).toEqual(['en', 'fr']);
  });

  it('stores obligationAssessment only when provided', async () => {
    await persistAnalysis(
      connection!,
      buildFields(
        '00000000-0000-4000-8000-000000000003',
        'persist-analysis-test-2',
        'en',
        new Date('2026-08-02T00:00:00.000Z'),
      ),
    );

    const AnalysisModel = createAnalysisModel(connection!);
    const stored = await AnalysisModel.findOne({ auditId: 'persist-analysis-test-2' });

    expect(stored).not.toBeNull();
    expect(stored?.obligationAssessment).toBeUndefined();
  });

  it('round-trips the exact writing site context when one was supplied', async () => {
    await persistAnalysis(connection!, {
      ...buildFields(
        '00000000-0000-4000-8000-000000000005',
        'persist-analysis-test-4',
        'fr',
        new Date('2026-08-02T00:00:00.000Z'),
      ),
      siteContext: {
        businessType: 'unknown (no intake context provided)',
        primaryGoal: 'unknown (no intake context provided)',
        languagesServed: [],
        targetMarkets: [],
        propertyType: 'HÔTEL DE TOURISME (3 étoiles)',
        roomCount: 25,
        city: 'LA TREMBLADE',
        sector: 'hospitality',
      },
    });

    const AnalysisModel = createAnalysisModel(connection!);
    // Read through the plain-object boundary: comparing the hydrated
    // Mongoose subdocument directly asserts ODM wrapper internals, not the
    // persisted shape this test exists to pin.
    const stored = await AnalysisModel.findOne({ auditId: 'persist-analysis-test-4' }).lean();

    expect(stored?.siteContext).toEqual({
      businessType: 'unknown (no intake context provided)',
      primaryGoal: 'unknown (no intake context provided)',
      languagesServed: [],
      targetMarkets: [],
      propertyType: 'HÔTEL DE TOURISME (3 étoiles)',
      roomCount: 25,
      city: 'LA TREMBLADE',
      sector: 'hospitality',
    });
  });

  it('round-trips findingsSchemaVersion as a number, never a string (live-found defect)', async () => {
    // The Mongo mirror typed this field String, so Mongoose cast the
    // numeric stamp to "1" on write and every strict comparison against
    // the audit row's numeric 1 failed, keeping audits from ever reaching
    // a fresh verified pair. Found live on the La Coorniche audit during
    // the plan 019 operator review (2026-09-01).
    await persistAnalysis(
      connection!,
      buildFields(
        '00000000-0000-4000-8000-000000000004',
        'persist-analysis-test-3',
        'fr',
        new Date('2026-08-02T00:00:00.000Z'),
      ),
    );

    const AnalysisModel = createAnalysisModel(connection!);
    const stored = await AnalysisModel.findOne({ auditId: 'persist-analysis-test-3' });
    expect(stored?.findingsProvenance.findingsSchemaVersion).toBe(FINDINGS_SCHEMA_VERSION);
    expect(typeof stored?.findingsProvenance.findingsSchemaVersion).toBe('number');
  });
});
