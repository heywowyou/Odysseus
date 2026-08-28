import { describe, expect, it } from 'vitest';
import type { HotelEvidenceFact } from './hotel-evidence.js';
import {
  buildHotelEvidenceSummaries,
  createHotelEvidenceFactRef,
  finalizeHotelPrescanEvidence,
  rankHotelSpecificFailures,
  selectHotelRenderEvidence,
} from './hotel-evidence.js';

function fact(overrides: Partial<HotelEvidenceFact> = {}): HotelEvidenceFact {
  return {
    source: 'axe',
    ruleId: 'image-alt',
    severity: 'serious',
    wcagCriteria: ['1.1.1'],
    pageRole: 'homepage',
    pageUrl: 'https://hotel.example/',
    selector: '#hero',
    ...overrides,
  };
}

describe('hotel evidence policy', () => {
  it('ranks booking keyboard, form, call-to-action, severe, then generic failures', () => {
    const ranked = rankHotelSpecificFailures([
      fact(),
      fact({ pageRole: 'booking', ruleId: 'image-alt', pageUrl: 'https://hotel.example/book' }),
      fact({
        pageRole: 'booking',
        ruleId: 'color-contrast',
        isBookingCallToAction: true,
        pageUrl: 'https://hotel.example/book',
      }),
      fact({
        source: 'custom',
        pageRole: 'booking',
        ruleId: 'form-error-not-associated',
        pageUrl: 'https://hotel.example/book',
      }),
      fact({
        source: 'custom',
        pageRole: 'booking',
        ruleId: 'keyboard-trap',
        severity: 'critical',
        pageUrl: 'https://hotel.example/book',
      }),
    ]);
    expect(ranked.map((candidate) => candidate.selectionReason)).toEqual([
      'booking-keyboard-trap',
      'booking-form-error',
      'booking-call-to-action',
      'booking-severe-element-failure',
      'generic-element-failure',
    ]);
  });

  it('uses severity, rule id, role, and opaque fact reference for stable ties', () => {
    const input = [
      fact({ ruleId: 'label', severity: 'moderate', selector: '#b' }),
      fact({ ruleId: 'image-alt', severity: 'critical', selector: '#c' }),
      fact({ ruleId: 'image-alt', severity: 'critical', selector: '#a' }),
    ];
    const forward = rankHotelSpecificFailures(input).map((candidate) => candidate.factRef);
    const reverse = rankHotelSpecificFailures([...input].reverse()).map(
      (candidate) => candidate.factRef,
    );
    expect(reverse).toEqual(forward);
    expect(forward[0]).toBe(createHotelEvidenceFactRef(input[2]!));
  });

  it('excludes unsupported Axe rules from summaries and crops', () => {
    const unsupported = fact({ ruleId: 'new-axe-rule' });
    expect(rankHotelSpecificFailures([unsupported])).toEqual([]);
    expect(buildHotelEvidenceSummaries([unsupported])).toEqual([]);
  });

  it('selects material render gaps by booking role, then missing characters and percentage', () => {
    const selected = selectHotelRenderEvidence([
      {
        source: 'renderdiff',
        ruleId: 'text-missing-from-raw-html',
        severity: 'moderate',
        wcagCriteria: [],
        pageRole: 'homepage',
        pageUrl: 'https://hotel.example/',
        missingPercent: 90,
        rawTextLength: 10,
        renderedTextLength: 1_000,
      },
      {
        source: 'renderdiff',
        ruleId: 'text-missing-from-raw-html',
        severity: 'moderate',
        wcagCriteria: [],
        pageRole: 'booking',
        pageUrl: 'https://hotel.example/book',
        missingPercent: 20,
        rawTextLength: 100,
        renderedTextLength: 200,
      },
    ]);
    expect(selected?.pageRole).toBe('booking');
    expect(selectHotelRenderEvidence([fact({ missingPercent: 19 })])).toBeNull();
  });

  it('dedupes fixed summaries, caps them at five, and is input-order stable', () => {
    const input = [
      fact({ ruleId: 'image-alt' }),
      fact({ ruleId: 'image-alt', selector: '#second' }),
      fact({ ruleId: 'label' }),
      fact({ ruleId: 'color-contrast' }),
      fact({ ruleId: 'target-size' }),
      fact({ ruleId: 'link-name' }),
      fact({ ruleId: 'button-name' }),
    ];
    expect(buildHotelEvidenceSummaries(input)).toHaveLength(5);
    expect(buildHotelEvidenceSummaries([...input].reverse())).toEqual(
      buildHotelEvidenceSummaries(input),
    );
  });

  it('states one claim once even when the same rule fires on two page roles', () => {
    // The observation text is a function of the rule alone, so keying the
    // dedupe on the role printed the identical sentence twice and spent two of
    // five slots saying one thing. Observed on a real prescan.
    const summaries = buildHotelEvidenceSummaries([
      fact({ ruleId: 'button-name', pageRole: 'homepage' }),
      fact({ ruleId: 'button-name', pageRole: 'content', selector: '#other' }),
    ]);

    expect(summaries).toHaveLength(1);
    // The role kept is the ranked one, not whichever arrived first.
    expect(summaries[0]?.pageRole).toBe('homepage');
  });

  it('marks evidence incomplete when either asset or three summaries are missing', () => {
    const evidence = finalizeHotelPrescanEvidence({
      renderComparison: { state: 'omitted', reason: 'no-material-render-gap' },
      specificFailure: { state: 'omitted', reason: 'no-eligible-failure' },
      summaries: [],
    });
    expect(evidence.status).toBe('incomplete');
  });
});
