import { describe, expect, it } from 'vitest';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelEvidenceAsset,
  type HotelEvidenceCapturedAsset,
  type HotelEvidencePublicSummary,
  type HotelEvidenceSelectionReason,
  type HotelPrescanEvidence,
} from '../types/hotel-prescan-evidence.js';
import type { HotelPrescanPageRole } from '../types/hotel-prescan.js';
import {
  OUTREACH_EVIDENCE_SELECTION_VERSION,
  selectOutreachEvidence,
} from './outreach-evidence-selection.js';

const RENDER_HASH = 'a'.repeat(64);
const CROP_HASH = 'b'.repeat(64);

function renderAsset(
  overrides: Partial<HotelEvidenceCapturedAsset> = {},
): HotelEvidenceCapturedAsset {
  return {
    state: 'captured',
    ref: `evidence/${RENDER_HASH}.png`,
    sha256: RENDER_HASH,
    mimeType: 'image/png',
    byteSize: 4_096,
    width: 800,
    height: 600,
    pageRole: 'homepage',
    factRef: `fact_${'1'.repeat(24)}`,
    altText: { fr: 'Comparaison de rendu', en: 'Render comparison' },
    selectionReason: 'material-render-gap',
    ...overrides,
  };
}

function omittedRenderAsset(): HotelEvidenceAsset {
  return { state: 'omitted', reason: 'no-material-render-gap' };
}

function cropAsset(
  overrides: Partial<HotelEvidenceCapturedAsset> = {},
): HotelEvidenceCapturedAsset {
  return {
    state: 'captured',
    ref: `evidence/${CROP_HASH}.png`,
    sha256: CROP_HASH,
    mimeType: 'image/png',
    byteSize: 2_048,
    width: 240,
    height: 276,
    pageRole: 'booking',
    factRef: `fact_${'2'.repeat(24)}`,
    altText: { fr: 'Preuve mesurée', en: 'Measured evidence' },
    selectionReason: 'booking-form-error',
    ...overrides,
  };
}

function summary(
  observationKey: string,
  severity: HotelEvidencePublicSummary['severity'] = 'serious',
  pageRole: HotelPrescanPageRole = 'homepage',
): HotelEvidencePublicSummary {
  return {
    observation: HOTEL_EVIDENCE_OBSERVATIONS[observationKey]!,
    severity,
    wcagCriteria: ['1.1.1'],
    pageRole,
  };
}

function evidence(overrides: Partial<HotelPrescanEvidence> = {}): HotelPrescanEvidence {
  return {
    schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
    status: 'complete',
    renderComparison: omittedRenderAsset(),
    specificFailure: cropAsset(),
    summaries: [
      summary('text-missing-from-raw-html', 'serious', 'homepage'),
      summary('form-error-not-associated', 'critical', 'booking'),
      summary('color-contrast', 'minor', 'content'),
    ],
    ...overrides,
  };
}

