import { describe, expect, it } from 'vitest';
import { reviewerPassOutputSchema, reviewerThemeSchema } from './reviewer-schema.js';
import { REVIEWER_OUTPUT_JSON_SCHEMA } from './reviewer-output-schema.js';
import { describeJsonSchemaShape, describeZodShape } from './test-support/zod-shape.js';

describe('REVIEWER_OUTPUT_JSON_SCHEMA mirrors reviewerPassOutputSchema', () => {
  it('matches top-level keys and required keys', () => {
    expect(describeJsonSchemaShape(REVIEWER_OUTPUT_JSON_SCHEMA)).toEqual(
      describeZodShape(reviewerPassOutputSchema),
    );
  });

  it('matches theme-level keys and required keys', () => {
    expect(describeJsonSchemaShape(REVIEWER_OUTPUT_JSON_SCHEMA.properties.themes.items)).toEqual(
      describeZodShape(reviewerThemeSchema),
    );
  });

  it('reviews only the guarded prose surface: no title, no grouping fields', () => {
    const shape = describeZodShape(reviewerThemeSchema);
    expect(shape.keys).not.toContain('title');
    expect(shape.keys).not.toContain('findingIds');
    expect(shape.keys).not.toContain('priorityRank');
  });
});
