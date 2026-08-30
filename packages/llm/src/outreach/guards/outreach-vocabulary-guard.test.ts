import { describe, expect, it } from 'vitest';
import type { ProseField } from '../../prose-fields.js';
import {
  OUTREACH_PROHIBITED_EXAMPLES,
  findOutreachVocabularyViolations,
} from './outreach-vocabulary-guard.js';

function field(text: string, name = 'evidenceSentence'): ProseField[] {
  return [{ field: name, text }];
}

describe('findOutreachVocabularyViolations', () => {
  it('finds nothing in clean prose', () => {
    const fields = field("Une partie du contenu ne s'affiche pas sans JavaScript.");
    expect(findOutreachVocabularyViolations(fields, 'fr')).toEqual([]);
  });

  it('flags a statistics claim', () => {
    const violations = findOutreachVocabularyViolations(
      field('Un pourcentage important de vos visiteurs est concerné.'),
      'fr',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'statistics' }));
  });

  it('flags a conformity claim', () => {
    const violations = findOutreachVocabularyViolations(
      field('Nous proposons un audit RGAA de votre site.'),
      'fr',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'conformity-claim' }));
  });

  it('flags a competitor mention', () => {
    const violations = findOutreachVocabularyViolations(
      field('Vos concurrents ont déjà corrigé ce point.'),
      'fr',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'competitor' }));
  });

  it('flags a meeting or phone ask', () => {
    const violations = findOutreachVocabularyViolations(
      field('Un rapide appel téléphonique pour en discuter ?'),
      'fr',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'meeting-or-phone-ask' }));
  });

  it('flags a free-mail domain mention', () => {
    const violations = findOutreachVocabularyViolations(field('Écrivez-nous sur gmail.'), 'fr');
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'free-mail' }));
  });

  it('flags a price or offer mention', () => {
    const violations = findOutreachVocabularyViolations(
      field('Notre tarif est raisonnable.'),
      'fr',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'price-or-offer' }));
  });

  it('flags a curiosity-gap subject, but only in the subject field', () => {
    const subjectViolations = findOutreachVocabularyViolations(
      field('Question rapide', 'subject'),
      'fr',
    );
    expect(subjectViolations).toContainEqual(
      expect.objectContaining({ rule: 'curiosity-gap-subject' }),
    );

    const bodyViolations = findOutreachVocabularyViolations(
      field('Question rapide', 'evidenceSentence'),
      'fr',
    );
    expect(bodyViolations.some((v) => v.rule === 'curiosity-gap-subject')).toBe(false);
  });

  it('flags a "predates 2025" answer', () => {
    const violations = findOutreachVocabularyViolations(
      field("Comme votre site date d'avant juin 2025, cela ne change rien."),
      'fr',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'predates-2025-answer' }));
  });

  it('flags a named salutation, and only that rule, for an invented proper name', () => {
    const named = findOutreachVocabularyViolations(
      field('Nous avons remarqué, cher Jean, un point sur votre site.'),
      'fr',
    );
    expect(named).toContainEqual(expect.objectContaining({ rule: 'named-salutation' }));

    const generic = findOutreachVocabularyViolations(
      field('Nous avons remarqué, cher Monsieur, un point sur votre site.'),
      'fr',
    );
    expect(generic.some((v) => v.rule === 'named-salutation')).toBe(false);
  });

  // The assembler splices its own greeting above the prose, so a field that
  // opens with one gives the reader two - the defect a real touch 1
  // read-through surfaced.
  it('flags a generic greeting at the head of a field', () => {
    for (const opening of [
      'Bonjour, nous avons regardé la version publique de votre site.',
      'Bonsoir, un point rapide sur votre site.',
      'Madame, nous avons regardé votre site.',
      'Cher Monsieur, nous avons regardé votre site.',
    ]) {
      expect(findOutreachVocabularyViolations(field(opening), 'fr')).toContainEqual(
        expect.objectContaining({ rule: 'leading-salutation' }),
      );
    }

    for (const opening of [
      'Hello, we had a look at the public version of your site.',
      'Hi there, one quick point about your site.',
      'Good morning, we had a look at your site.',
    ]) {
      expect(findOutreachVocabularyViolations(field(opening), 'en')).toContainEqual(
        expect.objectContaining({ rule: 'leading-salutation' }),
      );
    }
  });

  it('leaves a greeting word alone when it is not the opening of the field', () => {
    const violations = findOutreachVocabularyViolations(
      field('Un visiteur qui arrive ne voit aucun bonjour, seulement une page vide.'),
      'fr',
    );
    expect(violations.some((v) => v.rule === 'leading-salutation')).toBe(false);
  });

  it('flags the same categories in English', () => {
    const violations = findOutreachVocabularyViolations(
      field('Your competitors have already fixed this.'),
      'en',
    );
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'competitor' }));
  });
});

describe('OUTREACH_PROHIBITED_EXAMPLES', () => {
  it('has both languages populated with at least one example each', () => {
    expect(OUTREACH_PROHIBITED_EXAMPLES.fr.length).toBeGreaterThan(0);
    expect(OUTREACH_PROHIBITED_EXAMPLES.en.length).toBeGreaterThan(0);
  });
});
