/**
 * A hand-built JSON Schema mirroring structurePassOutputSchema
 * (structure-schema.ts), as an explicit, auditable API shape hint. The
 * workspace remains on zod v3 and the mirror-sync tests guard drift. See
 * docs/rules/llm-layer-rules.md section 8.
 *
 * This schema only constrains the API's output shape server-side. It is
 * NOT the validation authority - structurePassOutputSchema.parse() in
 * client.ts is, per CLAUDE.md's non-negotiable "all LLM output is
 * validated with Zod" rule.
 */

import { MAX_STRUCTURE_THEMES } from './structure-schema.js';

export const STRUCTURE_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          findingIds: { type: 'array', items: { type: 'string' } },
          category: {
            type: 'string',
            enum: ['accessibility', 'seo', 'performance', 'rendering', 'privacy'],
          },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
          impact: { type: 'string', enum: ['low', 'medium', 'high'] },
          priorityRank: { type: 'integer' },
        },
        required: ['findingIds', 'category', 'effort', 'impact', 'priorityRank'],
        additionalProperties: false,
      },
      maxItems: MAX_STRUCTURE_THEMES,
    },
    quickWins: { type: 'array', items: { type: 'string' } },
    overallRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['themes', 'quickWins', 'overallRisk'],
  additionalProperties: false,
} as const;
