import { describe, expect, it } from 'vitest';
import {
  analysisPairRefOf,
  analysisSelectionRefOf,
  isCompleteCompatiblePair,
  pickLegacyLatestPair,
  resolveSelectedAnalysisPair,
  type AnalysisRecordLike,
} from './selection.js';
import { buildProvenance } from './test-fixtures.js';
import type { ReportLanguage } from '../types/llm-output.js';

function analysis(
  analysisId: string,
  language: ReportLanguage,
  generatedAt: string,
  digest = 'sha256:same',
  auditId = 'audit-1',
): AnalysisRecordLike {
  return {
    analysisId,
    auditId,
    language,
    findingsProvenance: buildProvenance(digest),
    generatedAt,
  };
}

describe('isCompleteCompatiblePair', () => {
  it('holds for two analyses of one audit sharing a structural run', () => {
    expect(
      isCompleteCompatiblePair(
        analysis('fr', 'fr', '2026-09-01'),
        analysis('en', 'en', '2026-09-01'),
      ),
    ).toBe(true);
  });

  it('fails across audits, languages, or provenance', () => {
    const fr = analysis('fr-1', 'fr', '2026-09-01');
    expect(isCompleteCompatiblePair(fr, undefined)).toBe(false);
    expect(
      isCompleteCompatiblePair(fr, analysis('en-1', 'en', '2026-09-01', 'sha256:same', 'audit-2')),
    ).toBe(false);
    expect(isCompleteCompatiblePair(fr, analysis('fr-2', 'fr', '2026-09-01'))).toBe(false);
    expect(isCompleteCompatiblePair(fr, analysis('en-1', 'en', '2026-09-01', 'sha256:other'))).toBe(
      false,
    );
  });
});

describe('pickLegacyLatestPair', () => {
  it('pairs the newest fr and en analyses of the newest structural run', () => {
    const fr = analysis('fr-1', 'fr', '2026-09-01T00:00:00Z');
    const frNewer = analysis('fr-2', 'fr', '2026-09-02T00:00:00Z', 'sha256:same');
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    const legacy = pickLegacyLatestPair([fr, frNewer, en]);
    expect(legacy?.fr.analysisId).toBe('fr-2');
    expect(legacy?.en.analysisId).toBe('en-1');
  });

  it('ignores a newer run whose counterpart language is missing', () => {
    const fr = analysis('fr-1', 'fr', '2026-09-01T00:00:00Z');
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    const orphan = analysis('fr-2', 'fr', '2026-09-03T00:00:00Z', 'sha256:newer-run');
    const legacy = pickLegacyLatestPair([fr, en, orphan]);
    expect(legacy?.fr.analysisId).toBe('fr-1');
    expect(legacy?.en.analysisId).toBe('en-1');
  });

  it('returns null with no complete pair', () => {
    expect(pickLegacyLatestPair([analysis('fr-1', 'fr', '2026-09-01')])).toBeNull();
    expect(pickLegacyLatestPair([])).toBeNull();
  });
});

describe('resolveSelectedAnalysisPair', () => {
  it('honours an explicit selection when the pair is still complete', () => {
    const fr = analysis('fr-1', 'fr', '2026-09-01T00:00:00Z');
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    const frNewer = analysis('fr-2', 'fr', '2026-09-02T00:00:00Z');
    const resolution = resolveSelectedAnalysisPair({ selected: analysisPairRefOf(fr, en) }, [
      fr,
      frNewer,
      en,
    ]);
    expect(resolution).toEqual({ kind: 'selected', fr, en });
  });

  it('honours an explicit French-only selection', () => {
    const fr = analysis('fr-only', 'fr', '2026-09-01T00:00:00Z');
    const resolution = resolveSelectedAnalysisPair(
      { selected: analysisSelectionRefOf(fr) },
      [fr],
    );
    expect(resolution).toEqual({ kind: 'selected', fr });
  });

  it('fails closed when the selection no longer refers to its required French analysis', () => {
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    const resolution = resolveSelectedAnalysisPair(
      {
        selected: {
          frAnalysisId: 'missing',
          enAnalysisId: 'en-1',
          findingsProvenance: buildProvenance('sha256:same'),
        },
      },
      [en],
    );
    expect(resolution).toEqual({ kind: 'none', reason: 'selection-incomplete' });
  });

  it('falls back to the legacy latest pair only without a selection', () => {
    const fr = analysis('fr-1', 'fr', '2026-09-01T00:00:00Z');
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    const resolution = resolveSelectedAnalysisPair(undefined, [fr, en]);
    expect(resolution).toEqual({ kind: 'legacy-latest', fr, en });
  });

  it('reports none when nothing usable exists', () => {
    expect(resolveSelectedAnalysisPair(undefined, [])).toEqual({
      kind: 'none',
      reason: 'no-analyses',
    });
    const frOnly = analysis('fr-1', 'fr', '2026-09-01');
    expect(resolveSelectedAnalysisPair(undefined, [frOnly])).toEqual({
      kind: 'legacy-latest',
      fr: frOnly,
    });
  });
});

