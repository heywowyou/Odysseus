import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, Theme } from '@odysseus/core';
import { renderNextSteps } from './next-steps.js';
import { getStrings } from '../strings/i18n.js';
import {
  ODYSSEUS_CONTACT_EMAIL,
  ODYSSEUS_REAUDIT_LEAD_TIME_DAYS,
  ODYSSEUS_REAUDIT_PRICE_EUR_HT,
} from '../html-utils.js';
import { UNKNOWN_BUILD_ID } from '@odysseus/core';
import { buildLegacyPriority, type RenderedPriority } from '../rendered-priorities.js';

function fakeManifest(): AuditManifest {
  return {
    auditId: 'a1b2c3',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-17T00:00:00.000Z',
    finishedAt: '2026-08-17T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.5.2',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {} as AuditManifest['config'],
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 3,
      robotsTxtFound: false,
      effectiveDelayMs: 500,
    },
    pages: [],
  };
}

// Plan 018 step 7 fixtures: the deterministic coverage numbers must come
// from a RenderedPriority view, so the tests build small priorities whose
// expected counts are known by construction (3 priorities, 2 covering a
// critical or serious finding, 1 quick win; the EN variant adds a fourth).
function buildFinding(overrides: Partial<Finding> & { findingId: string }): Finding {
  return {
    auditId: 'a1b2c3',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: `Title ${overrides.findingId}`,
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: overrides.findingId,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildTheme(
  findingIds: string[],
  effort: Theme['effort'],
  impact: Theme['impact'],
  priorityRank: number,
): Theme {
  return {
    title: 'Contraste insuffisant',
    category: 'accessibility',
    businessImpact: 'Impact',
    effort,
    impact,
    priorityRank,
    findingIds,
    recommendedActions: ['Action'],
  };
}

function buildPriorities(
  specs: Array<{
    findingId: string;
    severity: Finding['severity'];
    effort: Theme['effort'];
    impact: Theme['impact'];
  }>,
): RenderedPriority[] {
  const byId = new Map(specs.map((spec) => [spec.findingId, buildFinding(spec)]));
  return specs.map((spec, index) =>
    buildLegacyPriority(
      buildTheme([spec.findingId], spec.effort, spec.impact, index + 1),
      index + 1,
      byId,
      'fr',
    ),
  );
}

// item 30 [REGRESSION]: the final page said requests could go "directement
// à l'équipe Odysseus" with no stated address - flagged once already on
// the haaitza pass and recurred.
describe('item 30: the contact page states a real, reachable contact address', () => {
  it('renders the code-owned contact email, not a vague pointer', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
  });

  it('renders the same email in English', () => {
    const html = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
  });
});

// item 31: no authorship, terms, or liability block anywhere in a paid
// deliverable that may be forwarded to counsel.
describe('item 31: authorship and liability block', () => {
  it('states the producer, generation date, tool version, and report ID', () => {
    const manifest = fakeManifest();
    const html = renderNextSteps(getStrings('fr'), 14, manifest, 'fr');
    expect(html).toContain('Odysseus');
    expect(html).toContain('0.5.2');
    expect(html).toContain('a1b2c3');
  });

  it('labels scan and render provenance separately', () => {
    const html = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en', {
      reportId: 'report-123',
      renderedAt: new Date('2026-08-29T00:00:00.000Z'),
      rendererBuild: 'render-abc',
      templateVersion: 2,
    });
    expect(html).toContain('render build render-abc');
    expect(html).toContain('template 2');
    expect(html).toContain('scan build 0.5.2');
    expect(html).toContain('report-123');
  });

  // Issue #58: readOdysseusBuildId falls back to the literal string
  // "unknown" whenever it cannot resolve a commit, which every render
  // inside the deployment image did. That word reached the client in the
  // provenance line, where it reads as a defect in the document. The copy
  // now drops the clause instead of naming a build it does not have.
  it('omits the render build clause rather than printing the unknown sentinel', () => {
    const html = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en', {
      reportId: 'report-123',
      renderedAt: new Date('2026-08-29T00:00:00.000Z'),
      rendererBuild: UNKNOWN_BUILD_ID,
      templateVersion: 2,
    });
    expect(html).not.toContain(UNKNOWN_BUILD_ID);
    expect(html).not.toContain('render build');
    // The template version is still known, so the parenthesis still earns
    // its place and the rest of the line is unchanged.
    expect(html).toContain('template 2');
    expect(html).toContain('report-123');
  });

  it('omits the scan build clause when the scan build is unknown, in French too', () => {
    const manifest = fakeManifest();
    const html = renderNextSteps(
      getStrings('fr'),
      14,
      { ...manifest, tool: { ...manifest.tool, odysseusVersion: UNKNOWN_BUILD_ID } },
      'fr',
      {
        reportId: 'report-123',
        renderedAt: new Date('2026-08-29T00:00:00.000Z'),
        rendererBuild: UNKNOWN_BUILD_ID,
        templateVersion: 2,
      },
    );
    expect(html).not.toContain(UNKNOWN_BUILD_ID);
    expect(html).not.toContain('build de scan');
    expect(html).not.toContain('build de rendu');
    // The sentence must still read as a sentence with both clauses gone.
    expect(html).toContain('Rapport produit par');
    expect(html).toContain('modèle 2');
  });

  it('states a limitation-of-liability sentence consistent with "report, don\'t conclude"', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain('ne saurait être tenu responsable');
    expect(html).toContain('Ce rapport');
  });

  it('falls back to the legacy template version and the audit ID without render metadata, in both languages', () => {
    for (const language of ['fr', 'en'] as const) {
      const html = renderNextSteps(getStrings(language), 14, fakeManifest(), language);
      expect(html).toContain('legacy');
      expect(html).toContain('a1b2c3');
    }
  });
});

