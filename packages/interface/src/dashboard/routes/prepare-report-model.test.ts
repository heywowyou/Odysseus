import { describe, expect, it } from 'vitest';
import {
  buildPreparationPatch,
  exclusionLabel,
  formValuesFromView,
  showsTriggerOtherNotes,
  warningRelevantInputsChanged,
  type PreparationFormValues,
} from './prepare-report-model';
import type { PreparationViewResponse } from './prepare-report-types';

function buildView(overrides: Partial<PreparationViewResponse> = {}): PreparationViewResponse {
  return {
    preparation: {
      context: {},
      stakeholders: {},
      journeyDecisions: [],
      updatedAt: '2026-09-01T00:00:00.000Z',
      ...overrides['preparation'],
    },
    preview: {
      fr: {
        language: 'fr',
        coverQuestion: { value: 'Question ?', source: 'fallback' },
        hook: { family: 'mixed', value: 'Phrase.', evidenceUnavailable: true },
        stakeholders: [],
        journeys: [],
      },
      en: {
        language: 'en',
        coverQuestion: { value: 'Question?', source: 'fallback' },
        hook: { family: 'mixed', value: 'Sentence.', evidenceUnavailable: true },
        stakeholders: [],
        journeys: [],
      },
      warnings: [],
      warningDigest: 'sha256:0',
      excludedJourneys: [],
      ...overrides['preview'],
    },
    suggestions: [],
    acknowledgementCurrent: false,
    regenerationInFlight: false,
    ...overrides,
  } as PreparationViewResponse;
}

function emptyValues(): PreparationFormValues {
  return {
    situation: '',
    trigger: '',
    triggerOtherFr: '',
    triggerOtherEn: '',
    customQuestionFr: '',
    customQuestionEn: '',
    stakeholderManagement: '',
    stakeholderTechnical: '',
    stakeholderCommunications: '',
    stakeholderLegal: '',
    journeyDecisions: {},
  };
}

describe('formValuesFromView', () => {
  it('seeds every form value from the stored preparation', () => {
    const view = buildView({
      preparation: {
        context: { situation: 'periodic-review', trigger: 'other', triggerOther: { fr: 'Note' } },
        customCoverQuestion: { en: 'Custom?' },
        stakeholders: { management: 'Jeanne Dupont' },
        journeyDecisions: [{ journeyId: 'discovery-navigation', decision: 'confirmed' }],
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    });
    const values = formValuesFromView(view);
    expect(values.situation).toBe('periodic-review');
    expect(values.trigger).toBe('other');
    expect(values.triggerOtherFr).toBe('Note');
    expect(values.triggerOtherEn).toBe('');
    expect(values.customQuestionEn).toBe('Custom?');
    expect(values.stakeholderManagement).toBe('Jeanne Dupont');
    expect(values.journeyDecisions).toEqual({ 'discovery-navigation': 'confirmed' });
  });
});

describe('buildPreparationPatch', () => {
  it('sends only changed keys, null to clear, and never unchanged ones', () => {
    const baseline: PreparationFormValues = {
      ...emptyValues(),
      situation: 'periodic-review',
      customQuestionFr: 'Ancienne question',
      stakeholderLegal: 'sol imsm ',
    };
    const values: PreparationFormValues = {
      ...baseline,
      situation: 'corrections-underway',
      customQuestionFr: '',
      stakeholderLegal: '',
      stakeholderManagement: '  Jeanne  ',
      customQuestionEn: 'New question',
    };
    const patch = buildPreparationPatch(values, baseline);
    expect(patch).toEqual({
      context: { situation: 'corrections-underway' },
      customCoverQuestion: { fr: null, en: 'New question' },
      stakeholders: { legal: null, management: 'Jeanne' },
    });
  });

  it('returns an empty patch when nothing changed', () => {
    const values = emptyValues();
    expect(buildPreparationPatch(values, values)).toEqual({});
  });

  it('sends journey decisions that changed from the baseline', () => {
    const baseline: PreparationFormValues = {
      ...emptyValues(),
      journeyDecisions: { 'discovery-navigation': 'removed' },
    };
    const values: PreparationFormValues = {
      ...baseline,
      journeyDecisions: {
        'discovery-navigation': 'removed',
        'transaction-booking': 'confirmed',
      },
    };
    expect(buildPreparationPatch(values, baseline)['journeyDecisions']).toEqual([
      { journeyId: 'transaction-booking', decision: 'confirmed' },
    ]);
  });
});

describe('warningRelevantInputsChanged', () => {
  const acknowledged: PreparationFormValues = {
    ...emptyValues(),
    situation: 'periodic-review',
    stakeholderManagement: 'Jeanne',
  };

  it('ignores stakeholder names entirely', () => {
    const values: PreparationFormValues = {
      ...acknowledged,
      stakeholderManagement: 'Autre nom',
      stakeholderLegal: 'Nouveau',
    };
    expect(warningRelevantInputsChanged(values, acknowledged)).toBe(false);
  });

  it('sees a warning-relevant change', () => {
    const values: PreparationFormValues = { ...acknowledged, situation: 'unknown' };
    expect(warningRelevantInputsChanged(values, acknowledged)).toBe(true);
    const journey: PreparationFormValues = {
      ...acknowledged,
      journeyDecisions: { 'discovery-navigation': 'confirmed' },
    };
    expect(warningRelevantInputsChanged(journey, acknowledged)).toBe(true);
  });
});

describe('showsTriggerOtherNotes', () => {
  it('reveals the notes fields only for the other trigger', () => {
    expect(showsTriggerOtherNotes('other')).toBe(true);
    expect(showsTriggerOtherNotes('legal-question')).toBe(false);
    expect(showsTriggerOtherNotes('')).toBe(false);
  });
});

describe('exclusionLabel', () => {
  const labels = {
    exclusionNoVisitedPages: 'no visited',
    exclusionNoTransactionalFlow: 'no flow',
    exclusionNoTransactionalPageVisited: 'not visited',
    exclusionEvidenceUnavailable: 'no evidence',
  };

  it('maps each typed reason to its label', () => {
    expect(
      exclusionLabel(
        { journeyId: 'discovery-navigation', available: false, reason: 'no-visited-pages' },
        labels,
      ),
    ).toBe('no visited');
    expect(
      exclusionLabel(
        { journeyId: 'transaction-booking', available: false, reason: 'no-transactional-flow' },
        labels,
      ),
    ).toBe('no flow');
    expect(
      exclusionLabel(
        {
          journeyId: 'transaction-booking',
          available: false,
          reason: 'no-transactional-page-visited',
        },
        labels,
      ),
    ).toBe('not visited');
    expect(
      exclusionLabel(
        { journeyId: 'discovery-navigation', available: false, reason: 'evidence-unavailable' },
        labels,
      ),
    ).toBe('no evidence');
  });

  it('gives an available suggestion no label', () => {
    expect(exclusionLabel({ journeyId: 'discovery-navigation', available: true }, labels)).toBe('');
  });
});
