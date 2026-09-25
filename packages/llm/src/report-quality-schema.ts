import { z } from 'zod';

/** Model JSON frequently emits an explicit null for a field the contract
 *  treats as absent. The core report-quality contracts use plain optional
 *  fields, so accept null and normalize it away — never pass a null
 *  optional through as a value. */
/** A field the model may omit or send as null; both read as absent. The
 *  outer optional marks the key itself optional: zod 4 derives a key's
 *  optionality from its schema, so a preprocess alone would make it
 *  required. */
function absentable<T extends z.ZodType>(schema: T) {
  return z
    .preprocess((value) => (value === null ? undefined : value), schema.optional())
    .optional();
}

const evidenceBoundSegmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal('fact'),
      factId: z.string().min(1),
      format: absentable(z.string().min(1)),
    })
    .strict(),
  z.object({ kind: z.literal('reference'), referenceId: z.string().min(1) }).strict(),
]);

export const evidenceBoundContentSchema = z
  .object({ segments: z.array(evidenceBoundSegmentSchema).min(1) })
  .strict();

const categorySchema = z.enum([
  'accessibility',
  'seo',
  'geo',
  'performance',
  'rendering',
  'privacy',
]);
const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const seniorPlanOutputSchema = z
  .object({
    remediationProjects: z
      .array(
        z
          .object({
            projectKey: z.string().min(1),
            category: categorySchema,
            findingIds: z.array(z.string().min(1)).min(1),
            evidenceRefs: z.array(z.string()),
            factRefs: z.array(z.string()),
            likelyRootCause: absentable(
              z
                .object({
                  text: z.string().min(1),
                  confidence: confidenceSchema,
                  inference: z.literal(true),
                })
                .strict(),
            ),
            conditionality: absentable(z.string().min(1)),
            impact: z.enum(['low', 'medium', 'high']),
            effort: z.enum(['low', 'medium', 'high']),
            rationale: z.string().min(1),
            dependencies: z.array(z.string()),
            sharedDependencies: z.array(z.string()),
          })
          .strict(),
      )
      .min(1),
    executivePriorityKeys: z.array(z.string().min(1)),
  })
  .strict();

export type SeniorPlanOutput = z.infer<typeof seniorPlanOutputSchema>;

