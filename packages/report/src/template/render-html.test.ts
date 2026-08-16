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

  it('always renders the single-tier full document (2026-08-16: paid screening tier dropped)', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('en');

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html).toContain('Appendix: full findings list');
  });
});

describe('renderHtml, the conformance summary, legal exposure, and methodology sections never disagree on whether a determination was reached', () => {
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

  it('resolved: methodology and legal exposure both name a specific obligation, conformance summary does not hedge', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = { ...(await loadSasFernandeAnalysis('fr')), obligationAssessment: resolvedAssessment };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    // Once in the legal exposure page's own paragraph, once in
    // methodology's (both call the same exported renderLegalCitationParagraph).
    const namedOccurrences = html.split('relève de l&#39;obligation suivante').length - 1;
    expect(namedOccurrences).toBe(2);
    expect(html).not.toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('undetermined: conformance summary hedges, and neither methodology nor legal exposure gives a specific determination', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = { ...(await loadSasFernandeAnalysis('fr')), obligationAssessment: undeterminedAssessment };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    // Conformance summary's intro, methodology's paragraph, and legal
    // exposure's paragraph (which reuses the same exported function) -
    // three render sites since the 2026-08-16 redesign added the
    // dedicated legal exposure page.
    const hedgeOccurrences = html.split("sans se prononcer sur l&#39;applicabilité").length - 1;
    expect(hedgeOccurrences).toBe(3);
    expect(html).not.toContain('relève de l&#39;obligation suivante');
  });

  it('absent assessment: treated the same as undetermined across all three sections', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const { obligationAssessment: _drop, ...rest } = await loadSasFernandeAnalysis('fr');
    const analysis = rest as Awaited<ReturnType<typeof loadSasFernandeAnalysis>>;

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    const hedgeOccurrences = html.split("sans se prononcer sur l&#39;applicabilité").length - 1;
    expect(hedgeOccurrences).toBe(3);
  });
});

