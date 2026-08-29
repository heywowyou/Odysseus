/**
 * A hand-built JSON Schema mirroring reviewerPassOutputSchema
 * (reviewer-schema.ts), for the Mistral API's response_format json_schema
 * shape hint only. See writing-output-schema.ts and
 * docs/llm-layer-rules.md section 8 for why this is hand-built rather
 * than derived with responseFormatFromZodObject.
 *
 * NOT the validation authority - reviewerPassOutputSchema.parse() in
 * client.ts is. Character bounds (reason max length) live in the Zod
 * schema only, matching the existing mirrors' precedent.
 */

const FIELD_REVIEW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['supported', 'unsupported', 'unsure'] },
    reason: { type: 'string' },
  },
  required: ['verdict', 'reason'],
  additionalProperties: false,
} as const;

export const REVIEWER_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          themeKey: { type: 'string' },
          businessImpact: FIELD_REVIEW_JSON_SCHEMA,
          recommendedActions: { type: 'array', items: FIELD_REVIEW_JSON_SCHEMA, maxItems: 3 },
        },
        required: ['themeKey', 'businessImpact', 'recommendedActions'],
        additionalProperties: false,
      },
    },
    executiveSummary: FIELD_REVIEW_JSON_SCHEMA,
    notes: FIELD_REVIEW_JSON_SCHEMA,
  },
  required: ['themes', 'executiveSummary', 'notes'],
  additionalProperties: false,
} as const;
