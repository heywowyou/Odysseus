import { describe, expect, it } from 'vitest';
import {
  EAA_REGIME_ID,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  eaaSanctionFigureSentence,
  type ObligationAssessment,
} from '@odysseus/core';
import { partitionFindings } from '@odysseus/llm';
import { renderHtml } from './render-html.js';
import { escapeCopy, escapeHtml } from './html-utils.js';
import { findRenderLintViolations } from './render-lint.js';
import { selectRemainingFindings } from './sections/remaining-work.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteFindingsWithLegalSearchFinding,
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
    expect(html).toContain('<html lang="fr" data-report-theme="dark">');
    expect(html).toContain('<style>');
    // nocturne.css is the locked design-system stylesheet
    // (docs/report/report-design-system.md).
    expect(html).toContain('class="sheet"');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('http://localhost'); // no CDN/external reference
    expect(html).not.toContain('../fonts/'); // fonts must be inlined as data URIs, never a relative path
    expect(html).toContain(escapeHtml(analysis.executiveSummary.slice(0, 20)));
    // Neither embedded face has U+202F; Chromium would print it from a host
    // font and the PDF file check would refuse the report.
    expect(html).not.toContain('\u202f');
  });

  it('uses an explicit light theme register without changing report content inputs', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const dark = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const light = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      theme: 'light',
    });

    expect(dark).toContain('<html lang="fr" data-report-theme="dark">');
    expect(light).toContain('<html lang="fr" data-report-theme="light">');
    expect(light).toContain('--color-bg: #e8edf3');
    expect(light).toContain('--color-text: #101b2a');
    expect(light).toContain('--color-accent: #0369a1');
    expect(light).not.toContain('prefers-color-scheme');
    expect(light).toContain(escapeHtml(analysis.executiveSummary.slice(0, 20)));
    expect(light.match(/id="section-\d{2}[a-z]*"/gu)).toEqual(
      dark.match(/id="section-\d{2}[a-z]*"/gu),
    );
  });

  // item 3.3: a theme card's "Constats : f002, f003" link must resolve to
  // a real annex row, not a dead href - checked end to end against the
  // one composed document, since themes.ts and findings-appendix.ts each
  // know only their own half of the id/anchor pair.
  it('issue #336: no French top-level section header repeats or paraphrases its title on a second line', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const headers = [
      ...html.matchAll(
        /<div class="section-head">[\s\S]*?<h6[^>]*>([^<]*)<\/h6>[\s\S]*?<h2[^>]*>([^<]*)<\/h2>/gu,
      ),
    ];

    expect(headers.length).toBeGreaterThan(10);
    for (const [, eyebrow, title] of headers) {
      // The eyebrow line carries only the live ordinal; the canonical title
      // is the one heading.
      expect(eyebrow).toMatch(/^\d{2}$/u);
      expect(title!.trim()).not.toBe('');
    }
  });

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

  it('keeps diverted legal findings out of remaining work while preserving observations and annex traceability (issue #211)', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindingsWithLegalSearchFinding();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const { forModel: actionableFindings, diverted } = partitionFindings(findings, manifest);
    const legalIds = diverted
      .filter(({ reason }) => reason === 'legal')
      .map(({ finding }) => finding.findingId);
    expect(legalIds.length).toBeGreaterThan(0);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const remainingStart = html.indexOf('id="section-05b"');
    const observationsStart = html.indexOf('id="section-06"');
    const observationsEnd = html.indexOf('id="section-07"');
    const remainingWork = html.slice(remainingStart, observationsStart);
    const observations = html.slice(observationsStart, observationsEnd);
    const renderedRemainingCount = Number(
      remainingWork.match(/Les (\d+) constats? restants?/)?.[1],
    );

    expect(renderedRemainingCount).toBe(
      selectRemainingFindings(analysis, actionableFindings).length,
    );

    for (const findingId of legalIds) {
      expect(remainingWork).not.toContain(`annexref-${findingId}`);
      expect(observations).toContain(findingId);
      expect(html).toContain(`id="annexref-${findingId}"`);
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

  it('issue #377: quotes an audited site selector carrying "[object Object]" without failing render-lint', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const selector = '.jcLePU.sc-column[spacing="[object Object]"]:nth-child(10) > .item';
    const withLeakySiteSelector = findings.map((finding) =>
      finding.elements.length === 0
        ? finding
        : { ...finding, elements: finding.elements.map((el) => ({ ...el, selector })) },
    );

    const html = await renderHtml({
      manifest,
      findings: withLeakySiteSelector,
      analysis,
      renderDiffEvidencePages,
    });

    expect(html).toContain('sc-column[spacing=&quot;[object Object]&quot;]');
    expect(findRenderLintViolations(html).map((v) => v.label)).not.toContain('stringified object');
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

    expect(html).toContain('<html lang="en" data-report-theme="dark">');
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
  const CONFORMANCE_SCOPE_NOTE = 'indépendamment de toute question d’obligation légale';
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
      const sentence = escapeCopy(eaaSanctionFigureSentence(language), language);
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

    expect(html).toContain('Obligation d’identification de l’éditeur');
    expect(html).not.toContain(escapeCopy(eaaSanctionFigureSentence('fr'), 'fr'));
  });
});

/** hotelchateauroyal.nc: « Les 79 constats restants » under 43 priorities,
 *  in a report whose headline counted 109 findings. The 13 extra were
 *  findings inside third-party frames and findings only on unlinked sitemap
 *  pages, which Q1 and Q4 keep out of the headline counts. */
describe('the remaining-findings section counts the headline population', () => {
  function remainingSection(html: string): string {
    const start = html.indexOf('id="section-05b"');
    const end = html.indexOf('id="section-', start + 1);
    return html.slice(start, end);
  }

  it('leaves a finding confined to a third-party frame to the annex', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const template = findings.find((finding) => finding.category === 'accessibility');
    if (template === undefined) throw new Error('fixture has no accessibility finding');
    const pageUrl = template.pageUrls[0] ?? manifest.pages[0]?.url ?? '';
    const framed = {
      ...template,
      findingId: 'f999',
      dedupeKey: 'framed-only',
      ruleId: 'frame-title',
      elements: [{ pageUrl, selector: 'iframe[width="100%"] >>> iframe', snippet: '' }],
    };

    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const render = (all: typeof findings): Promise<string> =>
      renderHtml({ manifest, findings: all, analysis, renderDiffEvidencePages });

    const without = remainingSection(await render(findings));
    const withFramed = await render([...findings, framed]);

    expect(remainingSection(withFramed)).toBe(without);
    expect(withFramed).toContain('id="annexref-f999"');
  });
});
