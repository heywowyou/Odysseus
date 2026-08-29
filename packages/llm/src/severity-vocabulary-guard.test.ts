import { describe, expect, it } from 'vitest';
import { findSeverityVocabularyViolations } from './severity-vocabulary-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function buildOutput(overrides: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contraste des couleurs insuffisant',
        businessImpact:
          'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
        recommendedActions: ['Augmenter le contraste des couleurs sur les boutons et le texte.'],
      },
    ],
    executiveSummary:
      'Votre site présente plusieurs problèmes qui affectent son efficacité commerciale.',
    notes: '',
    ...overrides,
  };
}

describe('findSeverityVocabularyViolations', () => {
  it('flags a banned synonym in a theme title', () => {
    // The title renders as a heading beside the stats box and the annex,
    // which both use the canonical word, so a synonym in a label reads as
    // a second classification system just as a synonym in prose does.
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Erreurs majeures de contraste',
          businessImpact:
            'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
          recommendedActions: ['Augmenter le contraste des couleurs sur les boutons et le texte.'],
        },
      ],
    });

    const violations = findSeverityVocabularyViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'themes[0](t1).title', matched: 'majeures' });
  });
  it('flags "majeur" used instead of the canonical "sérieux" (report-feedback-haaitza.md B3)', () => {
    // Verbatim from artifacts/haaitza.com/2026-08-08T11-07-43Z/analyses/
    // 2026-08-08T11-23-48Z-fr.json, where the stats box and annex both
    // said "majeurs" while docs/report-design-system.md's canonical label
    // is "Sérieux" - the guard used to ban the correct word instead.
    const output = buildOutput({
      executiveSummary:
        'Nous avons identifié 130 problèmes, dont 8 critiques, 26 majeurs et 24 modérés.',
    });

    const violations = findSeverityVocabularyViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'executiveSummary', matched: 'majeurs' });
  });

  it('finds no violations when the executive summary uses the canonical French words', () => {
    const output = buildOutput({
      executiveSummary:
        'Nous avons identifié 130 problèmes, dont 8 critiques, 26 sérieux et 24 modérés.',
    });

    expect(findSeverityVocabularyViolations(output, 'fr')).toEqual([]);
  });

  it('flags a synonym in businessImpact or a recommendedActions entry, not only executiveSummary', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Ce problème grave affecte vos visiteurs sur mobile en particulier.',
          recommendedActions: ['Corriger ce défaut avant tout autre point, car il est sévère.'],
        },
      ],
    });

    const violations = findSeverityVocabularyViolations(output, 'fr');

    expect(violations.map((v) => v.field)).toEqual(
      expect.arrayContaining([
        'themes[0](t1).businessImpact',
        'themes[0](t1).recommendedActions[0]',
      ]),
    );
  });

  it('flags an English synonym ("major") against the canonical "serious" in an English report', () => {
    const output = buildOutput({
      executiveSummary:
        'We identified 130 issues, including 8 critical, 26 major and 24 moderate ones.',
    });

    const violations = findSeverityVocabularyViolations(output, 'en');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'executiveSummary', matched: 'major' });
  });

  it('finds no violations in a clean English analysis using the canonical words', () => {
    const output = buildOutput({
      executiveSummary:
        'We identified 130 issues, including 8 critical, 26 serious and 24 moderate ones.',
    });

    expect(findSeverityVocabularyViolations(output, 'en')).toEqual([]);
  });
});