describe('selectOutreachEvidence', () => {
  it('refuses a schema version other than the current one', () => {
    const result = selectOutreachEvidence({
      ...evidence(),
      schemaVersion: 1 as unknown as typeof HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
    });
    expect(result).toEqual({ state: 'cannot-draft', refusal: 'evidence-schema-outdated' });
  });

  it('refuses incomplete evidence', () => {
    const result = selectOutreachEvidence({
      ...evidence(),
      status: 'incomplete',
      specificFailure: omittedRenderAsset(),
      summaries: [],
    });
    expect(result).toEqual({ state: 'cannot-draft', refusal: 'evidence-incomplete' });
  });

  it('refuses when no summary observation resolves against the allowlist', () => {
    const result = selectOutreachEvidence({
      ...evidence(),
      summaries: [
        {
          observation: { fr: 'Une phrase non répertoriée.', en: 'An unlisted sentence.' },
          severity: 'serious',
          wcagCriteria: ['1.1.1'],
          pageRole: 'homepage',
        },
      ],
    });
    expect(result).toEqual({ state: 'cannot-draft', refusal: 'observation-not-in-allowlist' });
  });

  it('drops unresolvable summaries but keeps resolvable ones', () => {
    const result = selectOutreachEvidence({
      ...evidence(),
      summaries: [
        {
          observation: { fr: 'Une phrase non répertoriée.', en: 'An unlisted sentence.' },
          severity: 'critical',
          wcagCriteria: ['1.1.1'],
          pageRole: 'booking',
        },
        summary('text-missing-from-raw-html', 'serious', 'homepage'),
        summary('color-contrast', 'minor', 'content'),
      ],
    });
    expect(result.state).toBe('selected');
  });

  it('refuses when only one distinct observation is resolvable', () => {
    const result = selectOutreachEvidence({
      ...evidence(),
      summaries: [
        summary('color-contrast', 'critical', 'booking'),
        summary('color-contrast', 'serious', 'homepage'),
      ],
    });
    expect(result).toEqual({ state: 'cannot-draft', refusal: 'no-distinct-second-observation' });
  });

  it('picks the render composite for touch 1 when one is captured, preferring the missing-content observation', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: renderAsset({ pageRole: 'content' }),
        summaries: [
          summary('color-contrast', 'critical', 'booking'),
          summary('text-missing-from-raw-html', 'serious', 'homepage'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    expect(result.version).toBe(OUTREACH_EVIDENCE_SELECTION_VERSION);
    expect(result.touch1.slot).toBe('render-comparison');
    expect(result.touch1.observationKey).toBe('text-missing-from-raw-html');
    expect(result.touch1.factRef).toBe('fact_111111111111111111111111');
    expect(result.touch1.alias).toBe('e1');
    expect(result.touch2.alias).toBe('e2');
    expect(result.touch2.observationKey).not.toBe('text-missing-from-raw-html');
  });

  it('falls back to the render composite page role when no missing-content observation resolves', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: renderAsset({ pageRole: 'content' }),
        summaries: [
          summary('color-contrast', 'critical', 'booking'),
          summary('label', 'serious', 'content'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    expect(result.touch1.pageRole).toBe('content');
    expect(result.touch1.observationKey).toBe('label');
  });

  it('falls back to the highest-ranked candidate when neither the observation nor the role match', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: renderAsset({ pageRole: 'content' }),
        summaries: [
          summary('color-contrast', 'critical', 'booking'),
          summary('label', 'serious', 'homepage'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    // Highest severity first among candidates with no matching key or role.
    expect(result.touch1.observationKey).toBe('color-contrast');
  });

  it.each<[HotelEvidenceSelectionReason, string]>([
    ['booking-keyboard-trap', 'keyboard-trap'],
    ['booking-form-error', 'form-error-not-associated'],
    ['material-render-gap', 'text-missing-from-raw-html'],
  ])(
    'when no render composite exists, prefers the observation matching the crop reason %s',
    (selectionReason, expectedKey) => {
      const result = selectOutreachEvidence(
        evidence({
          renderComparison: omittedRenderAsset(),
          specificFailure: cropAsset({ selectionReason }),
          summaries: [
            summary('color-contrast', 'critical', 'booking'),
            summary(expectedKey, 'minor', 'content'),
          ],
        }),
      );
      expect(result.state).toBe('selected');
      if (result.state !== 'selected') throw new Error('unreachable');
      expect(result.touch1.slot).toBe('specific-failure');
      expect(result.touch1.observationKey).toBe(expectedKey);
      expect(result.touch1.factRef).toBe('fact_222222222222222222222222');
    },
  );

  it.each<HotelEvidenceSelectionReason>(['booking-call-to-action'])(
    'accepts either preferred key for a multi-key crop reason (%s)',
    (selectionReason) => {
      const result = selectOutreachEvidence(
        evidence({
          renderComparison: omittedRenderAsset(),
          specificFailure: cropAsset({ selectionReason }),
          summaries: [
            summary('color-contrast', 'critical', 'booking'),
            summary('button-name', 'minor', 'content'),
          ],
        }),
      );
      expect(result.state).toBe('selected');
      if (result.state !== 'selected') throw new Error('unreachable');
      expect(result.touch1.observationKey).toBe('button-name');
    },
  );

  it('falls back to the highest-ranked candidate for a generic crop reason with no preferred key', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: omittedRenderAsset(),
        specificFailure: cropAsset({ selectionReason: 'generic-element-failure' }),
        summaries: [
          summary('color-contrast', 'critical', 'booking'),
          summary('label', 'serious', 'homepage'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    expect(result.touch1.observationKey).toBe('color-contrast');
  });

  it('gives touch 2 the specific-failure slot when it matches the crop reason and touch 1 did not take it', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: renderAsset({ pageRole: 'homepage' }),
        specificFailure: cropAsset({ selectionReason: 'booking-form-error' }),
        summaries: [
          summary('text-missing-from-raw-html', 'serious', 'homepage'),
          summary('form-error-not-associated', 'critical', 'booking'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    expect(result.touch1.slot).toBe('render-comparison');
    expect(result.touch2.slot).toBe('specific-failure');
    expect(result.touch2.factRef).toBe('fact_222222222222222222222222');
  });

  it('gives touch 2 the summary slot, with no factRef, when touch 1 already took the specific-failure slot', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: omittedRenderAsset(),
        specificFailure: cropAsset({ selectionReason: 'booking-form-error' }),
        summaries: [
          summary('form-error-not-associated', 'critical', 'booking'),
          summary('color-contrast', 'serious', 'homepage'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    expect(result.touch1.slot).toBe('specific-failure');
    expect(result.touch2.slot).toBe('summary');
    expect(result.touch2.factRef).toBeUndefined();
  });

  it('gives touch 2 the summary slot when it does not match the crop reason at all', () => {
    const result = selectOutreachEvidence(
      evidence({
        renderComparison: renderAsset({ pageRole: 'homepage' }),
        specificFailure: cropAsset({ selectionReason: 'booking-form-error' }),
        summaries: [
          summary('text-missing-from-raw-html', 'serious', 'homepage'),
          summary('color-contrast', 'critical', 'booking'),
        ],
      }),
    );
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    expect(result.touch2.slot).toBe('summary');
    expect(result.touch2.factRef).toBeUndefined();
  });

  it('orders candidates by severity, then page role, then stored index, deterministically', () => {
    const built = evidence({
      renderComparison: omittedRenderAsset(),
      specificFailure: cropAsset({ selectionReason: 'generic-element-failure' }),
      summaries: [
        summary('label', 'moderate', 'content'),
        summary('color-contrast', 'moderate', 'booking'),
        summary('image-alt', 'critical', 'content'),
      ],
    });
    const result = selectOutreachEvidence(built);
    expect(result.state).toBe('selected');
    if (result.state !== 'selected') throw new Error('unreachable');
    // Critical beats moderate regardless of stored order.
    expect(result.touch1.observationKey).toBe('image-alt');
    // Between the two moderate candidates, booking outranks content.
    expect(result.touch2.observationKey).toBe('color-contrast');
  });

  it('is unaffected by shuffling summary order (same severity and role ties break on index)', () => {
    const summaries = [
      summary('color-contrast', 'serious', 'homepage'),
      summary('label', 'serious', 'homepage'),
    ];
    const forward = selectOutreachEvidence(
      evidence({ renderComparison: omittedRenderAsset(), summaries }),
    );
    const reversed = selectOutreachEvidence(
      evidence({ renderComparison: omittedRenderAsset(), summaries: [...summaries].reverse() }),
    );
    expect(forward.state).toBe('selected');
    expect(reversed.state).toBe('selected');
    if (forward.state !== 'selected' || reversed.state !== 'selected')
      throw new Error('unreachable');
    expect(forward.touch1.observationKey).toBe('color-contrast');
    expect(reversed.touch1.observationKey).toBe('label');
  });

  it('never throws over the full range of stored selection reasons', () => {
    const reasons: HotelEvidenceSelectionReason[] = [
      'material-render-gap',
      'booking-keyboard-trap',
      'booking-form-error',
      'booking-call-to-action',
      'booking-severe-element-failure',
      'generic-element-failure',
    ];
    for (const selectionReason of reasons) {
      expect(() =>
        selectOutreachEvidence(
          evidence({
            renderComparison: omittedRenderAsset(),
            specificFailure: cropAsset({ selectionReason }),
          }),
        ),
      ).not.toThrow();
    }
  });
});
