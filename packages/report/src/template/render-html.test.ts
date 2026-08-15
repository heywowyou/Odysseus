import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '@odysseus/core';
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

describe('renderHtml, section 3 and section 9 never disagree on whether a determination was reached', () => {
  const resolvedAssessment: ObligationAssessment = {
    status: 'in_scope',
    basis: [
      {
        regimeId: 'eaa-loi-2023-171',
        facts: [
          { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
          { kind: 'transactional-flow', evidence: [] },
        ],
      },
    ],
  };

  const undeterminedAssessment: ObligationAssessment = {
    status: 'undetermined',
    basis: [{ regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'siren-missing' }] }],
  };

  it('resolved: section 9 names a specific obligation and section 3 does not hedge', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = { ...(await loadSasFernandeAnalysis('fr')), obligationAssessment: resolvedAssessment };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html).toContain('relève de l&#39;obligation suivante');
    expect(html).not.toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('undetermined: section 3 hedges and section 9 gives no specific determination', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = { ...(await loadSasFernandeAnalysis('fr')), obligationAssessment: undeterminedAssessment };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    const hedgeOccurrences = html.split("sans se prononcer sur l&#39;applicabilité").length - 1;
    expect(hedgeOccurrences).toBe(2);
    expect(html).not.toContain('relève de l&#39;obligation suivante');
  });

  it('absent assessment: treated the same as undetermined in both sections', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const { obligationAssessment: _drop, ...rest } = await loadSasFernandeAnalysis('fr');
    const analysis = rest as Awaited<ReturnType<typeof loadSasFernandeAnalysis>>;

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    const hedgeOccurrences = html.split("sans se prononcer sur l&#39;applicabilité").length - 1;
    expect(hedgeOccurrences).toBe(2);
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
    // Aggregate WCAG conformance table (2026-08-10 commercial-planning
    // addendum): included at screening tier too, since it's a
    // criterion/count rollup, not selector-level detail.
    expect(html).toContain('Accessibility conformance');
    // Section numbering must not skip from 4 straight to 9 in a
    // 5-section report (2026-08-10 fix, methodology.ts).
    expect(html).toContain('5 · Methodology and limitations');
    expect(html).not.toContain('9 · Methodology and limitations');
    expect(html).not.toContain('Appendix: full findings list');
    expect(html).not.toContain('Ranked priorities');
    expect(html).not.toContain('Render evidence');
    expect(html).not.toContain('undefined');
  });
});
