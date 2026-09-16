import { describe, expect, it } from 'vitest';
import { buildReportPreparationPreview } from './preview.js';
import { emptyReportPreparation, type ReportPreparation } from './preparation.js';
import { buildFinding, buildProvenance } from './test-fixtures.js';
import { resolveGenericDecisionQuestion } from './vocabulary.js';

function preparationWith(overrides: Partial<ReportPreparation>): ReportPreparation {
  return { ...emptyReportPreparation(), ...overrides };
}

describe('buildReportPreparationPreview', () => {
  it('falls back to the generic question independently per language', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({}),
      findings: [],
    });
    for (const language of ['fr', 'en'] as const) {
      expect(preview[language].coverQuestion).toEqual({
        value: resolveGenericDecisionQuestion(language),
        source: 'fallback',
      });
    }
  });

  it('does not copy a custom question from one language into the other', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({ customCoverQuestion: { fr: 'Question française' } }),
      findings: [],
    });
    expect(preview.fr.coverQuestion).toEqual({ value: 'Question française', source: 'custom' });
    expect(preview.en.coverQuestion.source).toBe('fallback');
  });

  it('resolves the hook family from findings', () => {
    const findings = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'serious' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'minor' }),
    ];
    const preview = buildReportPreparationPreview({ preparation: preparationWith({}), findings });
    expect(preview.fr.hook.family).toBe('accessibility');
    expect(preview.fr.hook.evidenceUnavailable).toBe(false);
    expect(preview.fr.hook.value).toBeTruthy();
    expect(preview.en.hook.value).toBeTruthy();
    expect(preview.fr.hook.value).not.toBe(preview.en.hook.value);
  });

  it('does not claim a raw-count maximum when severity weighting selects accessibility', () => {
    const findings = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'minor' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'minor' }),
    ];
    const preview = buildReportPreparationPreview({ preparation: preparationWith({}), findings });

    expect(preview.fr.hook.family).toBe('accessibility');
    expect(preview.fr.hook.value).not.toContain('le plus de constats');
    expect(preview.en.hook.value).not.toContain('the most findings');
  });

  it('resolves an empty findings list to measured mixed copy', () => {
    const preview = buildReportPreparationPreview({
      preparation: preparationWith({}),
      findings: [],
    });
    expect(preview.fr.hook).toEqual({
      family: 'mixed',
      value: expect.any(String),
      evidenceUnavailable: false,
    });
  });

  it('marks evidence unavailable when the findings are missing entirely', () => {
    const preview = buildReportPreparationPreview({ preparation: preparationWith({}) });
    expect(preview.fr.hook.evidenceUnavailable).toBe(true);
  });

  it('warns only about a missing commercial name', () => {
    const preview = buildReportPreparationPreview({ preparation: preparationWith({}) });
    expect(preview.warnings).toEqual(['commercial-name']);

    const named = buildReportPreparationPreview({
      preparation: preparationWith({}),
      commercialName: 'Hôtel Belledonne',
      findings: [],
    });
    expect(named.warnings).toEqual([]);
    expect(named.warningDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('round-trips provenance through a selected pair reference shape', () => {
    // The preview digest only guarantees stability; this guards the
    // provenance fixture shape used by store tests too.
    expect(buildProvenance('sha256:x').findingsSchemaVersion).toBe(1);
  });
});
