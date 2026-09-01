import { describe, expect, it } from 'vitest';
import {
  applyPreparationPatch,
  emptyReportPreparation,
  parseReportPreparationPatch,
  pruneStaleAcknowledgement,
} from './preparation.js';

describe('parseReportPreparationPatch', () => {
  it('trims entered text and keeps both languages independently', () => {
    const patch = parseReportPreparationPatch({
      customCoverQuestion: { fr: '  Question  ', en: null },
      context: { trigger: 'other', triggerOther: { fr: ' Note fr ', en: ' Note en ' } },
      stakeholders: { management: ' Jeanne Dupont ' },
      journeyDecisions: [{ journeyId: 'discovery-navigation', decision: 'confirmed' }],
    });
    expect(patch.customCoverQuestion).toEqual({ fr: 'Question', en: null });
    expect(patch.context?.triggerOther).toEqual({ fr: 'Note fr', en: 'Note en' });
    expect(patch.stakeholders?.management).toBe('Jeanne Dupont');
  });

  it('rejects vocabulary values outside the closed sets', () => {
    expect(() => parseReportPreparationPatch({ context: { situation: 'winging-it' } })).toThrow();
    expect(() => parseReportPreparationPatch({ context: { trigger: 'curiosity' } })).toThrow();
    expect(() =>
      parseReportPreparationPatch({
        journeyDecisions: [{ journeyId: 'power-washing', decision: 'confirmed' }],
      }),
    ).toThrow();
  });

  it('rejects oversized text instead of clamping it', () => {
    const long = 'a'.repeat(201);
    expect(() => parseReportPreparationPatch({ customCoverQuestion: { fr: long } })).toThrow();
    const longName = 'a'.repeat(81);
    expect(() => parseReportPreparationPatch({ stakeholders: { legal: longName } })).toThrow();
  });

  it('rejects unknown keys and workflow metadata in the operator patch', () => {
    expect(() =>
      parseReportPreparationPatch({ warningAcknowledgement: { digest: 'x' } }),
    ).toThrow();
    expect(() => parseReportPreparationPatch({ writingSelection: {} })).toThrow();
    expect(() => parseReportPreparationPatch({ stakeholders: { president: 'X' } })).toThrow();
  });

  it('accepts an empty patch', () => {
    expect(parseReportPreparationPatch({})).toEqual({});
  });

  it('accepts bounded exact and range turnover replacements', () => {
    expect(
      parseReportPreparationPatch({
        turnover: {
          useReplacement: true,
          replacement: {
            kind: 'range',
            lowerEur: 400_000,
            upperEur: 650_000,
            year: 2025,
            source: 'official-annual-accounts',
          },
        },
      }).turnover,
    ).toEqual({
      useReplacement: true,
      replacement: {
        kind: 'range',
        lowerEur: 400_000,
        upperEur: 650_000,
        year: 2025,
        source: 'official-annual-accounts',
      },
    });
  });

  it('rejects invalid turnover amounts, ranges, years, sources, and detected input', () => {
    const invalidTurnover = [
      { replacement: { kind: 'exact', amountEur: -1, year: 2025, source: 'client-stated' } },
      { replacement: { kind: 'exact', amountEur: 1.5, year: 2025, source: 'client-stated' } },
      {
        replacement: {
          kind: 'range',
          lowerEur: 700_000,
          upperEur: 600_000,
          year: 2025,
          source: 'client-stated',
        },
      },
      { replacement: { kind: 'exact', amountEur: 1, year: 1999, source: 'client-stated' } },
      { replacement: { kind: 'exact', amountEur: 1, year: 2027, source: 'client-stated' } },
      { replacement: { kind: 'exact', amountEur: 1, year: 2025, source: 'spreadsheet' } },
      { detected: { amountEur: 1, year: 2025, source: 'sirene-api' } },
    ];
    for (const turnover of invalidTurnover) {
      expect(() => parseReportPreparationPatch({ turnover })).toThrow();
    }
  });
});

describe('applyPreparationPatch', () => {
  const now = '2026-09-01T12:00:00.000Z';

  it('treats absent keys as unchanged and null as clear', () => {
    const current = {
      ...emptyReportPreparation(),
      context: { situation: 'corrections-underway' as const },
      customCoverQuestion: { fr: 'Fr question', en: 'En question' },
      stakeholders: { management: 'Jeanne' },
    };
    const next = applyPreparationPatch(
      current,
      parseReportPreparationPatch({ customCoverQuestion: { en: null } }),
      now,
    );
    expect(next.context.situation).toBe('corrections-underway');
    expect(next.customCoverQuestion).toEqual({ fr: 'Fr question' });
    expect(next.stakeholders.management).toBe('Jeanne');
  });

  it('merges journey decisions, later decisions winning', () => {
    const current = {
      ...emptyReportPreparation(),
      journeyDecisions: [
        { journeyId: 'discovery-navigation' as const, decision: 'confirmed' as const },
      ],
    };
    const next = applyPreparationPatch(
      current,
      parseReportPreparationPatch({
        journeyDecisions: [
          { journeyId: 'discovery-navigation', decision: 'removed' },
          { journeyId: 'transaction-booking', decision: 'confirmed' },
        ],
      }),
      now,
    );
    expect(next.journeyDecisions).toEqual([
      { journeyId: 'discovery-navigation', decision: 'removed' },
      { journeyId: 'transaction-booking', decision: 'confirmed' },
    ]);
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
      parseReportPreparationPatch({ context: { situation: 'periodic-review' } }),
      now,
    );
    expect(next.warningAcknowledgement).toEqual(current.warningAcknowledgement);
    expect(next.writingSelection).toEqual(current.writingSelection);
    expect(next.updatedAt).toBe(now);
  });

  it('updates operator turnover choices without dropping detected provenance', () => {
    const current = {
      ...emptyReportPreparation(),
      turnover: {
        detected: { amountEur: 800_000, year: 2025, source: 'sirene-api' as const },
        useReplacement: false,
      },
    };
    const next = applyPreparationPatch(
      current,
      parseReportPreparationPatch({
        turnover: {
          useReplacement: true,
          replacement: {
            kind: 'exact',
            amountEur: 600_000,
            year: 2024,
            source: 'client-stated',
          },
        },
      }),
      now,
    );
    expect(next.turnover.detected).toEqual(current.turnover.detected);
    expect(next.turnover.useReplacement).toBe(true);
    expect(next.turnover.replacement).toMatchObject({ amountEur: 600_000 });
  });
});

describe('pruneStaleAcknowledgement', () => {
  const base = {
    ...emptyReportPreparation(),
    warningAcknowledgement: { digest: 'sha256:old', acknowledgedAt: '2026-09-01T00:00:00.000Z' },
  };

  it('drops the acknowledgement when the digest no longer matches', () => {
    const pruned = pruneStaleAcknowledgement(base, 'sha256:new');
    expect(pruned.warningAcknowledgement).toBeUndefined();
  });

  it('keeps the acknowledgement while the digest still matches', () => {
    const kept = pruneStaleAcknowledgement(base, 'sha256:old');
    expect(kept.warningAcknowledgement).toEqual(base.warningAcknowledgement);
  });

  it('keeps a preparation that never had an acknowledgement', () => {
    const plain = emptyReportPreparation();
    expect(pruneStaleAcknowledgement(plain, 'sha256:new')).toEqual(plain);
  });
});
