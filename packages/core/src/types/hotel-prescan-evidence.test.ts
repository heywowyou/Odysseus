import { describe, expect, it } from 'vitest';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  hotelPrescanEvidenceSchema,
  type HotelEvidenceCapturedAsset,
} from './hotel-prescan-evidence.js';

const HASH = 'a'.repeat(64);

function captured(overrides: Partial<HotelEvidenceCapturedAsset> = {}): HotelEvidenceCapturedAsset {
  return {
    state: 'captured',
    ref: `evidence/${HASH}.png`,
    sha256: HASH,
    mimeType: 'image/png',
    byteSize: 1_024,
    width: 640,
    height: 480,
    pageRole: 'booking',
    factRef: `fact_${'b'.repeat(24)}`,
    altText: { fr: 'Preuve mesurée', en: 'Measured evidence' },
    selectionReason: 'booking-form-error',
    ...overrides,
  };
}

function completeEvidence(): Record<string, unknown> {
  return {
    schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
    status: 'complete',
    renderComparison: captured({ selectionReason: 'material-render-gap' }),
    specificFailure: captured(),
    summaries: [
      summary('critical', 'booking'),
      summary('serious', 'homepage'),
      summary('moderate', 'content'),
    ],
  };
}

function summary(severity: string, pageRole: string): Record<string, unknown> {
  return {
    observation: HOTEL_EVIDENCE_OBSERVATIONS['color-contrast'],
    severity,
    wcagCriteria: ['1.4.3'],
    pageRole,
  };
}

describe('hotelPrescanEvidenceSchema', () => {
  it('accepts exactly two bounded content-addressed assets and three summaries', () => {
    expect(hotelPrescanEvidenceSchema.parse(completeEvidence()).status).toBe('complete');
  });

  it.each([
    ['absolute ref', { ref: `/tmp/evidence/${HASH}.png` }],
    ['traversal ref', { ref: `evidence/../${HASH}.png` }],
    ['bad hash', { sha256: 'bad' }],
    ['mismatched hash', { sha256: 'c'.repeat(64) }],
    ['oversized bytes', { byteSize: 1024 * 1024 + 1 }],
    ['oversized comparison width', { width: 1201 }],
  ])('rejects a captured asset with %s', (_label, override) => {
    const input = completeEvidence();
    input.renderComparison = captured(override);
    expect(() => hotelPrescanEvidenceSchema.parse(input)).toThrow();
  });

  it('rejects extra assets and prohibited technical public fields', () => {
    const extraAsset = { ...completeEvidence(), genericScreenshot: captured() };
    expect(() => hotelPrescanEvidenceSchema.parse(extraAsset)).toThrow();

    for (const field of ['selector', 'pageUrl', 'ruleId', 'findingId']) {
      const input = completeEvidence();
      const summaries = input.summaries as Array<Record<string, unknown>>;
      summaries[0] = { ...summaries[0], [field]: 'private' };
      expect(() => hotelPrescanEvidenceSchema.parse(input)).toThrow();
    }
  });

  it('rejects scanner prose outside the fixed bilingual observation allowlist', () => {
    const input = completeEvidence();
    const summaries = input.summaries as Array<Record<string, unknown>>;
    summaries[0] = {
      ...summaries[0],
      observation: { fr: 'Texte arbitraire', en: 'Arbitrary scanner prose' },
    };
    expect(() => hotelPrescanEvidenceSchema.parse(input)).toThrow('fixed bilingual allowlist');
  });

  // Version 2. The render composite is a bonus asset, so a server-rendered
  // hotel with a measured failure is complete without one; the crop is not,
  // because it is the whole proof.
  it('accepts a complete record whose render composite was omitted', () => {
    const withoutComposite = completeEvidence();
    withoutComposite.renderComparison = { state: 'omitted', reason: 'no-material-render-gap' };
    expect(hotelPrescanEvidenceSchema.parse(withoutComposite).status).toBe('complete');
  });

  it('refuses to call that same record incomplete', () => {
    const mislabelled = completeEvidence();
    mislabelled.renderComparison = { state: 'omitted', reason: 'no-material-render-gap' };
    mislabelled.status = 'incomplete';
    expect(() => hotelPrescanEvidenceSchema.parse(mislabelled)).toThrow();
  });

  it('requires the measured failure and three to five summaries for complete status', () => {
    const missing = completeEvidence();
    missing.specificFailure = { state: 'omitted', reason: 'target-unresolved' };
    expect(() => hotelPrescanEvidenceSchema.parse(missing)).toThrow();

    const tooFew = completeEvidence();
    tooFew.summaries = [summary('serious', 'booking'), summary('moderate', 'homepage')];
    expect(() => hotelPrescanEvidenceSchema.parse(tooFew)).toThrow();

    const tooMany = completeEvidence();
    tooMany.summaries = Array.from({ length: 6 }, () => summary('minor', 'content'));
    expect(() => hotelPrescanEvidenceSchema.parse(tooMany)).toThrow();
  });
});
