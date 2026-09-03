/**
 * A hand-built JSON Schema mirroring writingPassOutputSchema
 * (writing-schema.ts), as an explicit, auditable API shape hint. See
 * structure-output-schema.ts and docs/rules/llm-layer-rules.md section 8.
 *
 * NOT the validation authority - writingPassOutputSchema.parse() in
 * client.ts is.
 */

export const WRITING_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          themeKey: { type: 'string' },
          title: { type: 'string' },
          businessImpact: { type: 'string' },
          recommendedActions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
        required: ['themeKey', 'title', 'businessImpact', 'recommendedActions'],
        additionalProperties: false,
      },
    },
    executiveSummary: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['themes', 'executiveSummary', 'notes'],
  additionalProperties: false,
} as const;
