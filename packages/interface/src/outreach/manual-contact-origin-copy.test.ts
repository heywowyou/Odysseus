import { describe, expect, it } from 'vitest';
import { assembleOutreachDraft, type OutreachDataOrigin } from './assemble-outreach-draft.js';

function draft(origin: OutreachDataOrigin, language: 'fr' | 'en') {
  return assembleOutreachDraft({
    touch: 1,
    language,
    hotelName: 'Hôtel Exemple',
    variantSeed: 'candidate-origin-test',
    scanSummary: {
      distinctFindingCount: 12,
      affectedPageCount: 6,
      severityTotals: { critical: 2, serious: 4, moderate: 4, minor: 2 },
      proofCardCategories: ['accessibility', 'seo', 'performance'],
    },
    previewUrl: 'https://www.odysseusaudit.com/apercu/token',
    dataOrigins: ['public-hotel-catalogue', 'public-website', origin],
    privacyUrl: 'https://www.odysseusaudit.com/confidentialite-prospection',
    optOutUrl: 'https://www.odysseusaudit.com/desinscription',
  });
}

describe('manual contact origin disclosures', () => {
  it('uses the approved directory or booking-platform wording in both languages', () => {
    const fr = draft('other-public-source', 'fr');
    const en = draft('other-public-source', 'en');

    expect(fr.assembled).toBe(true);
    expect(en.assembled).toBe(true);
    if (!fr.assembled || !en.assembled) return;

    expect(fr.body).toContain(
      'un annuaire professionnel ou une plateforme de réservation en ligne',
    );
    expect(en.body).toContain('a professional directory or an online booking platform');
  });

  it('uses the approved direct-origin wording without calling it a public source', () => {
    const fr = draft('provided-directly', 'fr');
    const en = draft('provided-directly', 'en');

    expect(fr.assembled).toBe(true);
    expect(en.assembled).toBe(true);
    if (!fr.assembled || !en.assembled) return;

    expect(fr.body).toContain('les coordonnées que vous nous avez communiquées');
    expect(en.body).toContain('the contact details you provided to us');
    expect(fr.body).not.toContain('source publique');
    expect(en.body).not.toContain('public source');
  });
});
