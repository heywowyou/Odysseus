import { describe, expect, it } from 'vitest';
import {
  FRENCH_CALQUE_GLOSSARY,
  FRENCH_TERM_GLOSSARY,
  findProseRegisterViolations,
  findProseRegisterViolationsInFields,
} from './prose-register-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function fields(text: string) {
  return [{ field: 'themes[0](t1).businessImpact', text }];
}

// Issue #309: phrasings found in the production reports of 2026-09-15/16.
describe('issue #309: prose register guard', () => {
  it('rejects the untranslated jargon found in real French reports', () => {
    for (const text of [
      'Les canonicals de plusieurs pages pointent vers une autre adresse.',
      'Des erreurs de tap surviennent sur les boutons trop petits.',
    ]) {
      expect(findProseRegisterViolationsInFields(fields(text), 'fr'), text).toHaveLength(1);
    }
  });

  it('accepts the French equivalents, hreflang, and words that merely contain a glossary term', () => {
    const text =
      "Chaque page doit déclarer une adresse canonique cohérente et un attribut hreflang, et les zones d'appui doivent être agrandies sur la page de tapisserie.";
    expect(findProseRegisterViolationsInFields(fields(text), 'fr')).toEqual([]);
  });

  it('leaves English prose free to use the English terms', () => {
    const text = 'The canonical tags point elsewhere, and tap targets are too small.';
    expect(findProseRegisterViolationsInFields(fields(text), 'en')).toEqual([]);
  });

  it('rejects a subjective impression of the site in both languages', () => {
    expect(
      findProseRegisterViolationsInFields(
        fields('Le site donne une impression de contenu riche mais encore insuffisamment cadré.'),
        'fr',
      ),
    ).toHaveLength(1);
    expect(
      findProseRegisterViolationsInFields(
        fields('The site gives an impression of rich but loosely framed content.'),
        'en',
      ),
    ).toHaveLength(1);
  });

  it('keeps a measured consequence for the visitor available', () => {
    expect(
      findProseRegisterViolationsInFields(
        fields('Un visiteur peut croire que la page de réservation est vide.'),
        'fr',
      ),
    ).toEqual([]);
  });

  it('scans every prose field of a writing-pass response', () => {
    const output: WritingPassOutput = {
      executiveSummary: 'Une synthèse.',
      notes: '',
      themes: [
        {
          themeKey: 't1',
          title: 'Un thème',
          businessImpact: 'Un impact.',
          recommendedActions: ['Le lazy loading doit être activé sur les images.'],
        },
      ],
    } as WritingPassOutput;
    expect(findProseRegisterViolations(output, 'fr').map((v) => v.field)).toEqual([
      'themes[0](t1).recommendedActions[0]',
    ]);
  });

  it('gives every glossary term a pattern that matches its own anglicism', () => {
    for (const entry of FRENCH_TERM_GLOSSARY) {
      const firstForm = entry.anglicism.split(/[,(]/)[0]!.trim();
      expect(firstForm, entry.anglicism).toMatch(entry.pattern);
      expect(entry.french, entry.anglicism).not.toMatch(entry.pattern);
    }
  });
});

// Native-speaker review of the Hôtel Point France and Villas Foch reports
// (2026-09-19): French words arranged in English structure.
describe('French calque guard', () => {
  it('rejects the calques found in real executive summaries', () => {
    for (const text of [
      'Les sujets de référencement, de données structurées et de rendu complètent cette lecture.',
      'Plusieurs constats touchent la découverte des contenus par les moteurs.',
      "Les constats d'accessibilité structurent les priorités les plus élevées.",
      'Sur la performance, les pages restent lentes à afficher.',
      "L'audit relève un remplissage visuel à accélérer.",
      'Servez ces images dans un format moderne.',
      'La synthèse se limite aux familles de constats directement mesurées.',
    ]) {
      expect(findProseRegisterViolationsInFields(fields(text), 'fr'), text).toHaveLength(1);
    }
  });

  it('keeps the natural phrasings and neighbouring words available', () => {
    const text =
      "En matière de performance, les mesures montrent un affichage progressif lent. Cette correction peut servir de référence, et la découverte des pages repose sur les liens internes. Une réservation sur la performance du site n'est pas formulée.";
    expect(findProseRegisterViolationsInFields(fields(text), 'fr')).toEqual([]);
  });

  it('gives every calque a pattern that matches its own example and not its replacement', () => {
    for (const entry of FRENCH_CALQUE_GLOSSARY) {
      const example = entry.calque.replace(/, …$/u, '').replace(/, des images$/u, '');
      expect(example, entry.calque).toMatch(entry.pattern);
      expect(entry.french.replace(/, …$/u, ''), entry.calque).not.toMatch(entry.pattern);
    }
  });
});
