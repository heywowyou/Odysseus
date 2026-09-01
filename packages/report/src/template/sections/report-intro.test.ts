import { describe, expect, it } from 'vitest';
import type { Finding, PreparationPreviewLanguage } from '@odysseus/core';
import { renderReportIntro } from './report-intro.js';
import { getStrings } from '../strings/i18n.js';
import { fr } from '../strings/fr.js';
import { en } from '../strings/en.js';
import { escapeHtml, fillTemplate } from '../html-utils.js';
import { resolveGenericDecisionQuestion } from '../generic-question.js';
import { sectionTitle } from '../section-registry.js';
import type { RenderedPriority } from '../rendered-priorities.js';

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
 *  intro reads only each entry's theme (for the action list) and the
 *  array length (for the complication's priority count). */
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

    expect(html).toContain(fr.reportIntro.situationHeading);
    expect(html).toContain(fr.reportIntro.complicationHeading);
    expect(html).toContain(fr.reportIntro.questionHeading);
    expect(html).toContain(escapeHtml(fr.reportIntro.situationBody));
    // 3 distinct findings, 2 critical or serious, 2 distinct pages affected
    // (the union; the zero-page minor finding cannot shrink it), 1 priority
    // selected by the fallback path.
    expect(html).toContain(
      escapeHtml(
        fillTemplate(fr.reportIntro.complicationBodyTemplate, {
          findings: '3',
          criticalSerious: '2',
          pages: '2',
          priorities: '1',
        }),
      ),
    );
    expect(html).toContain(resolveGenericDecisionQuestion('fr'));
  });

  it('renders the same structure in English for an English analysis', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious', pageUrls: ['https://example.com/a'] }),
    ];
    const analysis = buildAnalysis([['f001']], 'en');

    const html = renderReportIntro(getStrings('en'), 1, analysis as never, findings);

    expect(html).toContain(en.reportIntro.situationHeading);
    expect(html).toContain(en.reportIntro.complicationHeading);
    expect(html).toContain(en.reportIntro.questionHeading);
    expect(html).toContain(en.reportIntro.situationBody);
    expect(html).toContain(
      fillTemplate(en.reportIntro.complicationBodyTemplate, {
        findings: '1',
        criticalSerious: '1',
        pages: '1',
        priorities: '1',
      }),
    );
    expect(html).toContain(resolveGenericDecisionQuestion('en'));
  });

  it('renders every block with the fallbacks: no priorities argument, no findings, in French', () => {
    const analysis = buildAnalysis([]);
    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, []);

    expect(html).toContain(
      escapeHtml(
        fillTemplate(fr.reportIntro.complicationBodyTemplate, {
          findings: '0',
          criticalSerious: '0',
          pages: '0',
          priorities: '0',
        }),
      ),
    );
    expect(html).toContain(resolveGenericDecisionQuestion('fr'));
    expect(html).toContain(fr.reportIntro.audienceHeading);
    expect(html).not.toContain(fr.reportIntro.nextActionsHeading);
  });

  it('renders every block with the fallbacks: an empty priorities array, in English', () => {
    const analysis = buildAnalysis([], 'en');
    const html = renderReportIntro(getStrings('en'), 1, analysis as never, [], []);

    expect(html).toContain(
      fillTemplate(en.reportIntro.complicationBodyTemplate, {
        findings: '0',
        criticalSerious: '0',
        pages: '0',
        priorities: '0',
      }),
    );
    expect(html).toContain(resolveGenericDecisionQuestion('en'));
    expect(html).toContain(en.reportIntro.audienceHeading);
    expect(html).not.toContain(en.reportIntro.nextActionsHeading);
  });

  it('takes the priority count and the action titles from the provided rendered-priorities view', () => {
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

    expect(html).toContain(
      'Ces constats sont regroupés en 1 priorités classées, qui indiquent par où commencer.',
    );
    expect(html).toContain('Priorité fournie');
    expect(html).not.toContain('Priorité 2');
  });

  it('renders the question byte for byte from the shared resolver, and never the other language', () => {
    const frHtml = renderReportIntro(getStrings('fr'), 1, buildAnalysis([]) as never, []);
    expect(frHtml).toContain(resolveGenericDecisionQuestion('fr'));
    expect(frHtml).not.toContain(resolveGenericDecisionQuestion('en'));

    const enHtml = renderReportIntro(getStrings('en'), 1, buildAnalysis([], 'en') as never, []);
    expect(enHtml).toContain(resolveGenericDecisionQuestion('en'));
    expect(enHtml).not.toContain(resolveGenericDecisionQuestion('fr'));
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
      // "peuvent s'appliquer" / "may apply" forms are allowed, each in its
      // own language.
      expect(html).not.toMatch(/legal obligations apply to your/i);
      expect(html).not.toContain(escapeHtml("obligations légales s'appliquent"));
      expect(html).not.toContain(escapeHtml("s'appliquent à votre établissement"));
      if (_language === 'fr') {
        expect(html).toContain(escapeHtml("peuvent s'appliquer"));
        expect(html).not.toContain('may apply');
      } else {
        expect(html).toContain('may apply');
        expect(html).not.toContain(escapeHtml("peuvent s'appliquer"));
      }
    },
  );

  it('resolves the legal reminder through sectionTitle and carries the live ordinal in its own header', () => {
    const strings = getStrings('fr');
    const html = renderReportIntro(strings, 7, buildAnalysis([]) as never, []);

    expect(html).toContain(sectionTitle('section-02', strings));
    expect(html).toContain(`07 · ${strings.reportIntro.eyebrow}`);
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
    // section-14 (next steps) now renders before section-02 (legal): the
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

  it('escapes interpolated facts: markup, quotes, and long URLs in a stored theme title', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        elements: [{ pageUrl: 'https://example.com/', selector: 'header nav a', snippet: '' }],
      }),
    ];
    const analysis = buildAnalysis([['f001']]);
    analysis.themes[0]!.title =
      'Renommer les boutons <b>"urgent"</b> & voir https://example.com/a/very/long/path?x=1&y="z"';

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('&lt;b&gt;&quot;urgent&quot;&lt;/b&gt;');
    expect(html).toContain('https://example.com/a/very/long/path?x=1&amp;y=&quot;z&quot;');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('x=1&y=');
  });

  it('lists the top 3 themes as next actions without effort, naming the agency when a theme is entirely first-party', () => {
    const findings = ['f001', 'f002', 'f003', 'f004'].map((findingId) =>
      buildFinding({
        findingId,
        elements: [{ pageUrl: 'https://example.com/', selector: 'header nav a', snippet: '' }],
      }),
    );
    const analysis = buildAnalysis([['f001'], ['f002'], ['f003'], ['f004']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('Priorité 1');
    expect(html).toContain('votre agence');
    expect(html).not.toContain('effort :');
    // Capped at three: the fourth theme stays off this page.
    expect(html).not.toContain('Priorité 4');
  });

  it('names the vendor when a theme is entirely third-party', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        elements: [
          { pageUrl: 'https://example.com/', selector: '.gform_wrapper button', snippet: '' },
        ],
      }),
    ];
    const analysis = buildAnalysis([['f001']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('Gravity Forms');
  });

  it('names both when a theme spans first- and third-party pages', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        elements: [{ pageUrl: 'https://example.com/', selector: 'header nav a', snippet: '' }],
      }),
      buildFinding({
        findingId: 'f002',
        elements: [
          {
            pageUrl: 'https://example.com/contact',
            selector: '.gform_wrapper button',
            snippet: '',
          },
        ],
      }),
    ];
    const analysis = buildAnalysis([['f001', 'f002']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain(escapeHtml(fr.reportIntro.contactAgencyAndVendor));
  });

  it('renders the English chrome strings for an English report, never the French ones', () => {
    const analysis = buildAnalysis([], 'en');
    const html = renderReportIntro(getStrings('en'), 1, analysis as never, []);

    expect(html).toContain(en.reportIntro.audienceHeading);
    expect(html).not.toContain(fr.reportIntro.audienceHeading);
    expect(html).not.toContain(fr.reportIntro.heading);
  });
});

