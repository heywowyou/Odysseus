import { describe, expect, it } from 'vitest';
import { ZodArray, ZodEnum, ZodObject, ZodOptional } from 'zod';
import { llmOutputSchema, themeSchema } from '@odysseus/core';
import { LLM_OUTPUT_JSON_SCHEMA } from './output-schema.js';

interface ObjectShapeInfo {
  keys: string[];
  requiredKeys: string[];
  enumsByKey: Record<string, string[]>;
  arrayStringFields: string[];
}

/** Introspects a zod v3 ZodObject generically. Only unwraps ZodOptional -
 *  this schema has no ZodDefault/ZodNullable fields today. If one is
 *  added later, this function's job is to make the test fail rather than
 *  silently misclassify the new field. */
function describeZodShape(schema: ZodObject<any>): ObjectShapeInfo {
  const keys = Object.keys(schema.shape);
  const requiredKeys: string[] = [];
  const enumsByKey: Record<string, string[]> = {};
  const arrayStringFields: string[] = [];

  for (const key of keys) {
    const field = schema.shape[key];
    const isOptional = field instanceof ZodOptional;
    if (!isOptional) requiredKeys.push(key);

    const unwrapped = isOptional ? field.unwrap() : field;
    if (unwrapped instanceof ZodEnum) {
      enumsByKey[key] = [...unwrapped.options].sort();
    }
    if (unwrapped instanceof ZodArray && unwrapped.element.constructor.name === 'ZodString') {
      arrayStringFields.push(key);
    }
  }

  return {
    keys: [...keys].sort(),
    requiredKeys: requiredKeys.sort(),
    enumsByKey,
    arrayStringFields: arrayStringFields.sort(),
  };
}

function describeJsonSchemaShape(schema: {
  properties: Record<string, any>;
  required?: readonly string[];
}): ObjectShapeInfo {
  const keys = Object.keys(schema.properties).sort();
  const requiredKeys = [...(schema.required ?? [])].sort();
  const enumsByKey: Record<string, string[]> = {};
  const arrayStringFields: string[] = [];

  for (const key of keys) {
    const prop = schema.properties[key];
    if (Array.isArray(prop.enum)) enumsByKey[key] = [...prop.enum].sort();
    if (prop.type === 'array' && prop.items?.type === 'string') arrayStringFields.push(key);
  }

  return { keys, requiredKeys, enumsByKey, arrayStringFields: arrayStringFields.sort() };
}

describe('LLM_OUTPUT_JSON_SCHEMA mirrors llmOutputSchema', () => {
  it('matches top-level keys, required keys, enums, and string-array fields', () => {
    expect(describeJsonSchemaShape(LLM_OUTPUT_JSON_SCHEMA)).toEqual(describeZodShape(llmOutputSchema));
  });

  it('matches theme-level keys, required keys, enums, and string-array fields', () => {
    expect(describeJsonSchemaShape(LLM_OUTPUT_JSON_SCHEMA.properties.themes.items)).toEqual(
      describeZodShape(themeSchema),
    );
  });

  it('locks the known enum vocabularies', () => {
    // Hardcoded on purpose - these ARE the contract, not incidental structure.
    expect(describeZodShape(llmOutputSchema).enumsByKey.overallRisk).toEqual(['high', 'low', 'medium']);
    expect(describeZodShape(themeSchema).enumsByKey.category).toEqual([
      'accessibility',
      'performance',
      'rendering',
      'seo',
    ]);
    expect(describeZodShape(themeSchema).enumsByKey.effort).toEqual(['high', 'low', 'medium']);
    expect(describeZodShape(themeSchema).enumsByKey.impact).toEqual(['high', 'low', 'medium']);
  });

  it('only legalRelevance is optional at the theme level', () => {
    expect(describeZodShape(themeSchema).requiredKeys).not.toContain('legalRelevance');
    expect(describeZodShape(themeSchema).keys).toContain('legalRelevance');
  });
});
