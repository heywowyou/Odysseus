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

// Plan 067: one concise sentence is valid; only an empty field or prose
// above the four-sentence ceiling is rejected.
describe('Plan 067: businessImpact 1..4 sentence bounds', () => {
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

// Plan 067: one concrete action is valid; padding is never required.
describe('Plan 067: recommendedActions 1..4 bounds', () => {
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
