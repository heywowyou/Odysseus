import { describe, expect, it } from 'vitest';
import {
  MAX_STRUCTURE_THEMES,
  structurePassOutputSchema,
  structureThemeSchema,
} from './structure-schema.js';
import { STRUCTURE_OUTPUT_JSON_SCHEMA } from './structure-output-schema.js';
import { describeJsonSchemaShape, describeZodShape } from './test-support/zod-shape.js';

describe('STRUCTURE_OUTPUT_JSON_SCHEMA mirrors structurePassOutputSchema', () => {
  it('matches top-level keys, required keys, enums, and string-array fields', () => {
    expect(describeJsonSchemaShape(STRUCTURE_OUTPUT_JSON_SCHEMA)).toEqual(
      describeZodShape(structurePassOutputSchema),
    );
  });

  it('matches theme-level keys, required keys, enums, and string-array fields', () => {
    expect(describeJsonSchemaShape(STRUCTURE_OUTPUT_JSON_SCHEMA.properties.themes.items)).toEqual(
      describeZodShape(structureThemeSchema),
    );
  });

  it('enforces the same theme ceiling as the Zod authority', () => {
    expect(STRUCTURE_OUTPUT_JSON_SCHEMA.properties.themes.maxItems).toBe(MAX_STRUCTURE_THEMES);
    const theme = {
      findingIds: ['f1'],
      category: 'seo',
      effort: 'low',
      impact: 'low',
      priorityRank: 1,
    };
    const output = { quickWins: [], overallRisk: 'low' };
    expect(
      structurePassOutputSchema.safeParse({
        ...output,
        themes: Array.from({ length: MAX_STRUCTURE_THEMES }, () => theme),
      }).success,
    ).toBe(true);
    expect(
      structurePassOutputSchema.safeParse({
        ...output,
        themes: Array.from({ length: MAX_STRUCTURE_THEMES + 1 }, () => theme),
      }).success,
    ).toBe(false);
  });

  it('has no prose fields at all at the theme level', () => {
    const shape = describeZodShape(structureThemeSchema);
    expect(shape.keys).not.toContain('title');
    expect(shape.keys).not.toContain('businessImpact');
    expect(shape.keys).not.toContain('legalRelevance');
    expect(shape.keys).not.toContain('recommendedActions');
  });
});
