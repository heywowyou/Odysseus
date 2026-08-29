import { describe, expect, it } from 'vitest';
import type { OutreachProseOutput } from '../outreach-schema.js';
import { findOutreachStructureViolations } from './outreach-structure-guard.js';

function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `mot${i}`).join(' ');
}

describe('findOutreachStructureViolations - touch 1', () => {
  function validTouch1(): OutreachProseOutput {
    return {
      touch: 1,
      evidenceRef: 'e1',
      subject: 'Un point rapide sur votre site',
      opening: words(20) + '.',
      evidenceSentence: words(20) + '.',
      question: words(20) + ' ?',
    };
  }

  it('accepts a well-formed touch 1 (60 words, ends with a question)', () => {
    expect(findOutreachStructureViolations(validTouch1())).toEqual([]);
  });

  it('flags a subject over the character bound', () => {
    const output = { ...validTouch1(), subject: 'x'.repeat(79) };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'subject', reason: 'subject-too-long' }),
    );
  });

  it('flags too few words', () => {
    const output = {
      ...validTouch1(),
      opening: 'Courte phrase.',
      evidenceSentence: 'Autre.',
      question: 'Oui ?',
    };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'touch1-body', reason: 'too-few-words' }),
    );
  });

  it('flags too many words', () => {
    const output = { ...validTouch1(), opening: words(60) + '.' };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'touch1-body', reason: 'too-many-words' }),
    );
  });

  it('flags a missing question in the question field', () => {
    const output = { ...validTouch1(), question: words(20) + '.' };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'question', reason: 'missing-question' }),
    );
  });

  it('flags a question appearing where it should not', () => {
    const output = { ...validTouch1(), opening: words(19) + ' ?' };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'opening', reason: 'unexpected-question' }),
    );
  });
});

describe('findOutreachStructureViolations - touch 2', () => {
  function validTouch2(): OutreachProseOutput {
    return {
      touch: 2,
      evidenceRef: 'e2',
      sentences: [words(10) + '.', words(10) + '.'],
    };
  }

  it('accepts two well-formed sentences with no question', () => {
    expect(findOutreachStructureViolations(validTouch2())).toEqual([]);
  });

  it('flags the wrong sentence count', () => {
    const output = { ...validTouch2(), sentences: [words(10) + '.'] };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'sentences', reason: 'wrong-sentence-count' }),
    );
  });

  it('flags a question in either sentence', () => {
    const output = { ...validTouch2(), sentences: [words(10) + '.', words(9) + ' ?'] };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'sentences[1]', reason: 'unexpected-question' }),
    );
  });

  it('flags too many words across both sentences', () => {
    const output = { ...validTouch2(), sentences: [words(35) + '.', words(35) + '.'] };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'sentences', reason: 'too-many-words' }),
    );
  });
});

describe('findOutreachStructureViolations - touch 3', () => {
  function validTouch3(): OutreachProseOutput {
    return { touch: 3, closing: words(15) + '.' };
  }

  it('accepts one well-formed closing sentence with no question', () => {
    expect(findOutreachStructureViolations(validTouch3())).toEqual([]);
  });

  it('flags more than one sentence', () => {
    const output = { ...validTouch3(), closing: words(10) + '. ' + words(10) + '.' };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'closing', reason: 'wrong-sentence-count' }),
    );
  });

  it('flags a question in the closing', () => {
    const output = { ...validTouch3(), closing: words(14) + ' ?' };
    expect(findOutreachStructureViolations(output)).toContainEqual(
      expect.objectContaining({ field: 'closing', reason: 'unexpected-question' }),
    );
  });
});
