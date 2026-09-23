import { describe, expect, it } from 'vitest';
import type { Finding, PreparationPreviewLanguage } from '@odysseus/core';
import { renderReportIntro } from './report-intro.js';
import { getStrings } from '../strings/i18n.js';
import { fr } from '../strings/fr.js';
import { escapeCopy, escapeHtml, fillTemplate } from '../html-utils.js';
import { resolveGenericDecisionQuestion } from '../generic-question.js';
import { sectionTitle } from '../section-registry.js';
import type { RenderedPriority } from '../rendered-priorities.js';

const clientFr = getStrings('fr');
const clientEn = getStrings('en');

function buildFinding(overrides: Record<string, unknown>): Finding {
  return {
    findingId: overrides['findingId'] ?? 'f001',
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'axe' as const,
    ruleId: 'button-name',
    category: 'accessibility' as const,
    severity: 'serious' as const,
    wcagCriteria: ['4.1.2'],
    title: 'Buttons must have discernible text',
    description: 'd',
    pageUrls: [],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: (overrides['findingId'] as string) ?? 'f001',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  } as never;
}

function buildAnalysis(findingIds: string[][], language: 'fr' | 'en' = 'fr') {
  return {
    auditId: 'a1',
    language,
    model: 'test-model',
    temperature: 0,
    generatedAt: new Date(),
    overallRisk: 'medium' as const,
    executiveSummary: 'summary',
    themes: findingIds.map((ids, i) => ({
      title: `Priorité ${i + 1}`,
      category: 'accessibility' as const,
      businessImpact: 'Impact',
      effort: 'low' as const,
      impact: 'high' as const,
      priorityRank: i + 1,
      findingIds: ids,
      recommendedActions: ['Agir'],
    })),
    quickWins: [],
    notes: '',
  };
}

/** Minimal rendered-priorities view, as renderBody would pass one: the
 *  intro reads only the array length (for the complication's priority
 *  count). */
function buildPriority(
  themeTitle: string,
  displayRank: number,
  findings: Finding[],
): RenderedPriority {
  return {
    theme: {
      title: themeTitle,
      category: 'accessibility',
      businessImpact: 'Impact',
      effort: 'low',
      impact: 'high',
      priorityRank: displayRank,
      findingIds: findings.map((finding) => finding.findingId),
      recommendedActions: ['Agir'],
    },
    displayRank,
    findings,
    ownershipCounts: {
      'first-party-action': findings.length,
      'third-party-escalation': 0,
      'verify-intent': 0,
    },
    remediations: [],
    evidence: {
      representativeFinding: findings[0]!,
      representativeLabel: 'label',
      representativePageUrl: findings[0]!.pageUrls[0],
      uniquePageCount: findings[0]!.pageUrls.length,
      occurrenceCount: findings[0]!.occurrences,
    },
  } as unknown as RenderedPriority;
}

