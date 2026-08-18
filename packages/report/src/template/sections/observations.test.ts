import { describe, expect, it } from 'vitest';
import { partitionFindings } from '@odysseus/llm';
import { renderObservations } from './observations.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderObservations against the real sas-fernande.fr scan', () => {
  it('renders the legal-page box for f009 (link-in-text-block, confined to /mentions-legales/), with no wrapper box', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const { diverted } = partitionFindings(findings, manifest);

    const html = renderObservations(getStrings('fr'), 6, diverted);

    expect(html).toContain('Pages légales exclues de l&#39;indexation');
    // All 5 findings confined entirely to /mentions-legales/.
    expect(html).toContain('f009, f012, f027, f042, f060');
    // sas-fernande has no wrapper pages (render diff 0% everywhere).
    expect(html).not.toContain('Pages d&#39;intégration');
  });

  it('returns empty when nothing is diverted', () => {
    const html = renderObservations(getStrings('fr'), 6, []);

    expect(html).toBe('');
  });
});
