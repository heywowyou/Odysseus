import { describe, expect, it } from 'vitest';
import {
  applyPreparationPatch,
  emptyReportPreparation,
  parseReportPreparationPatch,
} from './preparation.js';

describe('parseReportPreparationPatch', () => {
  it('trims entered text and keeps both languages independently', () => {
    const patch = parseReportPreparationPatch({
      customCoverQuestion: { fr: '  Question  ', en: null },
    });
    expect(patch.customCoverQuestion).toEqual({ fr: 'Question', en: null });
  });

  it('rejects oversized text instead of clamping it', () => {
    const long = 'a'.repeat(201);
    expect(() => parseReportPreparationPatch({ customCoverQuestion: { fr: long } })).toThrow();
  });

  it('rejects unknown keys, retired inputs, and workflow metadata in the operator patch', () => {
    expect(() =>
      parseReportPreparationPatch({ warningAcknowledgement: { digest: 'x' } }),
    ).toThrow();
    expect(() => parseReportPreparationPatch({ writingSelection: {} })).toThrow();
    expect(() => parseReportPreparationPatch({ context: { situation: 'unknown' } })).toThrow();
    expect(() => parseReportPreparationPatch({ stakeholders: { legal: 'X' } })).toThrow();
    expect(() => parseReportPreparationPatch({ turnover: { useReplacement: true } })).toThrow();
  });

  it('accepts an empty patch', () => {
    expect(parseReportPreparationPatch({})).toEqual({});
  });
});

describe('applyPreparationPatch', () => {
  const now = '2026-09-01T12:00:00.000Z';

  it('treats absent keys as unchanged and null as clear', () => {
    const current = {
      ...emptyReportPreparation(),
      customCoverQuestion: { fr: 'Fr question', en: 'En question' },
    };
    const unchanged = applyPreparationPatch(current, parseReportPreparationPatch({}), now);
    expect(unchanged.customCoverQuestion).toEqual(current.customCoverQuestion);

    const next = applyPreparationPatch(
      current,
      parseReportPreparationPatch({ customCoverQuestion: { en: null } }),
      now,
    );
    expect(next.customCoverQuestion).toEqual({ fr: 'Fr question' });

    const cleared = applyPreparationPatch(
      current,
      parseReportPreparationPatch({ customCoverQuestion: null }),
      now,
    );
    expect(cleared.customCoverQuestion).toBeUndefined();
  });

  it('drops retired inputs still present on a stored legacy preparation', () => {
    const legacy = {
      ...emptyReportPreparation(),
      context: { situation: 'periodic-review' },
      stakeholders: { management: 'Jeanne' },
    };
    const next = applyPreparationPatch(legacy, parseReportPreparationPatch({}), now);
    expect(Object.keys(next).sort()).toEqual(['updatedAt']);
  });

  it('passes workflow metadata through untouched', () => {
    const current = {
      ...emptyReportPreparation(),
      warningAcknowledgement: { digest: 'sha256:abc', acknowledgedAt: now },
      writingSelection: {
        selected: {
          frAnalysisId: 'fr-1',
          enAnalysisId: 'en-1',
          findingsProvenance: {
            findingsSchemaVersion: 1 as const,
            normalizationFingerprint: 'fp',
            findingsDigest: 'sha256:d',
          },
        },
      },
    };
    const next = applyPreparationPatch(
      current,
      parseReportPreparationPatch({ customCoverQuestion: { fr: 'Question' } }),
      now,
    );
    expect(next.warningAcknowledgement).toEqual(current.warningAcknowledgement);
    expect(next.writingSelection).toEqual(current.writingSelection);
    expect(next.updatedAt).toBe(now);
  });
});
