/**
 * A hand-built JSON Schema mirroring writingPassOutputSchema
 * (writing-schema.ts), for the Mistral API's response_format json_schema
 * shape hint only. See structure-output-schema.ts and
 * docs/rules/llm-layer-rules.md section 8 for why this is hand-built rather
 * than derived with responseFormatFromZodObject.
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
