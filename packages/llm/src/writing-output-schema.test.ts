import { describe, expect, it } from 'vitest';
import { writingPassOutputSchema, writingThemeSchema } from './writing-schema.js';
import { buildWritingOutputJsonSchema } from './writing-output-schema.js';
import { describeJsonSchemaShape, describeZodShape } from './test-support/zod-shape.js';

interface JsonSchemaObject {
  type: string;
  properties: Record<string, JsonSchemaObject>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: { type?: string };
  enum?: readonly string[];
}

function build(themeKeys: readonly string[]): JsonSchemaObject {
  return buildWritingOutputJsonSchema(themeKeys) as unknown as JsonSchemaObject;
}

describe('buildWritingOutputJsonSchema mirrors writingPassOutputSchema', () => {
  it('matches top-level keys and required keys', () => {
    const built = build(['t1', 't2']);
    const jsonShape = describeJsonSchemaShape(built as never);
    const zodShape = describeZodShape(writingPassOutputSchema);
    expect(jsonShape.keys).toEqual(zodShape.keys);
    expect(jsonShape.requiredKeys).toEqual(zodShape.requiredKeys);
  });

  it('carries every theme-level field except themeKey, which is now the property name', () => {
    const themeValue = build(['t1']).properties.themes!.properties.t1 as never;
    const jsonShape = describeJsonSchemaShape(themeValue);
    const zodShape = describeZodShape(writingThemeSchema);
    expect(jsonShape.keys).toEqual(zodShape.keys.filter((key) => key !== 'themeKey'));
    expect(jsonShape.requiredKeys).toEqual(jsonShape.keys);
    expect(jsonShape.arrayStringFields).toEqual(['recommendedActions']);
  });

  it('has none of the structure-decided fields, or legalRelevance, at the theme level', () => {
    // legalRelevance is built deterministically in legal-relevance.ts as
    // of docs/archive/report-v2-refactor.md 4.3 - the model no longer has a field
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

/**
 * Issue #36: the point of building this schema per call is that the
 * response shape the provider will accept cannot express the failure that
 * destroyed a completed audit. These assert the three properties that make
 * that true, not just that the builder returns something.
 */
describe('the built schema makes a theme-key mismatch unrepresentable', () => {
  it('keys themes by the expected theme keys and requires every one of them', () => {
    const themes = build(['t1', 't2', 't3']).properties.themes!;
    expect(themes.type).toBe('object');
    expect(Object.keys(themes.properties)).toEqual(['t1', 't2', 't3']);
    expect(themes.required).toEqual(['t1', 't2', 't3']);
  });

  it('forbids a theme key that was not shown', () => {
    expect(build(['t1']).properties.themes!.additionalProperties).toBe(false);
  });

  it('cannot express the same theme key twice, because an object key is unique', () => {
    const properties = build(['t1', 't2']).properties.themes!.properties;
    expect(Object.keys(properties)).toHaveLength(new Set(Object.keys(properties)).size);
  });

  it('rejects duplicate theme keys in its own input rather than silently dropping one', () => {
    expect(() => buildWritingOutputJsonSchema(['t1', 't2', 't1'])).toThrow(/duplicate theme key/);
  });

  it('rejects an empty theme list', () => {
    expect(() => buildWritingOutputJsonSchema([])).toThrow(/zero themes/);
  });
});
