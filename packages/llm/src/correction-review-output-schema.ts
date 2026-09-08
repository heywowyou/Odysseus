import type { CorrectionProposal } from './correction-review-schema.js';

/** Provider-facing hint only. The local Zod schema remains the validation
 * authority, including the conditional replacement rule. `field` is narrowed
 * per call to the exact source addresses rather than allowing a generic key. */
const CHECKS_JSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'string',
    enum: [
      'unsupported-specific-claim',
      'unhedged-causality',
      'language-quality',
      'repetition',
      'translation-parity',
    ],
  },
  maxItems: 5,
} as const;

export function buildCorrectionReviewOutputJsonSchema(
  fields: readonly string[],
): Record<string, unknown> {
  const baseProperties = {
    field: { type: 'string', enum: [...fields] },
    checks: CHECKS_JSON_SCHEMA,
    reason: { type: 'string' },
  } as const;
  const proposalSchema = (verdict: CorrectionProposal['verdict'], replacement: boolean) => ({
    type: 'object',
    properties: {
      ...baseProperties,
      verdict: { type: 'string', enum: [verdict] },
      ...(replacement ? { replacement: { type: 'string' } } : {}),
    },
    required: [...Object.keys(baseProperties), 'verdict', ...(replacement ? ['replacement'] : [])],
    additionalProperties: false,
  });
  return {
    type: 'object',
    properties: {
      proposals: {
        type: 'array',
        items: {
          anyOf: [
            proposalSchema('keep', false),
            proposalSchema('propose-change', true),
            proposalSchema('unsure', false),
          ],
        },
      },
    },
    required: ['proposals'],
    additionalProperties: false,
  };
}
