import { ZodArray, ZodEnum, type ZodObject, ZodOptional, type ZodTypeAny } from 'zod';

export interface ObjectShapeInfo {
  keys: string[];
  requiredKeys: string[];
  enumsByKey: Record<string, string[]>;
  arrayStringFields: string[];
}

/** Introspects a zod ZodObject generically. Only unwraps ZodOptional -
 *  none of this package's schemas have a ZodDefault/ZodNullable field
 *  today. If one is added later, this function's job is to make a
 *  shape-consistency test fail rather than silently misclassify the new
 *  field. Shared by structure-output-schema.test.ts and
 *  writing-output-schema.test.ts, originally written for the deleted
 *  output-schema.test.ts. */
export function describeZodShape(schema: ZodObject<Record<string, ZodTypeAny>>): ObjectShapeInfo {
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
      enumsByKey[key] = unwrapped.options.map(String).sort();
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

export function describeJsonSchemaShape(schema: {
  properties: Record<
    string,
    { enum?: readonly string[]; type?: string; items?: { type?: string } }
  >;
  required?: readonly string[];
}): ObjectShapeInfo {
  const keys = Object.keys(schema.properties).sort();
  const requiredKeys = [...(schema.required ?? [])].sort();
  const enumsByKey: Record<string, string[]> = {};
  const arrayStringFields: string[] = [];

  for (const key of keys) {
    const prop = schema.properties[key]!;
    if (Array.isArray(prop.enum)) enumsByKey[key] = [...prop.enum].sort();
    if (prop.type === 'array' && prop.items?.type === 'string') arrayStringFields.push(key);
  }

  return { keys, requiredKeys, enumsByKey, arrayStringFields: arrayStringFields.sort() };
}