// item 3.13: no issuer identity (legal entity, signatory, registration
// number) anywhere in the document - a professionalism and liability-
// exposure gap for a paid French deliverable.
//
// A3 (2026-08-24): the placeholder is filled with the real number, which
// is nine digits and therefore a SIREN. This asserts the label matches
// the number's actual length, so a future edit cannot relabel it "SIRET"
// without either supplying the five-digit NIC or failing here.
describe('item 3.13: issuer identity block', () => {
  it('states a signatory and a real registration number, correctly labelled for its length', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain('Jules Fontaine');
    expect(html).not.toContain('à renseigner');

    const match = html.match(/(SIREN|SIRET)\s*:\s*(\d+)/u);
    expect(match, 'no registration number rendered on the issuer line').not.toBeNull();
    const [, label, digits] = match!;
    expect(digits).toHaveLength(label === 'SIRET' ? 14 : 9);
  });
});

// item 3.12: the re-audit offer must state a price, a lead time, and a
// way to order it, and the figures must come from the code constants, so
// copy and price can never drift apart.
describe('item 3.12: re-audit pricing and lead time', () => {
  it('states an indicative price, a lead time, and the contact email to request one', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain('450');
    expect(html).toContain('5 jours ouvrés');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
  });

  it('renders the price and lead time from the code constants in both languages', () => {
    const fr = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    const en = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en');
    expect(fr).toContain(`${ODYSSEUS_REAUDIT_PRICE_EUR_HT} € HT`);
    expect(fr).toContain(`${ODYSSEUS_REAUDIT_LEAD_TIME_DAYS} jours ouvrés`);
    expect(en).toContain(`EUR ${ODYSSEUS_REAUDIT_PRICE_EUR_HT}`);
    expect(en).toContain(`${ODYSSEUS_REAUDIT_LEAD_TIME_DAYS} business days`);
  });

  it('renders no euro figure other than the constant price', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    const euroFigures = [...html.matchAll(/(\d+(?:[\u00A0 ]\d+)*)\s*€/gu)].map(
      (match) => match[1]!,
    );
    expect(euroFigures.length).toBeGreaterThan(0);
    for (const figure of euroFigures) {
      expect(Number.parseInt(figure, 10)).toBe(ODYSSEUS_REAUDIT_PRICE_EUR_HT);
    }
  });
});

