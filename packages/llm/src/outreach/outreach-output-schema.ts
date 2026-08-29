/**
 * Hand-built JSON Schemas mirroring the three closed schemas in
 * outreach-schema.ts, for the Mistral API's response_format json_schema
 * shape hint only. Same posture as writing-output-schema.ts: NOT the
 * validation authority - the zod `.parse()` calls in outreach-client.ts are.
 * Three separate schemas, not one union - see outreach-schema.ts's doc
 * comment for why.
 *
 * `touch` and `evidenceRef` deliberately carry no `enum` constraint here,
 * even though the zod side pins them to a single literal. zod-shape.ts's
 * `describeZodShape` (shared with writing-output-schema.test.ts) does not
 * unwrap `ZodLiteral` into `enumsByKey`, so an `enum` here would make the
 * parity test compare an enum-shaped JSON property against a zod side that
 * reports no enum at all - a real mismatch, not a false one. The zod
 * `.parse()` call still enforces the exact value; only the API-facing hint
 * is looser here than the schema it mirrors.
 */

export const OUTREACH_TOUCH1_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    touch: { type: 'integer' },
    evidenceRef: { type: 'string' },
    subject: { type: 'string' },
    opening: { type: 'string' },
    evidenceSentence: { type: 'string' },
    question: { type: 'string' },
  },
  required: ['touch', 'evidenceRef', 'subject', 'opening', 'evidenceSentence', 'question'],
  additionalProperties: false,
} as const;

export const OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    touch: { type: 'integer' },
    evidenceRef: { type: 'string' },
    sentences: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
  },
  required: ['touch', 'evidenceRef', 'sentences'],
  additionalProperties: false,
} as const;

export const OUTREACH_TOUCH3_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    touch: { type: 'integer' },
    closing: { type: 'string' },
  },
  required: ['touch', 'closing'],
  additionalProperties: false,
} as const;