// Plan 019 step 7: with a preparation preview, the opening question and
// hook are the preview's already-resolved values, the audience rows carry
// optional stakeholder names, and confirmed journeys render with exactly
// the three approved tri-state wordings. Without one, nothing changes.
describe('plan 019: renderReportIntro consumes the preparation preview', () => {
  const frPreview: PreparationPreviewLanguage = {
    language: 'fr',
    coverQuestion: { value: 'Question personnalisée sur le rapport ?', source: 'custom' },
    hook: {
      family: 'accessibility',
      value: "L'accessibilité est le sujet le plus urgent de ce rapport.",
      evidenceUnavailable: false,
    },
    stakeholders: [{ role: 'management', roleLabel: 'Direction', name: 'Jeanne Dupont' }],
    journeys: [
      {
        journeyId: 'transaction-booking',
        label: 'Réservation et transaction',
        description: "Ce parcours vérifie ce qu'un visiteur voit.",
        steps: [
          {
            stepId: 'booking-page',
            label: 'Page de réservation',
            description: 'Ce que la page affiche.',
            state: 'issue-observed',
            stateLabel: 'Problème constaté',
          },
          {
            stepId: 'booking-form',
            label: 'Formulaire de réservation',
            description: 'Ce que le formulaire révèle.',
            state: 'not-evaluated',
            stateLabel: 'Non évalué',
            notEvaluatedReason: 'detector-failed',
          },
        ],
      },
    ],
  };

  it('replaces the question with the preview value in this language only', () => {
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [],
      undefined,
      frPreview,
    );
    expect(html).toContain('Question personnalisée sur le rapport ?');
    expect(html).not.toContain(resolveGenericDecisionQuestion('fr'));
  });

  it('renders the automatic hook when it carries findings evidence', () => {
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [],
      undefined,
      frPreview,
    );
    expect(html).toContain(
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

  it('personalizes the matching audience row with the stakeholder name', () => {
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [],
      undefined,
      frPreview,
    );
    expect(html).toContain('La direction (Jeanne Dupont)');
    // The other rows keep their bare role labels.
    expect(html).toContain(getStrings('fr').reportIntro.roleTechnicalLabel);
  });

  it('renders only the confirmed journeys, every step in one of the three approved states', () => {
    const html = renderReportIntro(
      getStrings('fr'),
      1,
      buildAnalysis([]) as never,
      [],
      undefined,
      frPreview,
    );
    expect(html).toContain('Parcours visiteurs vérifiés');
    expect(html).toContain('Réservation et transaction');
    expect(html).toContain('Problème constaté');
    expect(html).toContain('Non évalué');
    // The disapproved tri-state and the other journey's copy are absent.
    expect(html).not.toContain('Aucun problème détecté');
    expect(html).not.toContain('Découverte et navigation');
  });

  it('renders no journeys block when no journey was confirmed', () => {
    const html = renderReportIntro(getStrings('fr'), 1, buildAnalysis([]) as never, [], undefined, {
      ...frPreview,
      journeys: [],
    });
    expect(html).not.toContain('Parcours visiteurs vérifiés');
  });

  it('leaves the generic opening untouched without preparation', () => {
    const strings = getStrings('fr');
    const html = renderReportIntro(strings, 1, buildAnalysis([]) as never, []);
    expect(html).toContain(resolveGenericDecisionQuestion('fr'));
    expect(html).not.toContain('Parcours visiteurs vérifiés');
    expect(html).toContain(strings.reportIntro.roleManagementLabel);
  });
});
