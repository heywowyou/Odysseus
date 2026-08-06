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

  // legalRelevance is no longer a writing-pass field at all as of
  // docs/report-v2-refactor.md 4.3 (built deterministically in
  // legal-relevance.ts instead), so there is nothing left for this guard
  // to exempt - the field's own type no longer permits constructing it
  // here. The exemption reasoning that used to be tested is preserved in
  // language-guard.ts's doc comment for historical context.

  describe('title and recommendedActions require franc and the regex heuristic to agree (dual-detector gate)', () => {
    it.each([
      'Missing image descriptions',
      'Unstable page layout',
      'Unexpected page layout shifts',
      'Missing page descriptions for search engines',
      'Missing meta descriptions for pages',
    ])(
      'does not flag %j as a title (regression: franc alone misread this as French on a live almamia.fr run, but it contains no accent and no French stopword)',
      (title) => {
        const output: WritingPassOutput = {
          themes: [
            {
              themeKey: 't1',
              title,
              businessImpact: 'This business impact sentence is deliberately generic filler text for the test case.',
              recommendedActions: ['Test the site to confirm the fix works as expected in this scenario.'],
            },
          ],
          executiveSummary: 'Your site has several issues that affect its commercial effectiveness.',
          notes: '',
        };

        const violations = findLanguageComplianceViolations(output, 'en');
        expect(violations.map((v) => v.field)).not.toContain('themes[0](t1).title');
      },
    );

    it.each([
      'Write unique, concise meta descriptions (150-160 characters) for each page, summarizing its content and purpose.',
      'Use tools like Google Search Console to monitor how your pages appear in search results.',
      "Avoid duplicate meta descriptions across pages.",
      "Avoid generic link text like 'click here' or 'read more.' Instead, use specific text like 'View our menu' or 'Book a table.'",
    ])(
      'does not flag %j as a recommendedAction (regression: franc alone misread this as French on a live almamia.fr run, but it contains no accent and no French stopword)',
      (action) => {
        const output: WritingPassOutput = {
          themes: [
            {
              themeKey: 't7',
              title: 'Missing page descriptions for search engines',
              businessImpact: 'This business impact sentence is deliberately generic filler text for the test case.',
              recommendedActions: [action],
            },
          ],
          executiveSummary: 'Your site has several issues that affect its commercial effectiveness.',
          notes: '',
        };

        const violations = findLanguageComplianceViolations(output, 'en');
        expect(violations.map((v) => v.field)).not.toContain('themes[0](t7).recommendedActions[0]');
      },
    );

    it('still flags a genuine recommendedActions-only leak (both franc and the regex heuristic agree)', () => {
      // Constructed, not observed in production like the other fixtures
      // in this file - deliberately proves the class title's leak
      // regression represents (a single wrong-language field in an
      // otherwise-correct theme) is still caught for recommendedActions
      // too, which wasn't exercised by any real example before the
      // anchoring approach's regression surfaced this gap.
      const output: WritingPassOutput = {
        themes: [
          {
            themeKey: 't7',
            title: 'Missing page descriptions for search engines',
            businessImpact: 'Pages without meta descriptions may not rank as well in search results.',
            recommendedActions: [
              'Optimisez la vitesse de chargement du site pour réduire le taux de rebond des visiteurs et améliorer les conversions.',
            ],
          },
        ],
        executiveSummary: 'Your site has several issues that affect its commercial effectiveness.',
        notes: '',
      };

      const violations = findLanguageComplianceViolations(output, 'en');
      expect(violations.map((v) => v.field)).toContain('themes[0](t7).recommendedActions[0]');
    });
  });
});
