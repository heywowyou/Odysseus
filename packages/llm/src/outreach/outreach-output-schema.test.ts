import { describe, expect, it } from 'vitest';
import { describeJsonSchemaShape, describeZodShape } from '../test-support/zod-shape.js';
import {
  OUTREACH_TOUCH1_OUTPUT_JSON_SCHEMA,
  OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA,
  OUTREACH_TOUCH3_OUTPUT_JSON_SCHEMA,
} from './outreach-output-schema.js';
import {
  outreachTouch1OutputSchema,
  outreachTouch2OutputSchema,
  outreachTouch3OutputSchema,
} from './outreach-schema.js';

describe('outreach output JSON schemas mirror their zod authority', () => {
  it('touch 1 matches keys, required keys, and string-array fields', () => {
    expect(describeJsonSchemaShape(OUTREACH_TOUCH1_OUTPUT_JSON_SCHEMA)).toEqual(
      describeZodShape(outreachTouch1OutputSchema),
    );
  });

  it('touch 2 matches keys, required keys, and string-array fields', () => {
    expect(describeJsonSchemaShape(OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA)).toEqual(
      describeZodShape(outreachTouch2OutputSchema),
    );
  });

  it('touch 3 matches keys, required keys, and string-array fields', () => {
    expect(describeJsonSchemaShape(OUTREACH_TOUCH3_OUTPUT_JSON_SCHEMA)).toEqual(
      describeZodShape(outreachTouch3OutputSchema),
    );
  });

  it('every field is required on all three touches, none optional', () => {
    for (const schema of [
      outreachTouch1OutputSchema,
      outreachTouch2OutputSchema,
      outreachTouch3OutputSchema,
    ]) {
      const shape = describeZodShape(schema);
      expect(shape.requiredKeys).toEqual(shape.keys);
    }
  });

  it('has sentences as a two-element string array on touch 2, both sides', () => {
    expect(describeZodShape(outreachTouch2OutputSchema).arrayStringFields).toEqual(['sentences']);
    expect(describeJsonSchemaShape(OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA).arrayStringFields).toEqual([
      'sentences',
    ]);
    expect(OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA.properties.sentences.minItems).toBe(2);
    expect(OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA.properties.sentences.maxItems).toBe(2);
  });
});

/** Encodes "this pass has no field for X" as a test, not just a comment -
 *  the same discipline writing-output-schema.test.ts uses for the writing
 *  pass. A field a guard could otherwise be asked to police is a field this
 *  schema should not have at all. */
describe('outreach schemas have no field for what the model must not decide', () => {
  const forbidden = [
    'link',
    'url',
    'price',
    'offerPrice',
    'signature',
    'optOut',
    'facts',
    'factsBlock',
    'legal',
    'legalContent',
    'severity',
    'findingId',
    'criterion',
    'wcagCriteria',
    'pageCount',
    'factRef',
    'domain',
    'senderIdentity',
  ];

  it('touch 1 carries none of them', () => {
    const keys = describeZodShape(outreachTouch1OutputSchema).keys;
    for (const field of forbidden) expect(keys).not.toContain(field);
  });

  it('touch 2 carries none of them, and has no subject field', () => {
    const keys = describeZodShape(outreachTouch2OutputSchema).keys;
    for (const field of forbidden) expect(keys).not.toContain(field);
    expect(keys).not.toContain('subject');
  });

  it('touch 3 carries none of them, and has no subject or evidenceRef field', () => {
    const keys = describeZodShape(outreachTouch3OutputSchema).keys;
    for (const field of forbidden) expect(keys).not.toContain(field);
    expect(keys).not.toContain('subject');
    expect(keys).not.toContain('evidenceRef');
  });
});
