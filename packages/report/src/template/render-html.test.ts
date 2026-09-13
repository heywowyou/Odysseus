import { describe, expect, it } from 'vitest';
import {
  EAA_REGIME_ID,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  eaaSanctionFigureSentence,
  type ObligationAssessment,
} from '@odysseus/core';
import { renderHtml } from './render-html.js';
import { escapeHtml } from './html-utils.js';
import { findRenderLintViolations } from './render-lint.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

describe('renderHtml against the real small-site.test audit', () => {
  it('composes a self-contained French document with inlined CSS and no leaked "undefined"', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<style>');
    // nocturne.css is the locked design-system stylesheet
    // (docs/report/report-design-system.md).
    expect(html).toContain('class="sheet"');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('http://localhost'); // no CDN/external reference
    expect(html).not.toContain('../fonts/'); // fonts must be inlined as data URIs, never a relative path
    expect(html).toContain(escapeHtml(analysis.executiveSummary.slice(0, 20)));
  });

  // item 3.3: a theme card's "Constats : f002, f003" link must resolve to
  // a real annex row, not a dead href - checked end to end against the
  // one composed document, since themes.ts and findings-appendix.ts each
  // know only their own half of the id/anchor pair.
  it('item 3.3: every theme card finding-id link resolves to a matching #annexref-{id} anchor in the annex', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    const hrefs = [...html.matchAll(/href="#annexref-([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const id of hrefs) {
      expect(html).toContain(`id="annexref-${id}"`);
    }
  });

  it('B2: passes the render-lint pass (no unfilled placeholders, no stringified undefined/null/NaN)', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const violations = findRenderLintViolations(html);

    // P0.4 (2026-08-21 Large Rule Families feedback pass): the real SIRET is a
    // tracked, deliberate gap (docs/report/report-feedback-deferred-
    // items.md), not a code bug - the guard is meant to keep blocking
    // PDF generation exactly like this until it's filled in, so this
    // smoke test (leftover template artifacts / stringified undefined /
    // etc.) excludes that one known violation rather than asserting zero
    // violations outright. render-lint.test.ts asserts the guard itself
    // does catch this placeholder.
    const unexpectedViolations = violations.filter(
      (v) => v.label !== 'unfilled "[... à renseigner]" placeholder',
    );
    expect(unexpectedViolations, JSON.stringify(unexpectedViolations, null, 2)).toEqual([]);
  });

  // B3's "no majeur in the generated HTML" acceptance check is enforced at
  // the source: severity-vocabulary-guard.test.ts asserts the writing-pass
  // guard rejects "majeur" before an analysis is ever persisted. Not
  // re-asserted here against the small-site fixture, since that fixture
  // is frozen real LLM output captured before this fix and tests never
  // call the live configured API to regenerate it (CLAUDE.md, Testing).

  it('composes the English document with the English chrome strings, not French', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('en');

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html).toContain('<html lang="en">');
    expect(html).toContain('The essentials for a decision');
    expect(html).not.toContain('Résumé');
  });

  it('always renders the single-tier full document (2026-08-16: paid screening tier dropped)', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('en');

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    // "Appendix: full findings list" was the old, independently hand-typed
    // TOC row wording (report-feedback-palais-gallien.md item 3 removed
    // that duplication) - the section's own heading is the canonical
    // assertion now that the TOC row reads the section's own eyebrow.
    expect(html).toContain('Full findings list');
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

  // Doc §3: the conformance summary's own scope note is unconditional
  // fixed copy, independent of whether an obligation determination was
  // reached elsewhere - only the legal-exposure hedge (rendered by the
  // exported renderLegalCitationParagraph) varies with status. The two use
  // deliberately distinct wording so they never collide in a substring
  // check. B9: methodology used to render the same paragraph a second
  // time; it now points back to legal-exposure instead, so each of the
  // legal-citation assertions below changed from 2 occurrences to 1.
  //
  // item 23 [REGRESSION]: the scope note used to read "sans se prononcer
  // sur leur applicabilité légale précise à ce site" (we don't know if
  // this applies to you), which flatly contradicts a page-4 "Confirmé"
  // status on the very same document - a repeat of a defect already
  // flagged once on the multi-page pass. Narrowed to scope the hedge to the
  // criteria list itself ("this list alone doesn't conclude legal
  // obligation"), never a blanket "we don't know" statement, so it can
  // coexist with a confirmed status elsewhere in the report. The OLD
  // phrase is asserted absent below specifically so a future edit
  // reverting to the blanket wording fails this test, not just a new one.
  // item 3.14: rephrased as a positive statement, dropping the old
  // defensive "n'implique pas... ne contredit pas" framing.
  const CONFORMANCE_SCOPE_NOTE = 'indépendamment de toute question d&#39;obligation légale';
  const OLD_CONTRADICTORY_SCOPE_NOTE = 'sans se prononcer sur leur applicabilité légale précise';
  const DATA_AVAILABLE = 'Données disponibles pour cet audit';
  const METHODOLOGY_POINTER = 'figure dans la section';
  // "Confirmé" / "relève de l'obligation suivante" (a settled conclusion)
  // was reworded to this hedged, criteria-based phrasing after a real
  // report review found it violated docs/rules/obligation-basis.md section 7
  // ("any scope statement presented as settled" is not permitted).
  const PUBLISHED_CRITERIA_PHRASE = 'Critères publiés pour';

  it('resolved: legal exposure names a specific obligation once, methodology points back to it, conformance summary still carries its own fixed scope note', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = {
      ...(await loadSmallSiteAnalysis('fr')),
      obligationAssessment: resolvedAssessment,
    };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    const namedOccurrences = html.split(PUBLISHED_CRITERIA_PHRASE).length - 1;
    expect(namedOccurrences).toBe(1);
    expect(html).not.toContain('remplit les critères');
    expect(html).toContain(METHODOLOGY_POINTER);
    expect(html.split(CONFORMANCE_SCOPE_NOTE).length - 1).toBe(1);
    // item 23: a confirmed status must never coexist with the old
    // blanket "we don't know if this applies to you" phrasing.
    expect(html).not.toContain(OLD_CONTRADICTORY_SCOPE_NOTE);
  });

  it('undetermined: legal exposure hedges once, methodology points back to it, conformance summary carries the same fixed scope note regardless', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = {
      ...(await loadSmallSiteAnalysis('fr')),
      obligationAssessment: undeterminedAssessment,
    };

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html.split(DATA_AVAILABLE).length - 1).toBe(1);
    expect(html).toContain(METHODOLOGY_POINTER);
    expect(html.split(CONFORMANCE_SCOPE_NOTE).length - 1).toBe(1);
    expect(html).not.toContain('remplit les critères');
  });

  it('absent assessment: treated the same as undetermined', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const { obligationAssessment: _drop, ...rest } = await loadSmallSiteAnalysis('fr');
    const analysis = rest as Awaited<ReturnType<typeof loadSmallSiteAnalysis>>;

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });

    expect(html.split(DATA_AVAILABLE).length - 1).toBe(1);
    expect(html).toContain(METHODOLOGY_POINTER);
    expect(html.split(CONFORMANCE_SCOPE_NOTE).length - 1).toBe(1);
  });
});

