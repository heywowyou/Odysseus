import { describe, expect, it } from 'vitest';
import {
  analysisPairRefOf,
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

  it('fails closed when the selection no longer refers to a complete pair', () => {
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
    expect(resolveSelectedAnalysisPair(undefined, [analysis('fr-1', 'fr', '2026-09-01')])).toEqual({
      kind: 'none',
      reason: 'no-complete-pair',
    });
  });
});