// Plan 018 step 7: the section ends as one compact synthesis, not three
// equal sales cards, and never promises a conversion or revenue
// improvement - a client's own conversion rate is named strictly as their
// separate measurement.
describe('plan 018 step 7: the ending is a synthesis, not three sales cards', () => {
  it('renders no card grid', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).not.toContain('class="card elev-sm"');
    expect(html).not.toContain('grid-template-columns:1fr 1fr 1fr');
  });

  it('never promises a conversion or revenue improvement, and frames the conversion rate as a separate measurement', () => {
    for (const language of ['fr', 'en'] as const) {
      const html = renderNextSteps(getStrings(language), 14, fakeManifest(), language);
      expect(html).not.toMatch(
        /(augmentera|améliorera|augmenter vos|boosts?|increases?|improves?|more bookings|more revenue|grow your)/i,
      );
      expect(html).toMatch(/mesure distincte|separate measurement/i);
    }
  });

  it('renders the full synthesis structure in French: stake, counts, roles, re-audit timeframe, price, contact, provenance', () => {
    const priorities = buildPriorities([
      { findingId: 'f1', severity: 'critical', effort: 'low', impact: 'high' },
      { findingId: 'f2', severity: 'serious', effort: 'high', impact: 'medium' },
      { findingId: 'f3', severity: 'minor', effort: 'medium', impact: 'low' },
    ]);
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr', undefined, priorities);
    expect(html).toContain('section-14');
    expect(html).toContain('canal direct de réservation');
    expect(html).toContain(
      'Priorités classées : 3. Couvrant au moins un constat critique ou sérieux : 2. Gains rapides, faible complexité pour un impact moyen ou élevé : 1.',
    );
    expect(html).toContain('la direction');
    expect(html).toContain('le prestataire technique ou le service informatique');
    expect(html).toContain('la communication');
    expect(html).toContain('le juridique');
    expect(html).toContain('trois à six mois');
    expect(html).toContain(`${ODYSSEUS_REAUDIT_PRICE_EUR_HT} € HT`);
    expect(html).toContain('Une question ?');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
    expect(html).toContain('Rapport produit par');
    expect(html).toContain('a1b2c3');
    expect(html).toContain('ne saurait être tenu responsable');
  });

  it('renders the full synthesis structure in English with different deterministic counts', () => {
    const priorities = buildPriorities([
      { findingId: 'f1', severity: 'critical', effort: 'low', impact: 'high' },
      { findingId: 'f2', severity: 'serious', effort: 'high', impact: 'medium' },
      { findingId: 'f3', severity: 'minor', effort: 'medium', impact: 'low' },
      { findingId: 'f4', severity: 'serious', effort: 'low', impact: 'medium' },
    ]);
    const html = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en', undefined, priorities);
    expect(html).toContain('direct booking and information channel');
    expect(html).toContain(
      'Ranked priorities: 4. Covering at least one critical or serious finding: 3. Quick wins, low complexity for a medium or high impact: 2.',
    );
    expect(html).toContain('management');
    expect(html).toContain('technical provider or IT');
    expect(html).toContain('communications');
    expect(html).toContain('legal');
    expect(html).toContain('three to six months');
    expect(html).toContain(`EUR ${ODYSSEUS_REAUDIT_PRICE_EUR_HT}`);
    expect(html).toContain('Questions?');
    expect(html).toContain('Report produced by');
    expect(html).toContain('cannot be held liable');
  });

  it('falls back to a number-free coverage sentence when no priority view is supplied, in both languages', () => {
    const fr = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    const en = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en');
    expect(fr).toContain(
      'La répartition des constats par gravité figure plus haut dans ce rapport',
    );
    expect(fr).not.toContain('Priorités classées :');
    expect(en).toContain('The breakdown of findings by severity appears earlier in this report');
    expect(en).not.toContain('Ranked priorities:');
  });
});

// Plan 018 step 7: re-audit comparisons cover scanner-computable facts
// only. When the manifest carries no CrUX field data, the copy must not
// name field data that does not exist.
describe('plan 018 step 7: re-audit comparison copy follows CrUX availability', () => {
  it('names no field data when the manifest carries none', () => {
    const withoutFieldDataSentence = {
      fr: 'les constats par gravité et les critères WCAG 2.2 AA en échec',
      en: 'findings by severity and failed WCAG 2.2 AA criteria',
    } as const;
    for (const language of ['fr', 'en'] as const) {
      const html = renderNextSteps(getStrings(language), 14, fakeManifest(), language);
      expect(html).not.toMatch(/CrUX|Chrome UX|données réelles|real-user data|field data/i);
      expect(html).toContain(withoutFieldDataSentence[language]);
    }
  });

  it('names Chrome UX Report field data only when the manifest carries it', () => {
    const manifest = {
      ...fakeManifest(),
      cruxFieldData: { available: true, lcp: { p75: 2500 }, inp: { p75: 200 } },
    };
    for (const language of ['fr', 'en'] as const) {
      const html = renderNextSteps(getStrings(language), 14, manifest, language);
      expect(html).toContain('Chrome UX Report');
      expect(html).toMatch(
        /WCAG 2\.2 AA en échec et les données réelles|criteria, and Chrome UX Report real-user data/,
      );
    }
  });

  it('treats an explicit unavailable CrUX record like absent data', () => {
    const manifest = { ...fakeManifest(), cruxFieldData: { available: false } };
    const html = renderNextSteps(getStrings('fr'), 14, manifest, 'fr');
    expect(html).not.toMatch(/CrUX|Chrome UX|données réelles/i);
  });
});

// Interpolated facts (report ID, build names) must survive HTML escaping
// like every other template-owned string.
describe('plan 018 step 7: interpolated facts are HTML-escaped', () => {
  it('escapes hostile render metadata in the authorship line', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr', {
      reportId: '<script>alert("x")</script>',
      renderedAt: new Date('2026-08-29T00:00:00.000Z'),
      rendererBuild: 'render<&>',
      templateVersion: 2,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('render&lt;&amp;&gt;');
  });
});
