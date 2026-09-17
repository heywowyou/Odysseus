import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  parseReportPreparationPatch,
  type AnalysisPairRef,
  type AuditManifest,
  type FindingsProvenance,
} from '@odysseus/core';
import { persistAnalysis } from './persist-analysis.js';
import { persistAudit } from './persist-audit.js';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import {
  approveWritingCandidate,
  getAnalysisById,
  getReportPreparation,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  WritingSelectionConflictError,
} from './report-preparations.js';
import type { AnalysisDocumentFields } from './schemas/analysis.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function buildManifest(auditId: string): AuditManifest {
  return {
    auditId,
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
  };
}

function provenance(digest: string): FindingsProvenance {
  return {
    findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
    normalizationFingerprint: 'fp-test',
    findingsDigest: digest,
  };
}

let nextAnalysisId = 0;

async function insertAnalysis(
  auditId: string,
  language: 'fr' | 'en',
  generatedAt: string,
  digest = 'sha256:run-a',
): Promise<AnalysisDocumentFields> {
  nextAnalysisId += 1;
  const fields: AnalysisDocumentFields = {
    analysisId: `prep-an-${nextAnalysisId}`,
    auditId,
    findingsProvenance: provenance(digest),
    language,
    model: 'mistral-medium-latest',
    temperature: 0.2,
    generatedAt: new Date(generatedAt),
    executiveSummary: 'Summary.',
    overallRisk: 'medium',
    themes: [],
    quickWins: [],
    notes: 'Notes.',
  };
  await persistAnalysis(connection!, fields);
  return fields;
}

async function insertAudit(auditId: string): Promise<void> {
  await persistAudit(connection!, buildManifest(auditId), []);
}

describe.skipIf(!mongoAvailable)('report preparation persistence', () => {
  const OWN_IDS = /^prep-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAuditModel(connection).deleteMany({ auditId: OWN_IDS });
    await createAnalysisModel(connection).deleteMany({ auditId: OWN_IDS });
  });

  it('returns an empty preparation for an audit that never saved one', async () => {
    await insertAudit('prep-empty');
    const preparation = await getReportPreparation(connection!, 'prep-empty');
    expect(preparation).toEqual({ updatedAt: expect.any(String) });
  });

  it('round-trips the custom cover question per language', async () => {
    await insertAudit('prep-roundtrip');
    await patchReportPreparationInputs(
      connection!,
      'prep-roundtrip',
      parseReportPreparationPatch({ customCoverQuestion: { fr: 'Question ?', en: null } }),
    );
    const round = await getReportPreparation(connection!, 'prep-roundtrip');
    expect(round.customCoverQuestion).toEqual({ fr: 'Question ?' });
  });

  it('hides retired inputs on read and drops them from storage on the next write', async () => {
    await insertAudit('prep-legacy');
    await createAuditModel(connection!).collection.updateOne(
      { auditId: 'prep-legacy' },
      {
        $set: {
          reportPreparation: {
            context: { situation: 'periodic-review' },
            stakeholders: { management: 'Jeanne Dupont' },
            journeyDecisions: [{ journeyId: 'discovery-navigation', decision: 'confirmed' }],
            turnover: { useReplacement: false },
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        },
      },
    );
    expect(await getReportPreparation(connection!, 'prep-legacy')).toEqual({
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    await patchReportPreparationInputs(
      connection!,
      'prep-legacy',
      parseReportPreparationPatch({ customCoverQuestion: { fr: 'Question ?' } }),
    );
    const raw = await createAuditModel(connection!).collection.findOne(
      { auditId: 'prep-legacy' },
      { projection: { reportPreparation: 1 } },
    );
    expect(Object.keys(raw?.['reportPreparation'] ?? {}).sort()).toEqual([
      'customCoverQuestion',
      'updatedAt',
    ]);
  });

  it('clears a null value', async () => {
    await insertAudit('prep-clear');
    await patchReportPreparationInputs(
      connection!,
      'prep-clear',
      parseReportPreparationPatch({ customCoverQuestion: { fr: 'Tmp' } }),
    );
    await patchReportPreparationInputs(
      connection!,
      'prep-clear',
      parseReportPreparationPatch({ customCoverQuestion: null }),
    );
    const round = await getReportPreparation(connection!, 'prep-clear');
    expect(round.customCoverQuestion).toBeUndefined();
  });
});

describe.skipIf(!mongoAvailable)('exact analysis reads', () => {
  const OWN_IDS = /^prep-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAnalysisModel(connection).deleteMany({ auditId: OWN_IDS });
  });

  it('scopes exact-ID reads to the audit that owns the analysis', async () => {
    const analysis = await insertAnalysis('prep-scope-a', 'fr', '2026-09-01T00:00:00Z');
    expect(
      (await getAnalysisById(connection!, 'prep-scope-a', analysis.analysisId))?.analysisId,
    ).toBe(analysis.analysisId);
    expect(await getAnalysisById(connection!, 'prep-scope-b', analysis.analysisId)).toBeNull();
  });
});