// Plan 018 step 5: section-00 is the report's Situation, Complication,
// Question opening. The question comes from the shared resolver
// (generic-question.ts), the same bytes the cover renders, so neither
// site can paraphrase the other. The complication states deterministic
// pages/findings/priorities facts only; the situation states the
// diagnostic's purpose without asserting anything about the client's
// bookings, traffic, or legal obligations.
describe('renderReportIntro', () => {
  it('counts only first-party findings, like the statistics tiles, when a frame finding exists', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious', pageUrls: ['https://example.com/a'] }),
      buildFinding({
        findingId: 'f002',
        severity: 'critical',
        pageUrls: ['https://example.com/b'],
        elements: [
          {
            pageUrl: 'https://example.com/b',
            selector: 'iframe[src="https://www.youtube.com/embed/x"] >>> button',
            snippet: '',
          },
        ],
      }),
    ];
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([['f001', 'f002']]) as never,
      findings,
    );
    expect(html).toContain('1 constat distinct, dont 1 de gravité');
    expect(html).not.toContain('2 constats distincts');
  });

  it('renders the situation, complication, and question blocks in French, with the deterministic facts', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious', pageUrls: ['https://example.com/a'] }),
      buildFinding({
        findingId: 'f002',
        severity: 'critical',
        pageUrls: ['https://example.com/b'],
      }),
      buildFinding({ findingId: 'f003', severity: 'minor', pageUrls: [] }),
    ];
    const analysis = buildAnalysis([['f001', 'f002', 'f003']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain(clientFr.reportIntro.situationHeading);
    expect(html).toContain(clientFr.reportIntro.complicationHeading);
    // Issue #52: the question renders without a labelling heading above it.
    expect(html).not.toContain('La question à laquelle ce rapport répond');
    expect(html).toContain(escapeHtml(clientFr.reportIntro.situationBody));
    // 3 distinct findings, 2 critical or serious, 2 distinct pages affected
    // (the union; the zero-page minor finding cannot shrink it), 1 priority
    // selected by the fallback path.
    expect(html).toContain(
      escapeHtml(
        fillTemplate(clientFr.reportIntro.complicationBodyTemplate, {
          findings: '3 constats distincts',
          criticalSerious: '2',
          pages: '2 pages',
          priorities: '1 priorité',
        }),
      ),
    );
    // Issue #314: the cover's question is not repeated on this page.
    expect(html).not.toContain(resolveGenericDecisionQuestion('fr'));
  });

  it('counts only analysed pages, so the footprint never exceeds the analysed set', () => {
    // A real report claimed "au moins 206 pages" of 140 analysed: a finding's
    // pageUrls can name a redirect target a hreflang link points at, which the
    // crawl never content-checked.
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious', pageUrls: ['https://example.com/a'] }),
      buildFinding({
        findingId: 'f002',
        severity: 'critical',
        pageUrls: ['https://example.com/a', 'https://example.com/redirect-target'],
      }),
    ];
    const analysis = buildAnalysis([['f001', 'f002']]);
    const analysed = new Set(['https://example.com/a']);

    const html = renderReportIntro(
      getStrings('fr'),
      1,
      analysis as never,
      findings,
      undefined,
      undefined,
      analysed,
    );

    expect(html).toContain(
      escapeHtml(
        fillTemplate(clientFr.reportIntro.complicationBodyTemplate, {
          findings: '2 constats distincts',
          criticalSerious: '2',
          pages: '1 page',
          priorities: '1 priorité',
        }),
      ),
    );
  });

  it('renders the same structure in English for an English analysis', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious', pageUrls: ['https://example.com/a'] }),
    ];
    const analysis = buildAnalysis([['f001']], 'en');

    const html = renderReportIntro(getStrings('en'), 1, analysis as never, findings);

    expect(html).toContain(clientEn.reportIntro.situationHeading);
    expect(html).toContain(clientEn.reportIntro.complicationHeading);
    expect(html).not.toContain('The question this report answers');
    expect(html).toContain(clientEn.reportIntro.situationBody);
    expect(html).toContain(
      fillTemplate(clientEn.reportIntro.complicationBodyTemplate, {
        findings: '1 distinct finding',
        criticalSerious: '1',
        pages: '1 page',
        priorities: '1 priority',
      }),
    );
    expect(html).not.toContain(resolveGenericDecisionQuestion('en'));
  });

  it('renders every block with the fallbacks: no priorities argument, no findings, in French', () => {
    const analysis = buildAnalysis([]);
    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, []);

    expect(html).toContain(
      escapeHtml(
        fillTemplate(clientFr.reportIntro.complicationBodyTemplate, {
          findings: '0 constat distinct',
          criticalSerious: '0',
          pages: '0 page',
          priorities: '0 priorité',
        }),
      ),
    );
    expect(html).not.toContain(resolveGenericDecisionQuestion('fr'));
    // The renamed heading (issue #53) carries an apostrophe, which renders
    // escaped, so compare the escaped form.
    expect(html).toContain(escapeHtml(clientFr.reportIntro.audienceHeading));
    // Issue #54: no top-3 action list on this page anymore.
    expect(html).not.toContain('Les trois actions à lancer en priorité');
  });

  it('renders every block with the fallbacks: an empty priorities array, in English', () => {
    const analysis = buildAnalysis([], 'en');
    const html = renderReportIntro(getStrings('en'), 1, analysis as never, [], []);

    expect(html).toContain(
      fillTemplate(clientEn.reportIntro.complicationBodyTemplate, {
        findings: '0 distinct findings',
        criticalSerious: '0',
        pages: '0 pages',
        priorities: '0 priorities',
      }),
    );
    expect(html).not.toContain(resolveGenericDecisionQuestion('en'));
    expect(html).toContain(clientEn.reportIntro.audienceHeading);
    expect(html).not.toContain('The three actions to launch first');
  });

  it('takes the priority count from the provided rendered-priorities view alone', () => {
    const findings = [
      buildFinding({ findingId: 'f001', pageUrls: ['https://example.com/a'] }),
      buildFinding({ findingId: 'f002', pageUrls: ['https://example.com/b'] }),
    ];
    // Two themes in the analysis, but the provided view carries one: the
    // complication must count the view, not the stored analysis.
    const analysis = buildAnalysis([['f001'], ['f002']]);
    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings, [
      buildPriority('Priorité fournie', 1, [findings[0]!]),
    ]);

    // Issue #322: one priority, so the noun agrees in the singular.
    expect(html).toContain('Le regroupement en 1 priorité fait ressortir');
    // Issue #54: the section no longer lists actions at all, so neither the
    // view's own titles nor the stored analysis's themes render here.
    expect(html).not.toContain('Les trois actions à lancer en priorité');
    expect(html).not.toContain('Priorité fournie');
    expect(html).not.toContain('Priorité 2');
  });

  // Issue #314: the question appeared a second time here, in large type
  // between "Ce qui mérite votre attention" and "Comment utiliser ce
  // rapport". It belongs to the cover only.
  it('leaves the decision question to the cover, in either language', () => {
    const frHtml = renderReportIntro(getStrings('fr'), 1, buildAnalysis([]) as never, []);
    expect(frHtml).not.toContain(resolveGenericDecisionQuestion('fr'));

    const enHtml = renderReportIntro(getStrings('en'), 1, buildAnalysis([], 'en') as never, []);
    expect(enHtml).not.toContain(resolveGenericDecisionQuestion('en'));
  });

  it.each([
    ['fr', getStrings('fr'), buildAnalysis([['f001']])],
    ['en', getStrings('en'), buildAnalysis([['f001']], 'en')],
  ] as const)(
    'never asserts booking or AI traffic growth, client abandonment, or an applicable law (%s)',
    (_language, strings, analysis) => {
      const findings = [buildFinding({ pageUrls: ['https://example.com/a'] })];
      const html = renderReportIntro(strings, 1, analysis as never, findings);

      // No "bookings increasingly pass through AI" growth claim.
      expect(html).not.toMatch(/de plus en plus|increasingly|more and more/i);
      expect(html).not.toMatch(/réservations[^.]*passent|bookings[^.]*pass through/i);
      // No "clients abandon" claim.
      expect(html).not.toMatch(/abandonn|abandon/i);
      expect(html).not.toMatch(/perdent des clients|you lose customers/i);
      // No "the law applies to this business" claim: apostrophes render
      // escaped, so the French forms are compared in their escaped render
      // form to keep these assertions meaningful. Only the conditional
      // "peuvent également concerner" / "may also apply" forms are allowed, each in its
      // own language.
      expect(html).not.toMatch(/legal obligations apply to your/i);
      expect(html).not.toContain(escapeHtml("obligations légales s'appliquent"));
      expect(html).not.toContain(escapeHtml("s'appliquent à votre établissement"));
      if (_language === 'fr') {
        expect(html).toContain('peuvent également concerner');
        expect(html).not.toContain('may apply');
      } else {
        expect(html).toContain('may also apply');
        expect(html).not.toContain('peuvent également concerner');
      }
    },
  );

  it('resolves the legal reminder through sectionTitle and carries the live ordinal in its own header', () => {
    const strings = getStrings('fr');
    const html = renderReportIntro(strings, 7, buildAnalysis([]) as never, []);

    expect(html).toContain(sectionTitle('section-02', strings));
    expect(html).toContain('>07</h6>');
    expect(html).toContain(`>${strings.reportIntro.eyebrow}</h2>`);
    // No hand-typed number: the legal section is referenced by its live
    // title, which survives any future reorder.
    expect(html).not.toMatch(/[Ss]ection\s+0?2\b/);
  });

  it('anchors the audience table to the new canonical order, with role labels only', () => {
    const strings = getStrings('fr');
    const html = renderReportIntro(strings, 1, buildAnalysis([]) as never, []);

    expect(html).toContain(fr.reportIntro.roleManagementLabel);
    expect(html).toContain(fr.reportIntro.roleTechnicalLabel);
    expect(html).toContain(fr.reportIntro.roleCommunicationsLabel);
    expect(html).toContain(fr.reportIntro.roleLegalLabel);
    // Issue #333: section-14 (next steps) now renders after section-02 (legal): the
    // management row ends on the synthesis, the legal row points at the
    // later legal section, both as live titles, no numbers.
    expect(html).toContain(
      [
        sectionTitle('section-01', strings),
        sectionTitle('section-04', strings),
        sectionTitle('section-14', strings),
      ].join(', '),
    );
    expect(html).toContain(
      [sectionTitle('section-02', strings), sectionTitle('section-11', strings)].join(', '),
    );
    expect(html).not.toContain('Vous (dirigeant)');
    expect(html).not.toContain('Jane Doe');
  });

  it('renders the English chrome strings for an English report, never the French ones', () => {
    const analysis = buildAnalysis([], 'en');
    const html = renderReportIntro(getStrings('en'), 1, analysis as never, []);

    expect(html).toContain(clientEn.reportIntro.audienceHeading);
    // Same apostrophe rule as above: the French heading only ever renders
    // in its escaped form.
    expect(html).not.toContain(escapeHtml(clientFr.reportIntro.audienceHeading));
    expect(html).not.toContain(clientFr.reportIntro.eyebrow);
  });
});

