import { describe, expect, it } from 'vitest';
import { renderHtml } from './render-html.js';
import { escapeHtml } from './html-utils.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  buildStubBrowser,
  loadSasFernandeAnalysis,
  loadSasFernandeFindings,
  loadSasFernandeManifest,
  SAS_FERNANDE_AUDIT_DIR,
} from '../test-fixtures.js';

describe('renderHtml against the real sas-fernande.fr audit', () => {
  it('composes a self-contained French document with inlined CSS and no leaked "undefined"', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');
    const renderDiffEvidencePages = await resolveRenderDiffEvidence(
      manifest,
      SAS_FERNANDE_AUDIT_DIR,
      findings,
      buildStubBrowser(),
    );

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<style>');
    // report.css is the hand-maintained stylesheet ported from the
    // verified prototype (docs/report-v2-refactor.md 3.0).
    expect(html).toContain('.keep');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('http://localhost'); // no CDN/external reference
    expect(html).toContain(escapeHtml(analysis.executiveSummary.slice(0, 20)));
  });

  it('composes the English document with the English chrome strings, not French', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('en');

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('What to take away');
    expect(html).not.toContain('Résumé');
  });

  it('defaults to the full tier when tier is omitted, unchanged from before the tier split', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('en');

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html).toContain('Full audit report');
    // Full-only sections still render.
    expect(html).toContain('Appendix: full findings list');
  });
});

describe('renderHtml, screening tier', () => {
  it('omits full-audit-only sections and labels the cover as a screening report', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('en');

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [], tier: 'screening' });

    expect(html).toContain('Screening report');
    expect(html).toContain('Key findings');
    expect(html).not.toContain('Appendix: full findings list');
    expect(html).not.toContain('Ranked priorities');
    expect(html).not.toContain('Render evidence');
    expect(html).not.toContain('undefined');
  });
});
