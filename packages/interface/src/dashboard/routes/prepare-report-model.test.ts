import { describe, expect, it } from 'vitest';
import {
  buildPreparationPatch,
  formValuesFromView,
  type PreparationFormValues,
} from './prepare-report-model';
import type { PreparationViewResponse } from './prepare-report-types';

function buildView(
  preparation: Partial<PreparationViewResponse['preparation']> = {},
): PreparationViewResponse {
  return {
    preparation: { updatedAt: '2026-09-01T00:00:00.000Z', ...preparation },
    preview: {
      fr: {
        language: 'fr',
        coverQuestion: { value: 'Question ?', source: 'fallback' },
        hook: { family: 'mixed', value: 'Phrase.', evidenceUnavailable: true },
      },
      en: {
        language: 'en',
        coverQuestion: { value: 'Question?', source: 'fallback' },
        hook: { family: 'mixed', value: 'Sentence.', evidenceUnavailable: true },
      },
      warnings: [],
      warningDigest: 'sha256:0',
    },
    regenerationInFlight: false,
  };
}

const empty: PreparationFormValues = { customQuestionFr: '', customQuestionEn: '' };

describe('formValuesFromView', () => {
  it('seeds the custom question per language from the stored preparation', () => {
    expect(formValuesFromView(buildView({ customCoverQuestion: { en: 'Custom?' } }))).toEqual({
      customQuestionFr: '',
      customQuestionEn: 'Custom?',
    });
  });

  it('seeds empty values when nothing was saved', () => {
    expect(formValuesFromView(buildView())).toEqual(empty);
  });
});

describe('buildPreparationPatch', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(buildPreparationPatch(empty, empty)).toEqual({});
  });

  it('sends only the changed language', () => {
    expect(buildPreparationPatch({ ...empty, customQuestionFr: 'Question ?' }, empty)).toEqual({
      customCoverQuestion: { fr: 'Question ?' },
    });
  });

  it('sends null for a question cleared back to empty', () => {
    const baseline = { customQuestionFr: 'Question ?', customQuestionEn: 'Question?' };
    expect(buildPreparationPatch({ ...baseline, customQuestionEn: '' }, baseline)).toEqual({
      customCoverQuestion: { en: null },
    });
  });
});