describe('plan 020 general EAA reference placement, as amended 2026-09-04 (issue #57)', () => {
  it.each(['fr', 'en'] as const)(
    'renders the unchanged %s sentence exactly once in the executive block and once in detailed legal content, nowhere else',
    async (language) => {
      const manifest = await loadSmallSiteManifest();
      const findings = await loadSmallSiteFindings();
      const analysis = {
        ...(await loadSmallSiteAnalysis(language)),
        obligationAssessment: {
          status: 'likely_in_scope' as const,
          basis: [{ regimeId: EAA_REGIME_ID, facts: [{ kind: 'siren-missing' as const }] }],
        },
      };

      const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages: [] });
      const sentence = escapeHtml(eaaSanctionFigureSentence(language));
      const execStart = html.indexOf('id="section-01"');
      const legalStart = html.indexOf('id="section-02"');
      const legalEnd = html.indexOf('id="section-11"', legalStart);
      const legalSection = html.slice(legalStart, legalEnd);

      // docs/rules/obligation-basis.md section 7 permits the sentence in
      // exactly two locations: the executive regulatory-context block and
      // the detailed legal section, at most once each.
      expect(html.split(sentence)).toHaveLength(3);
      expect(html.slice(execStart, legalStart)).toContain(sentence);
      expect(html.slice(execStart, legalStart)).toContain('data-executive-regulatory-context');
      expect(legalSection).toContain(sentence);
      expect(html.slice(0, execStart)).not.toContain(sentence);
      expect(html.slice(legalEnd)).not.toContain(sentence);
    },
  );

  it('omits the EAA amount from LCEN-only content', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const lcenFinding = {
      ...findings[0]!,
      findingId: 'lcen-only',
      ruleId: LCEN_MENTIONS_LEGALES_RULE_ID,
      category: 'seo' as const,
    };
    const loaded = await loadSmallSiteAnalysis('fr');
    const { obligationAssessment: _drop, ...analysis } = loaded;

    const html = await renderHtml({
      manifest,
      findings: [lcenFinding],
      analysis,
      renderDiffEvidencePages: [],
    });

    expect(html).toContain('Obligation d&#39;identification de l&#39;éditeur');
    expect(html).not.toContain(escapeHtml(eaaSanctionFigureSentence('fr')));
  });
});
