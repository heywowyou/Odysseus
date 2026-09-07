/**
 * The provider-facing JSON Schema for the writing pass, built per call from
 * the theme keys the model is actually shown. See structure-output-schema.ts
 * and docs/rules/llm-layer-rules.md section 8.
 *
 * NOT the validation authority - writingPassOutputSchema.parse() in
 * client.ts is (CLAUDE.md trade-off 7).
 *
 * Why this one is built rather than declared, unlike its structure-pass
 * sibling (issue #36): the writing pass used to ask for an array of theme
 * objects each echoing its own themeKey, and correctness was checked only
 * after the response arrived. A real audit of www.villasfoch.fr died at the
 * English pass because the model returned the key t8 twice, on all three
 * attempts, including the two that carried the rejection back as a
 * correction. Everything before it - the crawl, the content checks,
 * Lighthouse, the French pass - was already paid for and was thrown away.
 *
 * Keying the object by the expected theme keys makes that response
 * unrepresentable rather than merely detectable. A JSON object cannot carry
 * the same key twice; `required` covers every expected key, so none can be
 * omitted; `additionalProperties: false` means none can be invented. Under
 * OpenAI's strict structured output every declared property must be
 * required, which is exactly the constraint wanted here.
 *
 * The array alternative was rejected on measurement of what strict mode
 * supports: `uniqueItems`, `minItems`, and `maxItems` are all unsupported
 * keywords there, so an array of themes with an enum-constrained key would
 * still have admitted the duplicate that caused the incident.
 *
 * The array shape the rest of the codebase reads is unchanged: client.ts
 * turns this object back into `WritingPassOutput['themes']` before the Zod
 * authority parses it.
 */

const WRITING_THEME_VALUE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    businessImpact: { type: 'string' },
    // Plan 027: raised 3 -> 5 alongside writing-schema.ts's own ceiling.
    // minItems stays unsupported under OpenAI strict mode (see this file's
    // module comment) - the floor is Zod-only, per trade-off 7.
    recommendedActions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['title', 'businessImpact', 'recommendedActions'],
  additionalProperties: false,
} as const;

export function buildWritingOutputJsonSchema(
  themeKeys: readonly string[],
): Record<string, unknown> {
  if (themeKeys.length === 0) {
    throw new Error(
      'odysseus analyze (writing pass): cannot build a response schema for zero themes',
    );
  }
  const duplicates = themeKeys.filter((key, index) => themeKeys.indexOf(key) !== index);
  if (duplicates.length > 0) {
    // The caller's own theme keys are duplicated, which no provider schema
    // can absorb: keying by them would silently drop a theme.
    throw new Error(
      `odysseus analyze (writing pass): duplicate theme key(s) in the pass input: ${[...new Set(duplicates)].join(', ')}`,
    );
  }

  const properties: Record<string, typeof WRITING_THEME_VALUE_JSON_SCHEMA> = {};
  for (const themeKey of themeKeys) properties[themeKey] = WRITING_THEME_VALUE_JSON_SCHEMA;

  return {
    type: 'object',
    properties: {
      themes: {
        type: 'object',
        properties,
        required: [...themeKeys],
        additionalProperties: false,
      },
      executiveSummary: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['themes', 'executiveSummary', 'notes'],
    additionalProperties: false,
  };
}
