import { describe, expect, it } from 'vitest';
import { EAA_REGIME_ID, type AuditManifest, type ObligationAssessment } from '@odysseus/core';
import { getStrings } from '../strings/i18n.js';
import { renderLegalExposure } from './legal-exposure.js';

// A real New Caledonia hotel report cited the EAA, French consumer-code
// articles and a EUR 7,500 fine, for a territory whose regime no verified
// analysis covers (obligation-basis.md, overseas-domain boundary).
const overseas: ObligationAssessment = {
  status: 'undetermined',
  basis: [{ regimeId: EAA_REGIME_ID, facts: [{ kind: 'overseas-jurisdiction-unverified' }] }],
};

const manifest = {
  siteUrl: 'https://www.hotel.nc/',
  pages: [],
} as unknown as AuditManifest;

describe('legal exposure on a French overseas domain', () => {
  it('names no regime, deadline or fine, and says the regime is to be verified', () => {
    for (const language of ['fr', 'en'] as const) {
      const html = renderLegalExposure(
        getStrings(language),
        11,
        language,
        overseas,
        new Date('2026-09-23T00:00:00Z'),
        manifest,
        [],
      );
      expect(html).toContain('data-overseas-regime');
      expect(html).not.toMatch(/7[\s  ]?500|R451-4|D412-49|2023-171|28 juin 2025|June 28, 2025/);
    }
    const fr = renderLegalExposure(getStrings('fr'), 11, 'fr', overseas, new Date(), manifest, []);
    expect(fr).toContain('Régime applicable à vérifier');
  });
});
