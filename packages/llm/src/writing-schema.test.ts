import { describe, expect, it } from 'vitest';
import {
  MAX_BUSINESS_IMPACT_SENTENCES,
  MAX_RECOMMENDED_ACTIONS,
  MIN_BUSINESS_IMPACT_SENTENCES,
  MIN_RECOMMENDED_ACTIONS,
  writingThemeSchema,
} from './writing-schema.js';

function sentences(count: number): string {
  return Array.from({ length: count }, (_, i) => `Phrase numéro ${i + 1} du constat.`).join(' ');
}

function actions(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Action recommandée numéro ${i + 1}.`);
}

function theme(overrides: { businessImpact?: string; recommendedActions?: string[] }) {
  return {
    themeKey: 't1',
    title: 'Un thème',
    businessImpact: sentences(MIN_BUSINESS_IMPACT_SENTENCES),
    recommendedActions: actions(MIN_RECOMMENDED_ACTIONS),
    ...overrides,
  };
}

// plan 027 step 4: businessImpact's cap was raised from a hard 2 to a
// floored-and-ceilinged 3..5 range, so both edges of the new range need
// their own test - the old suite only ever tested the (now retired) 2-max
// boundary.
describe('plan 027: businessImpact sentence-count floor and ceiling', () => {
  it(`rejects fewer than ${MIN_BUSINESS_IMPACT_SENTENCES} sentences`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ businessImpact: sentences(MIN_BUSINESS_IMPACT_SENTENCES - 1) }),
    );
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${MIN_BUSINESS_IMPACT_SENTENCES} sentences (the floor)`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ businessImpact: sentences(MIN_BUSINESS_IMPACT_SENTENCES) }),
    );
    expect(result.success).toBe(true);
  });

  it(`accepts exactly ${MAX_BUSINESS_IMPACT_SENTENCES} sentences (the ceiling)`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ businessImpact: sentences(MAX_BUSINESS_IMPACT_SENTENCES) }),
    );
    expect(result.success).toBe(true);
  });

  it(`rejects more than ${MAX_BUSINESS_IMPACT_SENTENCES} sentences`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ businessImpact: sentences(MAX_BUSINESS_IMPACT_SENTENCES + 1) }),
    );
    expect(result.success).toBe(false);
  });
});

// plan 027 step 4: recommendedActions' cap was raised from a hard 3 to a
// floored-and-ceilinged 2..5 range.
describe('plan 027: recommendedActions count floor and ceiling', () => {
  it(`rejects fewer than ${MIN_RECOMMENDED_ACTIONS} actions`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ recommendedActions: actions(MIN_RECOMMENDED_ACTIONS - 1) }),
    );
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${MIN_RECOMMENDED_ACTIONS} actions (the floor)`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ recommendedActions: actions(MIN_RECOMMENDED_ACTIONS) }),
    );
    expect(result.success).toBe(true);
  });

  it(`accepts exactly ${MAX_RECOMMENDED_ACTIONS} actions (the ceiling)`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ recommendedActions: actions(MAX_RECOMMENDED_ACTIONS) }),
    );
    expect(result.success).toBe(true);
  });

  it(`rejects more than ${MAX_RECOMMENDED_ACTIONS} actions`, () => {
    const result = writingThemeSchema.safeParse(
      theme({ recommendedActions: actions(MAX_RECOMMENDED_ACTIONS + 1) }),
    );
    expect(result.success).toBe(false);
  });
});
