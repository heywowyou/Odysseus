/**
 * Manual-input-layer milestone, rule 5: every manual field absent must
 * produce a report identical to today's (domain-as-name fallback), and
 * every field present must actually render.
 */
import { describe, expect, it } from 'vitest';
import { renderCover } from './cover.js';
import { fr } from '../strings/fr.js';
import { loadSmallSiteAnalysis, loadSmallSiteManifest } from '../../test-fixtures.js';

describe('renderCover with AuditManualFields', () => {
  it('falls back to the site URL headline and omits the "Préparé pour" line when manualFields is absent', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis);
    expect(html).toContain('Rapport d&#39;audit');
    expect(html).not.toContain(fr.cover.recipientLabel);
  });

  it('renders nomCommercial as the headline and raisonSociale when supplied', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis, [], {
      nomCommercial: { value: 'Acme SAS', provenance: 'operator' },
      raisonSociale: { value: 'Acme Société par Actions Simplifiée', provenance: 'operator' },
      updatedAt: new Date(),
    });
    expect(html).toContain('Acme SAS');
    expect(html).toContain('Acme Société par Actions Simplifiée');
  });

  // item 3.9: the cover used to print the client's name three times (H1,
  // "Dénomination sociale", "Préparé pour") - recipientName is now never
  // rendered, even when supplied, since all three legitimately held the
  // same company name with no distinct contact-person field to repurpose
  // it as.
  it('item 3.9: never renders "Préparé pour", even when recipientName is supplied', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis, [], {
      nomCommercial: { value: 'Acme SAS', provenance: 'operator' },
      recipientName: { value: 'Jane Doe', provenance: 'operator' },
      updatedAt: new Date(),
    });
    expect(html).not.toContain(fr.cover.recipientLabel);
    expect(html).not.toContain('Jane Doe');
  });
});
