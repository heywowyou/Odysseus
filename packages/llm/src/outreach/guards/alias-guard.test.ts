import { describe, expect, it } from 'vitest';
import type { OutreachProseInput } from '../outreach-input.js';
import type { OutreachProseOutput } from '../outreach-schema.js';
import { findAliasViolations } from './alias-guard.js';

function touch1Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 1,
    businessName: 'Hôtel des Voyageurs',
    evidence: {
      alias: 'e1',
      observation: 'Une partie du contenu ne s’affiche pas.',
      pageRole: 'homepage',
    },
    ageFramingPermitted: false,
    ...overrides,
  };
}

function touch1Output(
  overrides: Partial<OutreachProseOutput & { touch: 1 }> = {},
): OutreachProseOutput {
  return {
    touch: 1,
    evidenceRef: 'e1',
    subject: 'Un point rapide sur votre site',
    opening: 'Bonjour, nous avons regardé la version publique de votre site.',
    evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
    question: 'Est-ce que cela correspond à ce que vos visiteurs voient ?',
    ...overrides,
  } as OutreachProseOutput;
}

describe('findAliasViolations', () => {
  it('finds nothing for a matching touch 1 evidenceRef and clean prose', () => {
    expect(findAliasViolations(touch1Input(), touch1Output())).toEqual([]);
  });

  it('flags an evidenceRef mismatch against the input alias', () => {
    // Not reachable through a real call today - selectOutreachEvidence always
    // pairs touch 1 with alias e1, and outreachTouch1OutputSchema pins
    // evidenceRef to that same literal - but the guard must still catch a
    // caller that mismatches the two, which is exactly what it is for.
    const input: OutreachProseInput = {
      language: 'fr',
      touch: 1,
      businessName: 'Hôtel des Voyageurs',
      ageFramingPermitted: false,
    };
    const violations = findAliasViolations(input, touch1Output());
    expect(violations).toContainEqual(
      expect.objectContaining({ field: 'evidenceRef', reason: 'evidence-ref-mismatch' }),
    );
  });

  it('flags the alias leaking into a prose field', () => {
    const output = touch1Output({ evidenceSentence: "Voir l'élément e1 pour plus de détails." });
    const violations = findAliasViolations(touch1Input(), output);
    expect(violations).toContainEqual(
      expect.objectContaining({ field: 'evidenceSentence', reason: 'alias-leaked-in-prose' }),
    );
  });

  it('finds nothing for touch 3, which has no evidence at all', () => {
    const input: OutreachProseInput = {
      language: 'fr',
      touch: 3,
      businessName: 'Hôtel des Voyageurs',
      ageFramingPermitted: false,
    };
    const output: OutreachProseOutput = {
      touch: 3,
      closing: 'Voici où en est la réglementation, si cela vous est utile.',
    };
    expect(findAliasViolations(input, output)).toEqual([]);
  });
});
