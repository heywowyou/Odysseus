import { describe, expect, it } from 'vitest';
import {
  outreachProseFields,
  outreachTouch1OutputSchema,
  outreachTouch2OutputSchema,
  outreachTouch3OutputSchema,
} from './outreach-schema.js';

function touch1(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    touch: 1,
    evidenceRef: 'e1',
    subject: 'Un point rapide sur votre site',
    opening: 'Nous avons regardé la version publique de votre site.',
    evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
    question: 'Est-ce que cela correspond à ce que vos visiteurs voient ?',
    ...overrides,
  };
}

function touch2(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    touch: 2,
    evidenceRef: 'e2',
    sentences: [
      'Un deuxième élément a retenu notre attention sur votre site.',
      'Souhaitez-vous en voir le détail ?',
    ],
    ...overrides,
  };
}

function touch3(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    touch: 3,
    closing: 'Voici où en est la réglementation, si cela vous est utile.',
    ...overrides,
  };
}

describe('outreachTouch1OutputSchema', () => {
  it('parses a well-formed touch 1 response', () => {
    expect(() => outreachTouch1OutputSchema.parse(touch1())).not.toThrow();
  });

  it('rejects an extra field', () => {
    expect(() => outreachTouch1OutputSchema.parse(touch1({ extra: 'nope' }))).toThrow();
  });

  it('rejects the wrong evidenceRef', () => {
    expect(() => outreachTouch1OutputSchema.parse(touch1({ evidenceRef: 'e2' }))).toThrow();
  });

  it('rejects an empty subject', () => {
    expect(() => outreachTouch1OutputSchema.parse(touch1({ subject: '' }))).toThrow();
  });

  it('rejects a subject over the character bound', () => {
    expect(() => outreachTouch1OutputSchema.parse(touch1({ subject: 'x'.repeat(79) }))).toThrow();
  });

  it('rejects an overlong prose field', () => {
    expect(() =>
      outreachTouch1OutputSchema.parse(touch1({ evidenceSentence: 'x'.repeat(401) })),
    ).toThrow();
  });

  it('rejects a touch-2-shaped payload (wrong fields for this touch)', () => {
    expect(() => outreachTouch1OutputSchema.parse(touch2())).toThrow();
  });
});

describe('outreachTouch2OutputSchema', () => {
  it('parses a well-formed touch 2 response', () => {
    expect(() => outreachTouch2OutputSchema.parse(touch2())).not.toThrow();
  });

  it('rejects fewer than two sentences', () => {
    expect(() => outreachTouch2OutputSchema.parse(touch2({ sentences: ['only one.'] }))).toThrow();
  });

  it('rejects more than two sentences', () => {
    expect(() =>
      outreachTouch2OutputSchema.parse(touch2({ sentences: ['one.', 'two.', 'three.'] })),
    ).toThrow();
  });

  it('rejects an empty sentence', () => {
    expect(() => outreachTouch2OutputSchema.parse(touch2({ sentences: ['', 'two.'] }))).toThrow();
  });

  it('rejects a subject field, which touch 2 has no schema slot for', () => {
    expect(() => outreachTouch2OutputSchema.parse(touch2({ subject: 'Re: something' }))).toThrow();
  });

  it('rejects the wrong evidenceRef', () => {
    expect(() => outreachTouch2OutputSchema.parse(touch2({ evidenceRef: 'e1' }))).toThrow();
  });
});

describe('outreachTouch3OutputSchema', () => {
  it('parses a well-formed touch 3 response', () => {
    expect(() => outreachTouch3OutputSchema.parse(touch3())).not.toThrow();
  });

  it('rejects an empty closing', () => {
    expect(() => outreachTouch3OutputSchema.parse(touch3({ closing: '' }))).toThrow();
  });

  it('rejects an evidenceRef field, which touch 3 has no schema slot for', () => {
    expect(() => outreachTouch3OutputSchema.parse(touch3({ evidenceRef: 'e1' }))).toThrow();
  });

  it('rejects a subject field', () => {
    expect(() => outreachTouch3OutputSchema.parse(touch3({ subject: 'Re: something' }))).toThrow();
  });
});

describe('outreachProseFields', () => {
  it('extracts the four fields of a touch 1 output in order', () => {
    const output = outreachTouch1OutputSchema.parse(touch1());
    expect(outreachProseFields(output).map((f) => f.field)).toEqual([
      'subject',
      'opening',
      'evidenceSentence',
      'question',
    ]);
  });

  it('extracts both sentences of a touch 2 output as indexed fields', () => {
    const output = outreachTouch2OutputSchema.parse(touch2());
    expect(outreachProseFields(output).map((f) => f.field)).toEqual([
      'sentences[0]',
      'sentences[1]',
    ]);
  });

  it('extracts the single closing field of a touch 3 output', () => {
    const output = outreachTouch3OutputSchema.parse(touch3());
    expect(outreachProseFields(output)).toEqual([{ field: 'closing', text: output.closing }]);
  });
});
