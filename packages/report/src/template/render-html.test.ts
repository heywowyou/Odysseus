import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '@odysseus/core';
import { renderHtml } from './render-html.js';
import { escapeHtml } from './html-utils.js';
import { findRenderLintViolations } from './render-lint.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../test-fixtures.js';

describe('renderHtml against the real sas-fernande.fr audit', () => {
  it('composes a self-contained French document with inlined CSS and no leaked "undefined"', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<style>');
    // nocturne.css is the locked design-system stylesheet
    // (docs/report-design-system.md).
    expect(html).toContain('class="sheet"');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('http://localhost'); // no CDN/external reference
    expect(html).not.toContain('../fonts/'); // fonts must be inlined as data URIs, never a relative path
    expect(html).toContain(escapeHtml(analysis.executiveSummary.slice(0, 20)));
  });

  it('B2: passes the render-lint pass (no unfilled placeholders, no stringified undefined/null/NaN)', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const violations = findRenderLintViolations(html);

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  // B3's "no majeur in the generated HTML" acceptance check is enforced at
  // the source: severity-vocabulary-guard.test.ts asserts the writing-pass
  // guard rejects "majeur" before an analysis is ever persisted. Not
  // re-asserted here against the sas-fernande fixture, since that fixture
  // is frozen real LLM output captured before this fix and tests never
  // call the live Mistral API to regenerate it (CLAUDE.md, Testing).

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

  // Doc §3: the conformance summary's own scope note ("sans se prononcer
  // sur leur applicabilité légale précise à ce site") is unconditional
  // fixed copy, independent of whether an obligation determination was
  // reached elsewhere - only the legal-exposure hedge (rendered by the
  // exported renderLegalCitationParagraph) varies with status. The two use
  // deliberately distinct wording so they never collide in a substring
  // check. B9: methodology used to render the same paragraph a second
  // time; it now points back to legal-exposure instead, so each of the
  // legal-citation assertions below changed from 2 occurrences to 1.
  const CONFORMANCE_SCOPE_NOTE = 'sans se prononcer sur leur applicabilité légale précise';
  const LEGAL_HEDGE = "sans se prononcer sur l&#39;applicabilité d&#39;une obligation légale particulière";
  const METHODOLOGY_POINTER = 'figure dans la section';

  it('resolved: legal exposure names a specific obligation once, methodology points back to it, conformance summary still carries its own fixed scope note', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = { ...(await loadSasFernandeAnalysis('fr')), obligationAssessment: resolvedAssessment };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    const namedOccurrences = html.split('relève de l&#39;obligation suivante').length - 1;
    expect(namedOccurrences).toBe(1);
    expect(html).not.toContain(LEGAL_HEDGE);
    expect(html).toContain(METHODOLOGY_POINTER);
    expect(html.split(CONFORMANCE_SCOPE_NOTE).length - 1).toBe(1);
  });

  it('undetermined: legal exposure hedges once, methodology points back to it, conformance summary carries the same fixed scope note regardless', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = { ...(await loadSasFernandeAnalysis('fr')), obligationAssessment: undeterminedAssessment };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html.split(LEGAL_HEDGE).length - 1).toBe(1);
    expect(html).toContain(METHODOLOGY_POINTER);
    expect(html.split(CONFORMANCE_SCOPE_NOTE).length - 1).toBe(1);
    expect(html).not.toContain('relève de l&#39;obligation suivante');
  });

  it('absent assessment: treated the same as undetermined', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const { obligationAssessment: _drop, ...rest } = await loadSasFernandeAnalysis('fr');
    const analysis = rest as Awaited<ReturnType<typeof loadSasFernandeAnalysis>>;

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html.split(LEGAL_HEDGE).length - 1).toBe(1);
    expect(html).toContain(METHODOLOGY_POINTER);
    expect(html.split(CONFORMANCE_SCOPE_NOTE).length - 1).toBe(1);
  });
});