export const qualityWriterOutputSchema = z
  .object({
    executiveSummary: evidenceBoundContentSchema,
    notes: evidenceBoundContentSchema,
    projects: z
      .array(
        z
          .object({
            projectKey: z.string().min(1),
            title: evidenceBoundContentSchema,
            businessImpact: evidenceBoundContentSchema,
            recommendedActions: z.array(evidenceBoundContentSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type QualityWriterOutput = z.infer<typeof qualityWriterOutputSchema>;

const issueProposalSchema = z
  .object({
    issueId: z.string().min(1),
    kind: z.enum(['objective-defect', 'preference']),
    severity: z.enum(['blocking', 'major', 'minor']),
    target: z.string().min(1),
    domain: z.string().min(1),
    supportingRefs: z.array(z.string()),
    reason: z.string().min(1),
    repairRoute: z.enum([
      'recompute-report-fact',
      'upstream-evidence-defect',
      'patch-plan',
      'patch-prose',
      'layout-hint',
      'rerender',
      'template-defect',
    ]),
    status: z.enum(['proposed', 'unsure']),
  })
  .strict();

export const qualityReviewOutputSchema = z
  .object({ issues: z.array(issueProposalSchema) })
  .strict();
export type QualityReviewOutput = z.infer<typeof qualityReviewOutputSchema>;

export const issueAdjudicationOutputSchema = z
  .object({
    decisions: z.array(
      z
        .object({
          issueId: z.string().min(1),
          status: z.enum(['accepted', 'rejected', 'unsure']),
          reason: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const editorOutputSchema = z
  .object({
    patches: z.array(
      z
        .object({
          issueId: z.string().min(1),
          target: z.string().min(1),
          replacement: evidenceBoundContentSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type EditorOutput = z.infer<typeof editorOutputSchema>;

export const finalArbiterOutputSchema = z
  .object({
    approved: z.boolean(),
    issues: z.array(issueProposalSchema),
  })
  .strict();

export const SENIOR_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['remediationProjects', 'executivePriorityKeys'],
  properties: {
    remediationProjects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'projectKey',
          'category',
          'findingIds',
          'evidenceRefs',
          'factRefs',
          'impact',
          'effort',
          'rationale',
          'dependencies',
          'sharedDependencies',
        ],
        properties: {
          projectKey: { type: 'string', minLength: 1 },
          category: {
            type: 'string',
            enum: ['accessibility', 'seo', 'geo', 'performance', 'rendering', 'privacy'],
          },
          findingIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          factRefs: { type: 'array', items: { type: 'string' } },
          likelyRootCause: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'confidence', 'inference'],
                properties: {
                  text: { type: 'string' },
                  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                  inference: { const: true },
                },
              },
              { type: 'null' },
            ],
          },
          conditionality: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          impact: { type: 'string', enum: ['low', 'medium', 'high'] },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          sharedDependencies: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    executivePriorityKeys: { type: 'array', items: { type: 'string' } },
  },
} as const;

const CONTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      minItems: 1,
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'text'],
            properties: { kind: { const: 'text' }, text: { type: 'string', minLength: 1 } },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'factId'],
            properties: {
              kind: { const: 'fact' },
              factId: { type: 'string', minLength: 1 },
              format: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'referenceId'],
            properties: {
              kind: { const: 'reference' },
              referenceId: { type: 'string', minLength: 1 },
            },
          },
        ],
      },
    },
  },
} as const;

export const QUALITY_WRITER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'notes', 'projects'],
  properties: {
    executiveSummary: CONTENT_SCHEMA,
    notes: CONTENT_SCHEMA,
    projects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['projectKey', 'title', 'businessImpact', 'recommendedActions'],
        properties: {
          projectKey: { type: 'string' },
          title: CONTENT_SCHEMA,
          businessImpact: CONTENT_SCHEMA,
          recommendedActions: { type: 'array', minItems: 1, items: CONTENT_SCHEMA },
        },
      },
    },
  },
} as const;

const ISSUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'issueId',
    'kind',
    'severity',
    'target',
    'domain',
    'supportingRefs',
    'reason',
    'repairRoute',
    'status',
  ],
  properties: {
    issueId: { type: 'string' },
    kind: { type: 'string', enum: ['objective-defect', 'preference'] },
    severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
    target: { type: 'string' },
    domain: { type: 'string' },
    supportingRefs: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
    repairRoute: {
      type: 'string',
      enum: [
        'recompute-report-fact',
        'upstream-evidence-defect',
        'patch-plan',
        'patch-prose',
        'layout-hint',
        'rerender',
        'template-defect',
      ],
    },
    status: { type: 'string', enum: ['proposed', 'unsure'] },
  },
} as const;

export const QUALITY_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issues'],
  properties: { issues: { type: 'array', items: ISSUE_SCHEMA } },
} as const;

export const ADJUDICATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decisions'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['issueId', 'status', 'reason'],
        properties: {
          issueId: { type: 'string' },
          status: { type: 'string', enum: ['accepted', 'rejected', 'unsure'] },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export const EDITOR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['patches'],
  properties: {
    patches: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['issueId', 'target', 'replacement'],
        properties: {
          issueId: { type: 'string' },
          target: { type: 'string' },
          replacement: CONTENT_SCHEMA,
        },
      },
    },
  },
} as const;

export const FINAL_ARBITER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'issues'],
  properties: {
    approved: { type: 'boolean' },
    issues: { type: 'array', items: ISSUE_SCHEMA },
  },
} as const;