// Plan 019 step 7: with a preparation preview, the opening hook is the
// preview's already-resolved value. Without one, nothing
// changes.
describe('plan 019: renderReportIntro consumes the preparation preview', () => {
  const frPreview: PreparationPreviewLanguage = {
    language: 'fr',
    coverQuestion: { value: 'Question personnalisée sur le rapport ?', source: 'custom' },
    hook: {
      family: 'accessibility',
      value: "L'accessibilité est le sujet le plus urgent de ce rapport.",
      evidenceUnavailable: false,
    },
  };

  it('does not repeat the preview question either', () => {
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [],
      undefined,
      frPreview,
    );
    expect(html).not.toContain('Question personnalisée sur le rapport ?');
    expect(html).not.toContain(resolveGenericDecisionQuestion('fr'));
  });

  it('renders the automatic hook when it carries findings evidence', () => {
    const finding = buildFinding({ findingId: 'f001', pageUrls: ['https://example.com/a'] });
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [finding],
      [buildPriority('Contrastes', 1, [finding])],
      frPreview,
    );
    expect(html).toContain(
      escapeCopy("L'accessibilité est le sujet le plus urgent de ce rapport.", 'fr'),
    );
  });

  // Issue #307: the hook said accessibility stood out while the next page
  // said priority 1 (structured data) was tied to no accessibility criterion.
  it('omits a family hook that the top-ranked priority contradicts', () => {
    const finding = buildFinding({ findingId: 'f001', pageUrls: ['https://example.com/a'] });
    const seoPriority = buildPriority('Données structurées', 1, [finding]);
    seoPriority.theme.category = 'seo';
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [finding],
      [seoPriority],
      frPreview,
    );
    expect(html).not.toContain(
      escapeHtml("L'accessibilité est le sujet le plus urgent de ce rapport."),
    );
  });

  it('never renders the hook when the evidence was unavailable', () => {
    const html = renderReportIntro(getStrings('fr'), 1, buildAnalysis([]) as never, [], undefined, {
      ...frPreview,
      hook: { ...frPreview.hook, evidenceUnavailable: true },
    });
    expect(html).not.toContain(
      escapeHtml("L'accessibilité est le sujet le plus urgent de ce rapport."),
    );
  });

  it('keeps bare role labels in the audience rows', () => {
    const strings = getStrings('fr');
    const html = renderReportIntro(
      strings,
      1,
      buildAnalysis([]) as never,
      [],
      undefined,
      frPreview,
    );
    expect(html).toContain(strings.reportIntro.roleManagementLabel);
    expect(html).toContain(strings.reportIntro.roleTechnicalLabel);
  });

  it('leaves the generic opening untouched without preparation', () => {
    const strings = getStrings('fr');
    const html = renderReportIntro(strings, 1, buildAnalysis([]) as never, []);
    expect(html).not.toContain(resolveGenericDecisionQuestion('fr'));
    expect(html).toContain(strings.reportIntro.roleManagementLabel);
  });
});

describe('the affected-page count against the analysed scope', () => {
  // A real report opened on "315 constats ... sur au moins 526 pages du
  // périmètre analysé" while its own scope figures said 522 pages were
  // analysed: four findings cited redirect interstitials and error pages,
  // which no other page figure counts.
  it('counts only pages inside the analysed scope', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious', pageUrls: ['https://example.com/a'] }),
      buildFinding({
        findingId: 'f002',
        severity: 'critical',
        pageUrls: ['https://example.com/a', 'https://example.com/redirect'],
      }),
    ];
    const analysis = buildAnalysis([['f001', 'f002']]);
    const scope = new Set(['https://example.com/a']);

    const html = renderReportIntro(
      getStrings('fr'),
      1,
      analysis as never,
      findings,
      undefined,
      undefined,
      scope,
    );

    expect(html).toContain('1 page');
    expect(html).not.toContain('2 pages');
  });

  it('counts every cited page when no scope is passed', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        severity: 'serious',
        pageUrls: ['https://example.com/a', 'https://example.com/redirect'],
      }),
    ];
    const analysis = buildAnalysis([['f001']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('2 pages');
  });
});
