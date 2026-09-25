import { describe, expect, it } from 'vitest';
import type { Finding, ObligationAssessment } from '@odysseus/core';
import { htmlToText, renderGlossary } from './glossary.js';
import { renderHtml } from '../render-html.js';
import { buildStressFixture } from '../../stress-fixture.js';
import { getStrings } from '../strings/i18n.js';

function buildFinding(category: Finding['category']): Finding {
  return {
    findingId: 'f1',
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'rule',
    category,
    severity: 'moderate',
    wcagCriteria: [],
    title: 't',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

const eaaAssessment: ObligationAssessment = {
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

const article47Assessment: ObligationAssessment = {
  status: 'in_scope',
  basis: [
    {
      regimeId: 'eaa-loi-2023-171',
      facts: [
        { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
        { kind: 'no-transactional-flow' },
      ],
    },
    {
      regimeId: 'loi-2005-102-article-47',
      facts: [{ kind: 'turnover', amountEur: 260_000_000, thresholdEur: 250_000_000 }],
    },
  ],
};

// item 33: the glossary defined RGAA on every report (including EAA-route
// ones that never mention it, per item 19) and omitted every performance-
// metric abbreviation and GEO/SEO term the report does use.
describe('item 33: the glossary is scoped to the terms a given report actually uses', () => {
  it('always includes the severity vocabulary, and Core Web Vitals abbreviations when performance was measured', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    for (const term of [
      'Critique',
      'Sérieux',
      'Modéré',
      'Mineur',
      'LCP',
      'FCP',
      'TBT',
      'CLS',
      'Speed Index',
    ]) {
      expect(html).toContain(term);
    }
  });

  // P0.1 (2026-08-21 La Corniche feedback pass): the five Core Web Vitals
  // terms used to be always-included, defining LCP/FCP/TBT/CLS/Speed Index
  // for a performance section that had zero content whenever Lighthouse
  // failed on every page.
  it('omits Core Web Vitals abbreviations when performance was not measured', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: false,
      reportText: '',
    });
    for (const term of ['LCP', 'FCP', 'TBT', 'CLS', 'Speed Index']) {
      expect(html).not.toContain(term);
    }
    expect(html).toContain('Critique');
  });

  it('omits RGAA for an EAA-route client', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: eaaAssessment,
      transactionalFlowEvaluated: true,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    expect(html).not.toContain('RGAA');
  });

  it('includes RGAA for an article-47 client', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: article47Assessment,
      transactionalFlowEvaluated: true,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    expect(html).toContain('RGAA');
  });

  it('includes SEO only when the report has seo findings', () => {
    const withSeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('seo')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    const withoutSeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('accessibility')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    expect(withSeo).toContain('>SEO<');
    expect(withoutSeo).not.toContain('>SEO<');
  });

  it('includes GEO only when the report has geo findings', () => {
    const withGeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('geo')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    const withoutGeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('accessibility')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    expect(withGeo).toContain('>GEO<');
    expect(withoutGeo).not.toContain('>GEO<');
  });

  it('includes "parcours transactionnel" only when the transactional-flow question was evaluated', () => {
    const evaluated = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: true,
      hasMeasuredCoreWebVitals: true,
      reportText: 'aucun parcours transactionnel trouvé',
    });
    const notEvaluated = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    expect(evaluated).toContain('Parcours transactionnel');
    expect(notEvaluated).not.toContain('Parcours transactionnel');
  });
});

// item 3.5 (v2 pass): 8 confirmed-missing terms that a report can
// actually use, added to strings.glossary.terms.
describe('item 3.5: the 8 previously-missing glossary terms', () => {
  it('always includes the near-universal terms with no cheap ctx signal to gate on', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    for (const term of ['Sans objet', 'Pages concernées', 'Rendu', 'Complexité', 'Impact']) {
      expect(html).toContain(term);
    }
    // The cards label the column "Impact"; the glossary must name it the
    // same, and never claim the audit measures conversion.
    expect(html).not.toContain('Impact commercial');
    expect(html).not.toContain('conversion');
  });

  it('includes "Signaux à vérifier" only when a heuristic-rule finding exists', () => {
    const withHeuristic = renderGlossary(getStrings('fr'), 13, {
      findings: [{ ...buildFinding('accessibility'), ruleId: 'alt-text-quality-heuristic' }],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    const withoutHeuristic = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('accessibility')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
      reportText: '',
    });
    expect(withHeuristic).toContain('Signaux à vérifier');
    expect(withoutHeuristic).not.toContain('Signaux à vérifier');
  });

  it('includes "Recherche émergente" only when the report prints that label', () => {
    // It prints only beside a statistic flagged as emerging, not with every
    // GEO finding: a hotel report with GEO findings defined it unused.
    const ctx = {
      findings: [buildFinding('geo')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
      hasMeasuredCoreWebVitals: true,
    };
    const labelled = renderGlossary(getStrings('fr'), 13, {
      ...ctx,
      reportText: 'Repère chiffré (Recherche émergente) : …',
    });
    const unlabelled = renderGlossary(getStrings('fr'), 13, {
      ...ctx,
      reportText: 'Repère chiffré : …',
    });
    expect(labelled).toContain('Recherche émergente');
    expect(unlabelled).not.toContain('Recherche émergente');
  });
});

