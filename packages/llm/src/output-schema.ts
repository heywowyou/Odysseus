/**
 * A hand-built JSON Schema mirroring the locked llmOutputSchema
 * (packages/core/src/types/llm-output.ts), for the Anthropic API's
 * output_config.format shape hint only.
 *
 * This exists because packages/core's llmOutputSchema is built with the
 * classic zod (v3) API, while the installed @anthropic-ai/sdk's
 * zodOutputFormat helper requires a zod/v4 schema object - passing a v3
 * schema into it fails to typecheck (the two ZodType shapes are
 * structurally incompatible). Rather than touch the locked contract or
 * fight a zod major-version mismatch, this file duplicates the shape by
 * hand, the same way packages/core/src/types/manifest.ts already
 * duplicates a scanner-side status union by value with the same
 * justification. Keep the two in sync by hand.
 *
 * This schema only constrains the API's output shape server-side. It is
 * NOT the validation authority - llmOutputSchema.parse() in client.ts is,
 * per CLAUDE.md's non-negotiable "all LLM output is validated with Zod"
 * rule. Constraints structured-output doesn't support (minItems,
 * minLength, positive-integer minimums) are deliberately omitted here;
 * llmOutputSchema.parse() enforces those regardless.
 */

export const LLM_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    executiveSummary: { type: 'string' },
    overallRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: ['accessibility', 'seo', 'performance', 'rendering'],
          },
          businessImpact: { type: 'string' },
          legalRelevance: { type: 'string' },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
          impact: { type: 'string', enum: ['low', 'medium', 'high'] },
          priorityRank: { type: 'integer' },
          findingIds: { type: 'array', items: { type: 'string' } },
          recommendedActions: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'title',
          'category',
          'businessImpact',
          'effort',
          'impact',
          'priorityRank',
          'findingIds',
          'recommendedActions',
        ],
        additionalProperties: false,
      },
    },
    quickWins: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['executiveSummary', 'overallRisk', 'themes', 'quickWins', 'notes'],
  additionalProperties: false,
} as const;
