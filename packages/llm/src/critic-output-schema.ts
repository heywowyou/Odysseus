import { MAX_WRITING_CRITIC_ISSUES, WRITING_CRITIC_CATEGORIES } from './critic-schema.js';

/**
 * Hand-built JSON Schema mirror of writingCriticIssueSchema inside
 * writingCriticResponseSchema (critic-schema.ts), sent as the structured
 * output shape hint. NOT the validation authority: the Zod parse in
 * client.ts and validateCriticIssues are. The category enum is closed here
 * too, so an excluded category cannot normally be emitted at all; the
 * deterministic drop in validateCriticIssues is the defense behind it.
 */
export const WRITING_CRITIC_ISSUE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    field: { type: 'string' },
    category: { type: 'string', enum: [...WRITING_CRITIC_CATEGORIES] },
    findingIds: { type: 'array', items: { type: 'string' } },
    problem: { type: 'string' },
  },
  required: ['field', 'category', 'findingIds', 'problem'],
  additionalProperties: false,
} as const;

export const WRITING_CRITIC_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: WRITING_CRITIC_ISSUE_JSON_SCHEMA,
      maxItems: MAX_WRITING_CRITIC_ISSUES,
    },
  },
  required: ['issues'],
  additionalProperties: false,
} as const;