describe('legacy analyses without a provenance stamp (trade-off 40)', () => {
  function legacyAnalysis(
    analysisId: string,
    language: ReportLanguage,
    generatedAt: string,
  ): AnalysisRecordLike {
    // A pre-provenance-milestone document as it really sits in the
    // database: no findingsProvenance field at all, even though the TS
    // type claims one. Found live on a real audit.
    return {
      analysisId,
      auditId: 'audit-1',
      language,
      findingsProvenance: undefined,
      generatedAt,
    } as unknown as AnalysisRecordLike;
  }

  it('is skipped by the legacy fallback instead of crashing', () => {
    const legacyFr = legacyAnalysis('legacy-fr', 'fr', '2026-08-01T00:00:00Z');
    const legacyEn = legacyAnalysis('legacy-en', 'en', '2026-08-01T06:00:00Z');
    expect(pickLegacyLatestPair([legacyFr, legacyEn])).toBeNull();
  });

  it('lets a provenance-stamped pair coexist with and beat legacy rows', () => {
    const legacyFr = legacyAnalysis('legacy-fr', 'fr', '2026-09-09T00:00:00Z');
    const fr = analysis('fr-1', 'fr', '2026-09-01T00:00:00Z');
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    const legacy = pickLegacyLatestPair([legacyFr, fr, en]);
    expect(legacy?.fr.analysisId).toBe('fr-1');
    expect(legacy?.en.analysisId).toBe('en-1');
  });

  it('fails a selection closed when either analysis lacks the stamp', () => {
    const legacyFr = legacyAnalysis('legacy-fr', 'fr', '2026-09-01T00:00:00Z');
    const en = analysis('en-1', 'en', '2026-09-01T06:00:00Z');
    expect(isCompleteCompatiblePair(legacyFr, en)).toBe(false);
    expect(
      resolveSelectedAnalysisPair(
        {
          selected: {
            frAnalysisId: 'legacy-fr',
            enAnalysisId: 'en-1',
            findingsProvenance: buildProvenance('sha256:same'),
          },
        },
        [legacyFr, en],
      ),
    ).toEqual({ kind: 'none', reason: 'selection-incomplete' });
  });
});

describe('a ready candidate never becomes current through the fallback', () => {
  it('keeps the legacy pair while the candidate is only ready', () => {
    // Found live during the operator review: regeneration creates the
    // newest analyses, and the legacy fallback adopted them as the
    // current pair before approval, making the persisted reports read
    // stale and blocking every preview.
    const oldFr = analysis('old-fr', 'fr', '2026-09-01T00:00:00Z');
    const oldEn = analysis('old-en', 'en', '2026-09-01T06:00:00Z');
    const candidateFr = analysis('cand-fr', 'fr', '2026-09-02T00:00:00Z');
    const candidateEn = analysis('cand-en', 'en', '2026-09-02T06:00:00Z');
    const resolution = resolveSelectedAnalysisPair(
      {
        candidate: {
          status: 'ready',
          pair: analysisPairRefOf(candidateFr, candidateEn),
          createdAt: '2026-09-02T12:00:00Z',
        },
      },
      [oldFr, oldEn, candidateFr, candidateEn],
    );
    expect(resolution.kind).toBe('legacy-latest');
    if (resolution.kind === 'legacy-latest') {
      expect(resolution.fr.analysisId).toBe('old-fr');
      expect(resolution.en?.analysisId).toBe('old-en');
    }
  });

  it('keeps an explicit selection ahead of both the candidate and newer analyses', () => {
    const oldFr = analysis('old-fr', 'fr', '2026-09-01T00:00:00Z');
    const oldEn = analysis('old-en', 'en', '2026-09-01T06:00:00Z');
    const candidateFr = analysis('cand-fr', 'fr', '2026-09-02T00:00:00Z');
    const candidateEn = analysis('cand-en', 'en', '2026-09-02T06:00:00Z');
    const resolution = resolveSelectedAnalysisPair(
      {
        selected: analysisPairRefOf(oldFr, oldEn),
        candidate: {
          status: 'ready',
          pair: analysisPairRefOf(candidateFr, candidateEn),
          createdAt: '2026-09-02T12:00:00Z',
        },
      },
      [oldFr, oldEn, candidateFr, candidateEn],
    );
    expect(resolution.kind).toBe('selected');
  });

  it('reports no complete pair when only the ready candidate exists', () => {
    const candidateFr = analysis('cand-fr', 'fr', '2026-09-02T00:00:00Z');
    const candidateEn = analysis('cand-en', 'en', '2026-09-02T06:00:00Z');
    const resolution = resolveSelectedAnalysisPair(
      {
        candidate: {
          status: 'ready',
          pair: analysisPairRefOf(candidateFr, candidateEn),
          createdAt: '2026-09-02T12:00:00Z',
        },
      },
      [candidateFr, candidateEn],
    );
    expect(resolution).toEqual({ kind: 'none', reason: 'no-complete-pair' });
  });

  it("excludes a failed run's partial analyses from the fallback", () => {
    const oldFr = analysis('old-fr', 'fr', '2026-09-01T00:00:00Z');
    const oldEn = analysis('old-en', 'en', '2026-09-01T06:00:00Z');
    const orphanFr = analysis('orphan-fr', 'fr', '2026-09-02T00:00:00Z');
    const resolution = resolveSelectedAnalysisPair(
      {
        candidate: {
          status: 'failed',
          reason: 'mistral: exhausted retries',
          createdAt: '2026-09-02T12:00:00Z',
          partialPair: { frAnalysisId: 'orphan-fr' },
        },
      },
      [oldFr, oldEn, orphanFr],
    );
    expect(resolution.kind).toBe('legacy-latest');
    if (resolution.kind === 'legacy-latest') {
      expect(resolution.fr.analysisId).toBe('old-fr');
      expect(resolution.en?.analysisId).toBe('old-en');
    }
  });
});
