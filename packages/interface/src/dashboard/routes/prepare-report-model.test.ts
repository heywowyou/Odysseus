import { describe, expect, it } from 'vitest';
import {
  buildPreparationPatch,
  exclusionLabel,
  formValuesFromView,
  resolveTurnoverFormPreview,
  showsTriggerOtherNotes,
  type PreparationFormValues,
} from './prepare-report-model';
import type { PreparationViewResponse } from './prepare-report-types';

function buildView(overrides: Partial<PreparationViewResponse> = {}): PreparationViewResponse {
  return {
    preparation: {
      context: {},
      stakeholders: {},
      journeyDecisions: [],
      turnover: { useReplacement: false },
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
    turnoverUseReplacement: false,
    turnoverKind: 'exact',
    turnoverAmountEur: '',
    turnoverLowerEur: '',
    turnoverUpperEur: '',
    turnoverYear: '',
    turnoverSource: '',
    turnoverSourceNote: '',
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
        turnover: { useReplacement: false },
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

  it('keeps detected turnover distinct while seeding an exact replacement', () => {
    const view = buildView({
      preparation: {
        context: {},
        stakeholders: {},
        journeyDecisions: [],
        turnover: {
          detected: { amountEur: 8_400_000, year: 2025, source: 'sirene-api' },
          replacement: {
            kind: 'exact',
            amountEur: 7_200_000,
            year: 2024,
            source: 'official-annual-accounts',
          },
          useReplacement: true,
        },
        updatedAt: '2026-09-01T00:00:00.000Z',
      } as PreparationViewResponse['preparation'],
    });

    const values = formValuesFromView(view);
    expect(values).toMatchObject({
      turnoverUseReplacement: true,
      turnoverKind: 'exact',
      turnoverAmountEur: '7200000',
      turnoverLowerEur: '',
      turnoverUpperEur: '',
      turnoverYear: '2024',
      turnoverSource: 'official-annual-accounts',
      turnoverSourceNote: '',
    });

    const changed = {
      ...values,
      turnoverAmountEur: '7300000',
    } as PreparationFormValues;
    expect(buildPreparationPatch(changed, values)).toEqual({
      turnover: {
        replacement: {
          kind: 'exact',
          amountEur: 7_300_000,
          year: 2024,
          source: 'official-annual-accounts',
        },
      },
    });
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

  it('sends a documented turnover range without collapsing its bounds', () => {
    const baseline = emptyValues();
    const values: PreparationFormValues = {
      ...baseline,
      turnoverUseReplacement: true,
      turnoverKind: 'range',
      turnoverLowerEur: '6500000',
      turnoverUpperEur: '7000000',
      turnoverYear: '2023',
      turnoverSource: 'other-documented',
      turnoverSourceNote: 'Board-approved accounts',
    };

    expect(buildPreparationPatch(values, baseline)).toEqual({
      turnover: {
        useReplacement: true,
        replacement: {
          kind: 'range',
          lowerEur: 6_500_000,
          upperEur: 7_000_000,
          year: 2023,
          source: 'other-documented',
          sourceNote: 'Board-approved accounts',
        },
      },
    });
  });

  it('explicitly clears a saved replacement when its edited value becomes incomplete', () => {
    const baseline: PreparationFormValues = {
      ...emptyValues(),
      turnoverUseReplacement: true,
      turnoverAmountEur: '7200000',
      turnoverYear: '2024',
      turnoverSource: 'official-annual-accounts',
    };
    const values: PreparationFormValues = { ...baseline, turnoverAmountEur: '' };

    expect(buildPreparationPatch(values, baseline)).toEqual({
      turnover: { replacement: null },
    });
  });
});

describe('resolveTurnoverFormPreview', () => {
  it('shows the selected range lower bound and a typed missing-replacement state', () => {
    const range: PreparationFormValues = {
      ...emptyValues(),
      turnoverUseReplacement: true,
      turnoverKind: 'range',
      turnoverLowerEur: '6500000',
      turnoverUpperEur: '7000000',
      turnoverYear: '2023',
      turnoverSource: 'client-stated',
    };
    expect(
      resolveTurnoverFormPreview(range, {
        amountEur: 8_400_000,
        year: 2025,
        source: 'sirene-api',
      }),
    ).toEqual({
      status: 'available',
      amountEur: 6_500_000,
      rangeUpperEur: 7_000_000,
      year: 2023,
      provenance: 'replacement',
      inputKind: 'range',
    });

    expect(
      resolveTurnoverFormPreview(
        { ...emptyValues(), turnoverUseReplacement: true },
        { amountEur: 8_400_000, year: 2025, source: 'sirene-api' },
      ),
    ).toEqual({ status: 'omitted', reason: 'missing-replacement' });
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
