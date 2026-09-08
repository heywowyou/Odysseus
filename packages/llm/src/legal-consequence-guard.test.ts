import { describe, expect, it } from 'vitest';
import {
  excerptAroundMatch,
  findLegalConsequenceViolationsInFields,
  findLegalConsequenceViolations,
} from './legal-consequence-guard.js';
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
      'Votre site présente plusieurs constats qui affectent son efficacité commerciale.',
    notes: '',
    ...overrides,
  };
}

describe('findLegalConsequenceViolations', () => {
  // All four strings below are verbatim from
  // artifacts/www.lagnonu.fr/2026-08-24T16-45-59Z/analyses/
  // 2026-08-24T17-18-48Z-fr.json. Three of them rendered into the client
  // PDF (executive summary p.4, priority 1 p.7, priority 3 p.8).
  it('flags "expose à une amende", which reached page 8 of a real report', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Mentions légales incomplètes',
          businessImpact:
            'L’absence de numéro SIREN ou RCS expose à une amende et nuit à la crédibilité du site auprès des partenaires et clients professionnels.',
          recommendedActions: ['Publier le numéro SIREN sur la page mentions légales.'],
        },
      ],
    });

    const violations = findLegalConsequenceViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ matched: 'amende' });
    expect(violations[0]!.field).toContain('businessImpact');
  });

  it('flags "risques juridiques" in the executive summary', () => {
    const output = buildOutput({
      executiveSummary:
        'Des boutons et liens sans texte identifiable limitent fortement l’autonomie des utilisateurs et exposent à des risques juridiques.',
    });

    const violations = findLegalConsequenceViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      field: 'executiveSummary',
      matched: 'risques juridiques',
    });
  });

  it('flags "expose à des sanctions" in a theme business impact', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Déclaration d’accessibilité absente',
          businessImpact:
            'L’absence de déclaration officielle expose à des sanctions et envoie un signal négatif aux clients soucieux d’inclusion.',
          recommendedActions: ['Publier une déclaration d’accessibilité.'],
        },
      ],
    });

    const violations = findLegalConsequenceViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ matched: 'sanctions' });
  });

  it('flags a legal-consequence claim in a recommended action', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Mentions légales incomplètes',
          businessImpact:
            'La crédibilité du site auprès des partenaires professionnels en souffre.',
          recommendedActions: [
            'Corrigez cette page, faute de quoi vous êtes passible de poursuites.',
          ],
        },
      ],
    });

    const violations = findLegalConsequenceViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toContain('recommendedActions[0]');
  });

  it('accepts commercial framing that makes no legal claim', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Mentions légales incomplètes',
          businessImpact:
            'L’absence de numéro SIREN nuit à la crédibilité du site auprès des partenaires et clients professionnels.',
          recommendedActions: ['Publier le numéro SIREN sur la page mentions légales.'],
        },
      ],
      executiveSummary:
        'Votre site présente des obstacles pour les visiteurs en situation de handicap, qui réduisent vos conversions.',
    });

    expect(findLegalConsequenceViolations(output, 'fr')).toHaveLength(0);
  });

  it('flags the English equivalents', () => {
    const output = buildOutput({
      executiveSummary: 'Missing identification details expose the business to a fine.',
    });

    const violations = findLegalConsequenceViolations(output, 'en');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'executiveSummary', matched: 'fine' });
  });

  it('accepts an English summary that stays commercial', () => {
    const output = buildOutput({
      executiveSummary:
        'Missing identification details reduce trust with partners and professional customers.',
    });

    expect(findLegalConsequenceViolations(output, 'en')).toHaveLength(0);
  });

  it('flags a legal-consequence claim in a theme title', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Vente en ligne : les risques juridiques d’un site non conforme',
          businessImpact: 'Vos visiteurs abandonnent avant de réserver.',
          recommendedActions: ['Corriger les points relevés avec votre prestataire technique.'],
        },
      ],
    });

    const violations = findLegalConsequenceViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      field: 'themes[0](t1).title',
      matched: 'risques juridiques',
    });
  });

  it.each([
    'Votre établissement est soumis à l’obligation.',
    'Votre société est assujettie à cette obligation.',
    'Vous êtes tenu de corriger ce point.',
    'Vous devez vous conformer à cette exigence.',
    'Vous devez agir avant la fin de l’année.',
  ])('flags a French legal conclusion or worded deadline: %s', (text) => {
    expect(findLegalConsequenceViolationsInFields([{ field: 'opening', text }], 'fr')).toHaveLength(
      1,
    );
  });

  it.each([
    'Your business is subject to the obligation.',
    'You are required to comply with this requirement.',
    'You must comply by the end of the year.',
  ])('flags the English equivalent: %s', (text) => {
    expect(findLegalConsequenceViolationsInFields([{ field: 'opening', text }], 'en')).toHaveLength(
      1,
    );
  });
});

// "poursuite" is a homonym. On 2026-09-07 the bare /\bpoursuites?\b/ pattern
// rejected an entire French run three attempts running, producing no analysis
// at all, on prose that was about continuing the client's work. The legal
// sense still has to be caught; the everyday one must not be.
describe('poursuite: prosecution versus continuation', () => {
  const fires = (text: string): boolean =>
    findLegalConsequenceViolationsInFields([{ field: 'executiveSummary', text }], 'fr').length > 0;

  it('allows the everyday sense of continuing something', () => {
    expect(
      fires('La poursuite de votre développement en ligne dépend de la fiabilité du site.'),
    ).toBe(false);
    expect(fires('Ces corrections permettront la poursuite de vos objectifs commerciaux.')).toBe(
      false,
    );
    expect(fires('Nous recommandons la poursuite des efforts engagés sur le référencement.')).toBe(
      false,
    );
  });

  it('still catches the legal sense', () => {
    expect(fires('Corrigez cette page, faute de quoi vous êtes passible de poursuites.')).toBe(
      true,
    );
    expect(fires('Une poursuite judiciaire reste possible.')).toBe(true);
    expect(fires('Une poursuite pénale peut être engagée.')).toBe(true);
  });
});

// A rejection that prints one bare word is not diagnosable: it was exactly
// this that hid the poursuite homonym until a run was traced by hand.
describe('excerptAroundMatch', () => {
  it('returns the clause around the match', () => {
    const excerpt = excerptAroundMatch(
      'Votre site presente plusieurs defauts. Vous etes passible de poursuites. Corrigez-les.',
      'poursuites',
    );
    expect(excerpt).toContain('poursuites');
    expect(excerpt).toContain('passible de');
  });

  it('marks that it trimmed each side', () => {
    const long = `${'a'.repeat(200)} amende ${'b'.repeat(200)}`;
    const excerpt = excerptAroundMatch(long, 'amende');
    expect(excerpt.startsWith('...')).toBe(true);
    expect(excerpt.endsWith('...')).toBe(true);
    expect(excerpt.length).toBeLessThan(long.length);
  });

  it('falls back to the start of the text when the match is not found', () => {
    expect(excerptAroundMatch('un texte neutre', 'absent')).toBe('un texte neutre');
  });
});
