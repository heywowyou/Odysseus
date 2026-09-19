import { describe, expect, it } from 'vitest';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

describe('Plan 070 stored-analysis compatibility', () => {
  it('renders a legacy analysis without critic fields, and the critic record never reaches the report', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const legacy = await loadSmallSiteAnalysis('fr');
    expect(legacy).not.toHaveProperty('writingCritic');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const legacyHtml = await renderHtml({
      manifest,
      findings,
      analysis: legacy,
      renderDiffEvidencePages,
    });
    const critiquedHtml = await renderHtml({
      manifest,
      findings,
      analysis: {
        ...legacy,
        writingCritic: { ran: true, issuesRaised: 3, issuesAccepted: 2, repairApplied: true },
      },
      renderDiffEvidencePages,
    });

    expect(legacyHtml).toMatch(/^<!doctype html>/);
    expect(critiquedHtml).toBe(legacyHtml);
  });
});
