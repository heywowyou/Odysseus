/**
 * B7 regression: the cover risk badge must never read as a legal
 * conclusion, and an 'undetermined' obligation status must always carry
 * a resolving action rather than leaving the client with nothing to do.
 */
import { describe, expect, it } from 'vitest';
import { renderCover } from './cover.js';
import { renderLegalExposure } from './legal-exposure.js';
import { fr } from '../strings/fr.js';
import { en } from '../strings/en.js';
import { loadSasFernandeAnalysis, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('B7: cover badge never contradicts an undetermined obligation status', () => {
  it('the fr cover badge label contains no legal-risk wording', () => {
    expect(fr.cover.riskSmallLabel.toLowerCase()).not.toContain('risque');
  });

  it('the en cover badge label contains no legal-risk wording', () => {
    expect(en.cover.riskSmallLabel.toLowerCase()).not.toContain('risk');
  });

  it('renders the same risk value/colour regardless of the relabel', async () => {
    const manifest = await loadSasFernandeManifest();
    const analysis = await loadSasFernandeAnalysis('fr');
    const html = renderCover(fr, manifest, { ...analysis, overallRisk: 'high' });
    expect(html).toContain(fr.cover.riskLevels.high);
  });

  it('renders the undetermined action note when status is undetermined', () => {
    const html = renderLegalExposure(fr, 'fr', { status: 'undetermined', basis: [] });
    expect(html).toContain('publié sur le site ou communiqué');
  });

  it('does not render the action note for a determined status', () => {
    const html = renderLegalExposure(fr, 'fr', { status: 'out_of_scope', basis: [] });
    expect(html).not.toContain(fr.legalExposure.undeterminedActionNote);
  });

  it('renders the action note when obligationAssessment is absent entirely', () => {
    const html = renderLegalExposure(fr, 'fr', undefined);
    expect(html).toContain('publié sur le site ou communiqué');
  });
});
