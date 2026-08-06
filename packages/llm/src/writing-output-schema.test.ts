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

  it('has every theme-level field required, none optional', () => {
    const shape = describeZodShape(writingThemeSchema);
    expect(shape.requiredKeys).toEqual(shape.keys);
  });

  it('has none of the structure-decided fields, or legalRelevance, at the theme level', () => {
    // legalRelevance is built deterministically in legal-relevance.ts as
    // of docs/report-v2-refactor.md 4.3 - the model no longer has a field
    // for it at all, "the model chooses no part of this sentence."
    const shape = describeZodShape(writingThemeSchema);
    expect(shape.keys).not.toContain('findingIds');
    expect(shape.keys).not.toContain('effort');
    expect(shape.keys).not.toContain('impact');
    expect(shape.keys).not.toContain('priorityRank');
    expect(shape.keys).not.toContain('category');
    expect(shape.keys).not.toContain('legalRelevance');
  });

  it('has neither quickWins nor overallRisk at the top level', () => {
    const shape = describeZodShape(writingPassOutputSchema);
    expect(shape.keys).not.toContain('quickWins');
    expect(shape.keys).not.toContain('overallRisk');
  });
});