// Issue #105: the glossary defined "Gain rapide" as "fort impact" while
// the badge rule (and the next-steps count in the same report) admits a
// medium impact - a real report carried the badge on a "Impact
// commercial : Moyen" priority, contradicting its own glossary.
describe('quick-win glossary definition (issue #105)', () => {
  it('states the medium-or-high impact range in both languages, never the old high-impact claim', () => {
    for (const language of ['fr', 'en'] as const) {
      const html = renderGlossary(getStrings(language), 13, {
        findings: [buildFinding('seo')],
        obligationAssessment: undefined,
        transactionalFlowEvaluated: false,
        hasMeasuredCoreWebVitals: true,
        reportText: '',
      });
      if (language === 'fr') {
        expect(html).toContain('à impact moyen ou élevé');
        expect(html).not.toContain('fort impact');
      } else {
        expect(html).toContain('medium or high impact');
        expect(html).not.toContain('high-impact fix');
      }
    }
  });
});

// Issue #330: a real report used hreflang, noindex, "balise canonique",
// Lighthouse, Open Graph, JSON-LD, INP and Chrome UX Report without
// defining any of them. Those terms now follow the rendered text.
describe('terms gated on the rendered report text (issue #330)', () => {
  const baseCtx = {
    findings: [],
    obligationAssessment: undefined,
    transactionalFlowEvaluated: false,
    hasMeasuredCoreWebVitals: false,
  };

  it('defines a technical term only when the rest of the report uses it', () => {
    const used = renderGlossary(getStrings('fr'), 13, {
      ...baseCtx,
      reportText: 'Ajoutez les balises hreflang et corrigez la balise canonique.',
    });
    expect(used).toContain('>hreflang<');
    expect(used).toContain('Balise canonique');
    expect(used).not.toContain('Open Graph');

    const unused = renderGlossary(getStrings('fr'), 13, { ...baseCtx, reportText: '' });
    expect(unused).not.toContain('>hreflang<');
    expect(unused).not.toContain('Balise canonique');
  });

  /** hotelchateauroyal.nc: an overseas-domain report cites no regime,
   *  authority or registry, yet its glossary defined the EAA, "la DGCCRF,
   *  l'autorité de contrôle du marché citée dans ce rapport", Sirene and the
   *  transactional flow examined "pour déterminer si l'EAA s'applique". */
  it('defines the legal vocabulary only when the report uses it', () => {
    const overseas = renderGlossary(getStrings('fr'), 13, {
      ...baseCtx,
      transactionalFlowEvaluated: true,
      reportText: 'Régime applicable à vérifier. Le numéro SIREN a été fourni manuellement.',
    });
    for (const term of ['>EAA<', '>DGCCRF<', '>Sirene<', 'Parcours transactionnel']) {
      expect(overseas).not.toContain(term);
    }

    const metropolitan = renderGlossary(getStrings('fr'), 13, {
      ...baseCtx,
      transactionalFlowEvaluated: true,
      reportText:
        "L'EAA s'applique probablement ; autorité : DGCCRF. Données du répertoire Sirene, « parcours transactionnel » vérifié.",
    });
    for (const term of ['>EAA<', '>DGCCRF<', '>Sirene<', 'Parcours transactionnel']) {
      expect(metropolitan).toContain(term);
    }
  });

  it('defines RGAA when the report cites it, even outside the article 47 route', () => {
    const html = renderGlossary(getStrings('en'), 13, {
      ...baseCtx,
      reportText: 'Mapped to RGAA criterion 1.1',
    });
    expect(html).toContain('RGAA');
  });

  it('reads visible text only, decoding escaped apostrophes', () => {
    expect(htmlToText('<p style="x">l&#39;attribut <b>noindex</b></p>')).toContain(
      "l'attribut  noindex",
    );
    expect(htmlToText('<style>.hreflang{}</style><p>ok</p>')).not.toContain('hreflang');
  });

  it.each(['fr', 'en'] as const)(
    'defines every gated term the full %s stress report prints',
    async (language) => {
      const fixture = buildStressFixture();
      const html = await renderHtml({
        ...fixture,
        analysis: { ...fixture.analysis, language },
        renderDiffEvidencePages: [],
      });
      const glossaryStart = html.indexOf('id="section-13"');
      expect(glossaryStart).toBeGreaterThan(0);
      const bodyText = htmlToText(html.slice(0, glossaryStart));
      const glossaryText = htmlToText(html.slice(glossaryStart));
      const checks: [RegExp, string][] = [
        [/\bhreflang\b/i, 'hreflang'],
        [/\bLighthouse\b/, 'Lighthouse'],
        [/\bChrome UX Report\b/, 'Chrome UX Report'],
      ];
      for (const [pattern, term] of checks) {
        if (pattern.test(bodyText)) expect(glossaryText).toContain(term);
      }
      expect(bodyText).toMatch(/\bLighthouse\b/);
    },
  );
});
