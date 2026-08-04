import { describe, expect, it } from 'vitest';
import { writingPassOutputSchema, writingThemeSchema } from './writing-schema.js';
import { WRITING_OUTPUT_JSON_SCHEMA } from './writing-output-schema.js';
import { describeJsonSchemaShape, describeZodShape } from './test-support/zod-shape.js';

describe('WRITING_OUTPUT_JSON_SCHEMA mirrors writingPassOutputSchema', () => {
  it('matches top-level keys, required keys, and string-array fields', () => {
    expect(describeJsonSchemaShape(WRITING_OUTPUT_JSON_SCHEMA)).toEqual(
      describeZodShape(writingPassOutputSchema),
    );
  });

  it('matches theme-level keys, required keys, and string-array fields', () => {
    expect(describeJsonSchemaShape(WRITING_OUTPUT_JSON_SCHEMA.properties.themes.items)).toEqual(
      describeZodShape(writingThemeSchema),
    );
  });

  it('only legalRelevance is optional at the theme level', () => {
    const shape = describeZodShape(writingThemeSchema);
    expect(shape.requiredKeys).not.toContain('legalRelevance');
    expect(shape.keys).toContain('legalRelevance');
  });

  it('has none of the structure-decided fields at the theme level', () => {
    const shape = describeZodShape(writingThemeSchema);
    expect(shape.keys).not.toContain('findingIds');
    expect(shape.keys).not.toContain('effort');
    expect(shape.keys).not.toContain('impact');
    expect(shape.keys).not.toContain('priorityRank');
    expect(shape.keys).not.toContain('category');
  });

  it('has neither quickWins nor overallRisk at the top level', () => {
    const shape = describeZodShape(writingPassOutputSchema);
    expect(shape.keys).not.toContain('quickWins');
    expect(shape.keys).not.toContain('overallRisk');
  });
});
