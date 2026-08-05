import { describe, expect, it } from 'vitest';
import { findLanguageComplianceViolations } from './language-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

describe('findLanguageComplianceViolations', () => {
  it('flags the real observed failure: an English theme title in a French analysis', () => {
    // Verbatim from
    // artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/analyses/2026-08-02T18-28-34Z-fr.json,
    // the fr analysis whose theme.title values were all in English despite
    // the prompt-instruction-only fix being present at the time.
    const output: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'Slow page loading across the whole site',
          businessImpact: 'Ceci est une phrase suffisamment longue en français pour le test.',
          recommendedActions: ['Optimiser les images et le JavaScript.'],
        },
      ],
      executiveSummary: 'Résumé exécutif en français, assez long pour être testé correctement.',
      notes: '',
    };

    const violations = findLanguageComplianceViolations(output, 'fr');

    expect(violations.map((v) => v.field)).toContain('themes[0](t1).title');
  });

  it('finds no violations in a clean French analysis checked against fr', () => {
    const output: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'Contraste des couleurs insuffisant sur le site',
          businessImpact: 'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
          legalRelevance: 'Concerne le critère WCAG 2.2 1.4.3 relatif au contraste des couleurs.',
          recommendedActions: ['Augmenter le contraste des couleurs sur les boutons et le texte.'],
        },
      ],
      executiveSummary: 'Votre site présente plusieurs problèmes qui affectent son efficacité commerciale.',
      notes: 'Aucune information de contexte client fournie pour cet audit particulier.',
    };

    expect(findLanguageComplianceViolations(output, 'fr')).toEqual([]);
  });

  it('finds no violations in a clean English analysis checked against en', () => {
    const output: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'Insufficient color contrast across the site',
          businessImpact: 'Older visitors may find it difficult to browse your website easily.',
          recommendedActions: ['Increase the contrast ratio on buttons and body text.'],
        },
      ],
      executiveSummary: 'Your site has several issues that affect its commercial effectiveness.',
      notes: 'No client context was supplied for this particular audit run.',
    };

    expect(findLanguageComplianceViolations(output, 'en')).toEqual([]);
  });

  it('flags clean English prose when checked against fr (positive control, symmetric case)', () => {
    const output: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'Insufficient color contrast across the site',
          businessImpact: 'Older visitors may struggle to read your content correctly.',
          recommendedActions: ['Increase the contrast ratio on buttons and body text.'],
        },
      ],
      executiveSummary: 'Your site has several issues that affect its commercial effectiveness.',
      notes: '',
    };

    const violations = findLanguageComplianceViolations(output, 'fr');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('flags French prose leaking into an English analysis (lower-confidence reverse direction)', () => {
    const output: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'Contraste des couleurs insuffisant sur le site entier',
          businessImpact: 'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
          recommendedActions: ['Augmenter le contraste des couleurs sur les boutons et le texte.'],
        },
      ],
      executiveSummary: 'Summary.',
      notes: '',
    };

    const violations = findLanguageComplianceViolations(output, 'en');
    expect(violations.map((v) => v.field)).toContain('themes[0](t1).title');
  });

  it.each([
    'Images sans texte alternatif',
    'Affichage lent du contenu principal',
    'Liens sans texte descriptif',
    'Affichage lent du premier contenu',
    'Affichage tardif du premier contenu',
  ])(
    'recognizes %j as French (regression: flagged by the old regex heuristic on a live almamia.fr run)',
    (title) => {
      const output: WritingPassOutput = {
        themes: [
          {
            themeKey: 't1',
            title,
            businessImpact: 'Ceci est une phrase suffisamment longue en français pour le test.',
            recommendedActions: ['Ceci est une action recommandée assez longue.'],
          },
        ],
        executiveSummary: 'Résumé exécutif en français, assez long pour être testé correctement.',
        notes: '',
      };

      const violations = findLanguageComplianceViolations(output, 'fr');
      expect(violations.map((v) => v.field)).not.toContain('themes[0](t1).title');
    },
  );

  it('does not check fields shorter than the length floor, regardless of language', () => {
    const output: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'OK',
          businessImpact: 'Ceci est une phrase suffisamment longue en français pour le test.',
          recommendedActions: ['Ceci est une action recommandée assez longue.'],
        },
      ],
      executiveSummary: 'Résumé exécutif en français, assez long pour être testé correctement.',
      notes: '',
    };

    const violations = findLanguageComplianceViolations(output, 'fr');
    expect(violations.map((v) => v.field)).not.toContain('themes[0](t1).title');
  });
});
