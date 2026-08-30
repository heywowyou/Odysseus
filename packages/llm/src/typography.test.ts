import { describe, expect, it } from 'vitest';
import type { OutreachProseOutput } from './outreach/outreach-schema.js';
import { normalizeOutreachOutputTypography, normalizeReportTypography } from './typography.js';

const NBSP = ' ';

describe('normalizeReportTypography', () => {
  // Verbatim from the real Domaine Lagnonu analysis (2026-08-24), where 6
  // model strings used ordinary spaces inside guillemets and 0 used NBSP.
  it('puts a non-breaking space inside French guillemets', () => {
    const out = normalizeReportTypography(
      'Des liens vides ou génériques (« cliquez ici ») désorientent les visiteurs.',
      'fr',
    );

    expect(out).toContain(`«${NBSP}cliquez ici${NBSP}»`);
    expect(out).not.toContain('« cliquez');
    expect(out).not.toContain('ici »');
  });

  it('leaves an already-correct non-breaking space alone', () => {
    const input = `Créer une page «${NBSP}Mentions légales${NBSP}» accessible depuis le pied de page.`;
    expect(normalizeReportTypography(input, 'fr')).toBe(input);
  });

  it('does not double a non-breaking space when the model mixed both', () => {
    const out = normalizeReportTypography(`Un exemple «${NBSP} test » ici.`, 'fr');
    expect(out).toContain(`«${NBSP}test${NBSP}»`);
    expect(out).not.toContain(`${NBSP}${NBSP}`);
  });

  // Also verbatim: themes[3] contained "Carte Google Maps – Accès ...".
  it('replaces a spaced en dash with a hyphen', () => {
    const out = normalizeReportTypography(
      'Ajouter un attribut title (exemple : Carte Google Maps – Accès à La Lagnonu).',
      'fr',
    );

    expect(out).toContain('Carte Google Maps - Accès');
    expect(out).not.toMatch(/[—–]/u);
  });

  it('replaces an unspaced em dash without inserting spaces', () => {
    expect(normalizeReportTypography('pages 2—3', 'fr')).toBe('pages 2-3');
  });

  it('normalizes dashes in English but leaves quotes untouched', () => {
    const out = normalizeReportTypography('Buttons — unnamed — block screen readers.', 'en');
    expect(out).toBe('Buttons - unnamed - block screen readers.');
  });

  it('does not apply guillemet spacing to English text', () => {
    const input = 'Replace « this » literally.';
    expect(normalizeReportTypography(input, 'en')).toBe(input);
  });

  it('is idempotent', () => {
    const once = normalizeReportTypography('Un texte « cité » avec – un tiret.', 'fr');
    expect(normalizeReportTypography(once, 'fr')).toBe(once);
  });
});

describe('normalizeOutreachOutputTypography', () => {
  it('normalizes every touch 1 field', () => {
    const output: OutreachProseOutput = {
      touch: 1,
      evidenceRef: 'e1',
      subject: 'Un « point rapide »',
      opening: 'Un point – nous avons regardé votre site.',
      evidenceSentence: 'Une partie du contenu « ne s’affiche pas ».',
      question: 'Est-ce voulu ?',
    };
    const out = normalizeOutreachOutputTypography(output, 'fr');
    if (out.touch !== 1) throw new Error('expected touch 1');
    expect(out.subject).toBe(`Un «${NBSP}point rapide${NBSP}»`);
    expect(out.opening).toBe('Un point - nous avons regardé votre site.');
    expect(out.evidenceSentence).toContain(`«${NBSP}ne s’affiche pas${NBSP}»`);
    expect(out.question).toBe('Est-ce voulu ?');
  });

  it('normalizes every touch 2 sentence', () => {
    const output: OutreachProseOutput = {
      touch: 2,
      evidenceRef: 'e2',
      sentences: ['Un premier « exemple ».', 'Un second – exemple.'],
    };
    const out = normalizeOutreachOutputTypography(output, 'fr');
    if (out.touch !== 2) throw new Error('expected touch 2');
    expect(out.sentences[0]).toBe(`Un premier «${NBSP}exemple${NBSP}».`);
    expect(out.sentences[1]).toBe('Un second - exemple.');
  });

  it('normalizes the touch 3 closing field', () => {
    const output: OutreachProseOutput = { touch: 3, closing: 'Un dernier mot – bref.' };
    const out = normalizeOutreachOutputTypography(output, 'fr');
    if (out.touch !== 3) throw new Error('expected touch 3');
    expect(out.closing).toBe('Un dernier mot - bref.');
  });

  it('leaves an already-normalized response unchanged', () => {
    const output: OutreachProseOutput = { touch: 3, closing: 'Un dernier mot - bref.' };
    const out = normalizeOutreachOutputTypography(output, 'fr');
    expect(out).toEqual(output);
  });
});
