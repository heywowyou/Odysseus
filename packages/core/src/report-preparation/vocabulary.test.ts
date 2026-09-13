import { describe, expect, it } from 'vitest';
import {
  HOOK_FAMILIES,
  HOOK_FAMILY_COPY,
  JOURNEY_COPY,
  JOURNEY_IDS,
  JOURNEY_STEP_STATE_COPY,
  JOURNEY_STEP_STATES,
  REPORT_SITUATIONS,
  REPORT_STAKEHOLDER_ROLES,
  REPORT_TRIGGERS,
  SITUATION_COPY,
  TRIGGER_COPY,
  STAKEHOLDER_ROLE_COPY,
  resolveGenericDecisionQuestion,
} from './vocabulary.js';

describe('preparation copy tables', () => {
  it('gives every situation French and English copy', () => {
    for (const situation of REPORT_SITUATIONS) {
      expect(SITUATION_COPY[situation].fr, situation).toBeTruthy();
      expect(SITUATION_COPY[situation].en, situation).toBeTruthy();
    }
  });

  it('gives every trigger French and English copy', () => {
    for (const trigger of REPORT_TRIGGERS) {
      expect(TRIGGER_COPY[trigger].fr, trigger).toBeTruthy();
      expect(TRIGGER_COPY[trigger].en, trigger).toBeTruthy();
    }
  });

  it('gives every stakeholder role French and English copy', () => {
    for (const role of REPORT_STAKEHOLDER_ROLES) {
      expect(STAKEHOLDER_ROLE_COPY[role].fr, role).toBeTruthy();
      expect(STAKEHOLDER_ROLE_COPY[role].en, role).toBeTruthy();
    }
  });

  it('gives every hook family French and English copy', () => {
    for (const family of HOOK_FAMILIES) {
      expect(HOOK_FAMILY_COPY[family].fr, family).toBeTruthy();
      expect(HOOK_FAMILY_COPY[family].en, family).toBeTruthy();
    }
  });

  it('gives every journey, and every step of it, French and English copy', () => {
    for (const journeyId of JOURNEY_IDS) {
      const journey = JOURNEY_COPY[journeyId];
      expect(journey.label.fr, journeyId).toBeTruthy();
      expect(journey.label.en, journeyId).toBeTruthy();
      expect(journey.description.fr, journeyId).toBeTruthy();
      expect(journey.description.en, journeyId).toBeTruthy();
      expect(journey.steps.length, journeyId).toBeGreaterThan(0);
      for (const step of journey.steps) {
        expect(step.label.fr, `${journeyId}/${step.stepId}`).toBeTruthy();
        expect(step.label.en, `${journeyId}/${step.stepId}`).toBeTruthy();
        expect(step.description.fr, `${journeyId}/${step.stepId}`).toBeTruthy();
        expect(step.description.en, `${journeyId}/${step.stepId}`).toBeTruthy();
      }
    }
  });

  it('gives each of the three step states French and English copy', () => {
    for (const state of JOURNEY_STEP_STATES) {
      expect(JOURNEY_STEP_STATE_COPY[state].fr, state).toBeTruthy();
      expect(JOURNEY_STEP_STATE_COPY[state].en, state).toBeTruthy();
    }
  });

  it('keeps one canonical decision-oriented French fallback question', () => {
    expect(resolveGenericDecisionQuestion('fr')).toBe(
      'Quels points de votre site faut-il corriger en priorité pour améliorer son accessibilité, sa visibilité et son utilisation ?',
    );
    expect(resolveGenericDecisionQuestion('en')).toBe(
      'What is the current state of your site, and where should you start?',
    );
  });

  it('keeps product copy free of em and en dashes', () => {
    const allStrings: string[] = [
      ...REPORT_SITUATIONS.flatMap((value) => Object.values(SITUATION_COPY[value])),
      ...REPORT_TRIGGERS.flatMap((value) => Object.values(TRIGGER_COPY[value])),
      ...REPORT_STAKEHOLDER_ROLES.flatMap((value) => Object.values(STAKEHOLDER_ROLE_COPY[value])),
      ...HOOK_FAMILIES.flatMap((value) => Object.values(HOOK_FAMILY_COPY[value])),
      ...JOURNEY_IDS.flatMap((journeyId) => [
        ...Object.values(JOURNEY_COPY[journeyId].label),
        ...Object.values(JOURNEY_COPY[journeyId].description),
        ...JOURNEY_COPY[journeyId].steps.flatMap((step) => [
          ...Object.values(step.label),
          ...Object.values(step.description),
        ]),
      ]),
      ...JOURNEY_STEP_STATES.flatMap((value) => Object.values(JOURNEY_STEP_STATE_COPY[value])),
    ];
    for (const value of allStrings) {
      expect(value.includes('\u2014') || value.includes('\u2013'), value).toBe(false);
    }
  });
});
