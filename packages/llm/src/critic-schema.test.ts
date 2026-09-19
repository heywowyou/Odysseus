import { describe, expect, it } from 'vitest';
import {
  MAX_WRITING_CRITIC_ISSUES,
  WRITING_CRITIC_CATEGORIES,
  writingCriticIssueSchema,
  writingCriticResponseSchema,
} from './critic-schema.js';
import {
  WRITING_CRITIC_ISSUE_JSON_SCHEMA,
  WRITING_CRITIC_OUTPUT_JSON_SCHEMA,
} from './critic-output-schema.js';
import { describeJsonSchemaShape, describeZodShape } from './test-support/zod-shape.js';

const validIssue = {
  field: 'themes[0](t1).businessImpact',
  category: 'contradicts-evidence',
  findingIds: ['f1'],
  problem: 'The prose says every page fails; the finding lists one page.',
};

describe('writing critic schema', () => {
  it('accepts an issue in a closed category bound to a finding', () => {
    expect(writingCriticIssueSchema.parse(validIssue)).toEqual(validIssue);
  });

  it.each(['tone', 'generic-consequence', 'length', 'style'])(
    'rejects the out-of-scope category %s',
    (category) => {
      expect(writingCriticIssueSchema.safeParse({ ...validIssue, category }).success).toBe(false);
    },
  );

  it('rejects an issue with no finding ID', () => {
    expect(writingCriticIssueSchema.safeParse({ ...validIssue, findingIds: [] }).success).toBe(
      false,
    );
  });

  it('rejects an issue carrying an unknown key', () => {
    expect(
      writingCriticIssueSchema.safeParse({ ...validIssue, replacement: 'new prose' }).success,
    ).toBe(false);
  });

  it('rejects a list over the cap and accepts one at it', () => {
    const atCap = Array.from({ length: MAX_WRITING_CRITIC_ISSUES }, () => validIssue);
    expect(writingCriticResponseSchema.safeParse({ issues: atCap }).success).toBe(true);
    expect(writingCriticResponseSchema.safeParse({ issues: [...atCap, validIssue] }).success).toBe(
      false,
    );
  });

  it('accepts an empty issue list', () => {
    expect(writingCriticResponseSchema.parse({ issues: [] })).toEqual({ issues: [] });
  });

  it('keeps the provider JSON schema in step with the Zod issue schema', () => {
    expect(describeJsonSchemaShape(WRITING_CRITIC_ISSUE_JSON_SCHEMA)).toEqual(
      describeZodShape(writingCriticIssueSchema),
    );
    expect(WRITING_CRITIC_OUTPUT_JSON_SCHEMA.properties.issues.maxItems).toBe(
      MAX_WRITING_CRITIC_ISSUES,
    );
    expect(WRITING_CRITIC_ISSUE_JSON_SCHEMA.properties.category.enum).toEqual([
      ...WRITING_CRITIC_CATEGORIES,
    ]);
  });
});