describe.skipIf(!mongoAvailable)('writing selection', () => {
  const OWN_IDS = /^prep-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAuditModel(connection).deleteMany({ auditId: OWN_IDS });
    await createAnalysisModel(connection).deleteMany({ auditId: OWN_IDS });
  });

  async function seedSelectedPair(auditId: string, digest: string): Promise<AnalysisPairRef> {
    await insertAudit(auditId);
    const fr = await insertAnalysis(auditId, 'fr', '2026-09-01T00:00:00Z', digest);
    const en = await insertAnalysis(auditId, 'en', '2026-09-01T06:00:00Z', digest);
    await recordReadyWritingCandidate(connection!, auditId, {
      frAnalysisId: fr.analysisId,
      enAnalysisId: en.analysisId,
      findingsProvenance: provenance(digest),
    });
    return approveWritingCandidate(connection!, auditId).then((preparation) => {
      const selected = preparation.writingSelection?.selected;
      if (!selected) throw new Error('odysseus: selection missing after approval');
      return selected;
    });
  }

  it('records a ready candidate without changing selection or legacy resolution', async () => {
    await insertAudit('prep-candidate');
    const fr = await insertAnalysis('prep-candidate', 'fr', '2026-09-01T00:00:00Z');
    const en = await insertAnalysis('prep-candidate', 'en', '2026-09-01T06:00:00Z');
    await recordReadyWritingCandidate(connection!, 'prep-candidate', {
      frAnalysisId: fr.analysisId,
      enAnalysisId: en.analysisId,
      findingsProvenance: provenance('sha256:run-a'),
    });

    const preparation = await getReportPreparation(connection!, 'prep-candidate');
    expect(preparation.writingSelection?.candidate?.status).toBe('ready');
    expect(preparation.writingSelection?.selected).toBeUndefined();

    // The candidate's analyses are the only ones on record, and the
    // fallback must never adopt them: without approval there is no
    // current pair at all (plan 019's candidate-before-selection rule).
    const resolution = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-candidate');
    expect(resolution).toEqual({ kind: 'none', reason: 'no-complete-pair' });
  });

  it('approves a ready candidate exactly once, atomically', async () => {
    const selected = await seedSelectedPair('prep-approve', 'sha256:old-run');
    const newer = 'sha256:new-run';
    const fr = await insertAnalysis('prep-approve', 'fr', '2026-09-02T00:00:00Z', newer);
    const en = await insertAnalysis('prep-approve', 'en', '2026-09-02T06:00:00Z', newer);
    await recordReadyWritingCandidate(connection!, 'prep-approve', {
      frAnalysisId: fr.analysisId,
      enAnalysisId: en.analysisId,
      findingsProvenance: provenance(newer),
    });

    const preparation = await approveWritingCandidate(connection!, 'prep-approve');
    expect(preparation.writingSelection?.candidate?.status).toBe('selected');
    expect(preparation.writingSelection?.selected?.frAnalysisId).toBe(fr.analysisId);
    expect(preparation.writingSelection?.selected?.enAnalysisId).toBe(en.analysisId);
    expect(selected.frAnalysisId).not.toBe(fr.analysisId);

    const resolution = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-approve');
    expect(resolution.kind).toBe('selected');
    if (resolution.kind === 'selected') {
      expect(resolution.fr.analysisId).toBe(fr.analysisId);
    }

    // A second approval attempt finds no ready candidate and conflicts.
    await expect(approveWritingCandidate(connection!, 'prep-approve')).rejects.toBeInstanceOf(
      WritingSelectionConflictError,
    );
  });

  it('refuses to select an incomplete or incompatible pair', async () => {
    await insertAudit('prep-incompatible');
    const fr = await insertAnalysis(
      'prep-incompatible',
      'fr',
      '2026-09-01T00:00:00Z',
      'sha256:run-x',
    );
    const en = await insertAnalysis(
      'prep-incompatible',
      'en',
      '2026-09-01T06:00:00Z',
      'sha256:run-y',
    );
    await recordReadyWritingCandidate(connection!, 'prep-incompatible', {
      frAnalysisId: fr.analysisId,
      enAnalysisId: en.analysisId,
      findingsProvenance: provenance('sha256:run-x'),
    });

    await expect(approveWritingCandidate(connection!, 'prep-incompatible')).rejects.toBeInstanceOf(
      WritingSelectionConflictError,
    );
    const preparation = await getReportPreparation(connection!, 'prep-incompatible');
    expect(preparation.writingSelection?.selected).toBeUndefined();
    expect(preparation.writingSelection?.candidate?.status).toBe('ready');
  });

  it('conflicts when the ready candidate disappeared before approval', async () => {
    await insertAudit('prep-race');
    const fr = await insertAnalysis('prep-race', 'fr', '2026-09-01T00:00:00Z');
    const en = await insertAnalysis('prep-race', 'en', '2026-09-01T06:00:00Z');
    await recordReadyWritingCandidate(connection!, 'prep-race', {
      frAnalysisId: fr.analysisId,
      enAnalysisId: en.analysisId,
      findingsProvenance: provenance('sha256:run-a'),
    });
    // A concurrent process removed the analyses after the candidate was
    // recorded; approval must fail closed instead of selecting nothing.
    await createAnalysisModel(connection!).deleteMany({ auditId: OWN_IDS });

    await expect(approveWritingCandidate(connection!, 'prep-race')).rejects.toBeInstanceOf(
      WritingSelectionConflictError,
    );
    const untouched = await getReportPreparation(connection!, 'prep-race');
    expect(untouched.writingSelection?.selected).toBeUndefined();
    expect(untouched.writingSelection?.candidate?.status).toBe('ready');
  });

  it('keeps the selected pair when a regeneration fails', async () => {
    const seeded = await seedSelectedPair('prep-failure', 'sha256:kept');
    await recordReadyWritingCandidate(connection!, 'prep-failure', {
      frAnalysisId: 'fr-new',
      enAnalysisId: 'en-new',
      findingsProvenance: provenance('sha256:kept'),
    });
    const preparation = await recordFailedWritingCandidate(
      connection!,
      'prep-failure',
      'mistral: exhausted retries',
    );
    expect(preparation.writingSelection?.candidate).toEqual({
      status: 'failed',
      reason: 'mistral: exhausted retries',
      createdAt: expect.any(String),
    });
    expect(preparation.writingSelection?.selected).toEqual(seeded);

    const resolution = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-failure');
    expect(resolution.kind).toBe('selected');
    if (resolution.kind === 'selected') {
      expect(resolution.fr.analysisId).toBe(seeded.frAnalysisId);
      expect(resolution.en.analysisId).toBe(seeded.enAnalysisId);
    }
  });

  // The candidate's partialPair used to be declared in the Mongoose schema as
  // two flat `partial*AnalysisId` keys that nothing ever wrote, so strict mode
  // dropped the nested object on every write and the selection fallback's
  // partial exclusion never fired on stored data. Issue #409 added
  // guardRejections beside it, so both are asserted through a real round trip
  // rather than against the in-memory return value.
  it('stores what a failed run knows: its partials and the guards that rejected it', async () => {
    await insertAudit('prep-failure-detail');
    await recordFailedWritingCandidate(
      connection!,
      'prep-failure-detail',
      'exhausted 3 attempts',
      { frAnalysisId: 'fr-partial' },
      [
        { attempt: 1, totalAttempts: 2, guards: ['severity-vocabulary'] },
        { attempt: 2, totalAttempts: 2, guards: ['prose-register', 'provider-placement'] },
      ],
    );

    const reread = await getReportPreparation(connection!, 'prep-failure-detail');
    const candidate = reread.writingSelection?.candidate;

    expect(candidate).toMatchObject({ status: 'failed', reason: 'exhausted 3 attempts' });
    expect(candidate?.status === 'failed' ? candidate.partialPair : undefined).toEqual({
      frAnalysisId: 'fr-partial',
    });
    expect(candidate?.status === 'failed' ? candidate.guardRejections : undefined).toEqual([
      { attempt: 1, totalAttempts: 2, guards: ['severity-vocabulary'] },
      { attempt: 2, totalAttempts: 2, guards: ['prose-register', 'provider-placement'] },
    ]);
  });

  it('resolves the legacy latest complete pair deterministically', async () => {
    await insertAudit('prep-legacy');
    // Newest overall: a run whose English half never arrived. Must be ignored.
    await insertAnalysis('prep-legacy', 'fr', '2026-09-05T00:00:00Z', 'sha256:orphan');
    // Older complete run: the expected fallback.
    await insertAnalysis('prep-legacy', 'fr', '2026-09-01T00:00:00Z', 'sha256:run-a');
    const enA1 = await insertAnalysis('prep-legacy', 'en', '2026-09-01T06:00:00Z', 'sha256:run-a');
    const frA2 = await insertAnalysis('prep-legacy', 'fr', '2026-09-02T00:00:00Z', 'sha256:run-a');
    // Even older complete run from a different structural generation. Ignored.
    await insertAnalysis('prep-legacy', 'fr', '2026-08-30T00:00:00Z', 'sha256:run-0');
    await insertAnalysis('prep-legacy', 'en', '2026-08-30T06:00:00Z', 'sha256:run-0');

    const resolution = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-legacy');
    expect(resolution.kind).toBe('legacy-latest');
    if (resolution.kind === 'legacy-latest') {
      expect(resolution.fr.analysisId).toBe(frA2.analysisId);
      expect(resolution.en.analysisId).toBe(enA1.analysisId);
    }
  });

  it('skips analyses stored before the provenance stamp instead of failing', async () => {
    await insertAudit('prep-noprovenance');
    // A pre-trade-off-40 document exactly as legacy rows sit in the real
    // database: no findingsProvenance at all. Written straight through the
    // raw collection because persistAnalysis validates the field.
    await createAnalysisModel(connection!).collection.insertOne({
      analysisId: 'prep-an-legacy-1',
      auditId: 'prep-noprovenance',
      language: 'fr',
      model: 'mistral-medium-latest',
      temperature: 0.2,
      generatedAt: new Date('2026-08-01T00:00:00Z'),
      executiveSummary: 'Summary.',
      overallRisk: 'low',
      themes: [],
      quickWins: [],
      notes: 'Notes.',
    });

    const onlyLegacy = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-noprovenance');
    expect(onlyLegacy).toEqual({ kind: 'none', reason: 'no-complete-pair' });

    // The operator's actual case: a stamped pair coexists with legacy rows.
    const fr = await insertAnalysis('prep-noprovenance', 'fr', '2026-09-01T00:00:00Z');
    const en = await insertAnalysis('prep-noprovenance', 'en', '2026-09-01T06:00:00Z');
    const mixed = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-noprovenance');
    expect(mixed.kind).toBe('legacy-latest');
    if (mixed.kind === 'legacy-latest') {
      expect(mixed.fr.analysisId).toBe(fr.analysisId);
      expect(mixed.en.analysisId).toBe(en.analysisId);
    }
  });

  it('never resolves a ready candidate as the current pair before approval', async () => {
    await insertAudit('prep-candidate-fallback');
    // The pre-existing pair the reports were rendered from.
    const oldFr = await insertAnalysis('prep-candidate-fallback', 'fr', '2026-09-01T00:00:00Z');
    const oldEn = await insertAnalysis('prep-candidate-fallback', 'en', '2026-09-01T06:00:00Z');
    // Regeneration creates the newest pair and records it as a candidate.
    const newFr = await insertAnalysis('prep-candidate-fallback', 'fr', '2026-09-02T00:00:00Z');
    const newEn = await insertAnalysis('prep-candidate-fallback', 'en', '2026-09-02T06:00:00Z');
    await recordReadyWritingCandidate(connection!, 'prep-candidate-fallback', {
      frAnalysisId: newFr.analysisId,
      enAnalysisId: newEn.analysisId,
      findingsProvenance: provenance('sha256:run-a'),
    });

    const resolution = await resolveSelectedAnalysisPairForAudit(
      connection!,
      'prep-candidate-fallback',
    );
    expect(resolution.kind).toBe('legacy-latest');
    if (resolution.kind === 'legacy-latest') {
      expect(resolution.fr.analysisId).toBe(oldFr.analysisId);
      expect(resolution.en.analysisId).toBe(oldEn.analysisId);
    }
  });

  it('reports none when an audit has no analyses at all', async () => {
    await insertAudit('prep-nothing');
    const resolution = await resolveSelectedAnalysisPairForAudit(connection!, 'prep-nothing');
    expect(resolution).toEqual({ kind: 'none', reason: 'no-analyses' });
  });
});
