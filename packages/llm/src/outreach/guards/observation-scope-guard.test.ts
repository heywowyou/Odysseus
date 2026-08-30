import { HOTEL_EVIDENCE_OBSERVATIONS } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import type { OutreachProseOutput } from '../outreach-schema.js';
import {
  OBSERVATION_TRIGGER_TERMS,
  findObservationScopeViolations,
} from './observation-scope-guard.js';

function touch1Output(evidenceSentence: string): OutreachProseOutput {
  return {
    touch: 1,
    evidenceRef: 'e1',
    subject: 'Un point rapide sur votre site',
    opening: 'Nous avons regardé la version publique de votre site.',
    evidenceSentence,
    question: 'Est-ce que cela correspond à ce que vos visiteurs voient ?',
  };
}

describe('OBSERVATION_TRIGGER_TERMS key parity', () => {
  it('has exactly one entry per HOTEL_EVIDENCE_OBSERVATIONS key, no more, no fewer', () => {
    expect(Object.keys(OBSERVATION_TRIGGER_TERMS).sort()).toEqual(
      Object.keys(HOTEL_EVIDENCE_OBSERVATIONS).sort(),
    );
  });
});

describe('findObservationScopeViolations', () => {
  it('finds nothing when prose stays within the selected observation', () => {
    const output = touch1Output('Une partie du contenu dépend de JavaScript.');
    expect(findObservationScopeViolations(output, 'text-missing-from-raw-html')).toEqual([]);
  });

  it('flags prose that drifts to a different observation', () => {
    const output = touch1Output(
      'Le contraste de couleur de votre bouton principal est insuffisant.',
    );
    const violations = findObservationScopeViolations(output, 'text-missing-from-raw-html');
    expect(violations).toContainEqual(
      expect.objectContaining({ field: 'evidenceSentence', matched: 'contraste de couleur' }),
    );
  });

  it('does not flag a term shared between the selected key and its sibling', () => {
    // button-name and link-name both use "accessible name" in their fixed
    // description text, so paraphrasing it must stay allowed regardless of
    // which of the two was actually selected.
    const output = touch1Output("Un élément n'a pas de nom accessible.");
    expect(findObservationScopeViolations(output, 'button-name')).toEqual([]);
    expect(findObservationScopeViolations(output, 'link-name')).toEqual([]);
  });

  it('flags every observation-specific term when no evidence was given at all', () => {
    const output = touch1Output('Le contraste de couleur pose problème ici.');
    const violations = findObservationScopeViolations(output, undefined);
    expect(violations.length).toBeGreaterThan(0);
  });
});
