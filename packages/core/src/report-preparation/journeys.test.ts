import { describe, expect, it } from 'vitest';
import {
  JOURNEY_CATALOGUE,
  resolveConfirmedJourneys,
  resolveJourney,
  suggestJourneys,
} from './journeys.js';
import type { JourneyDecision } from './preparation.js';
import { buildFinding, buildManifest, buildPage } from './test-fixtures.js';
import type { AuditManifest } from '../types/manifest.js';

function manifestWith(
  pages: Parameters<typeof buildManifest>[0],
  overrides: Partial<AuditManifest> = {},
): AuditManifest {
  return buildManifest(pages, overrides);
}

const homepage = buildPage('https://site.example/');
const chambres = buildPage('https://site.example/chambres', { depth: 1 });
const reservation = buildPage('https://site.example/reservation', { depth: 1 });

const transactionalSignals = {
  hasTransactionalFlow: true,
  transactionalFlowEvidence: [
    {
      kind: 'booking-engine-script' as const,
      selector: '#booking',
      pageUrl: 'https://site.example/reservation',
      detail: 'booking script detected',
    },
  ],
};

describe('suggestJourneys', () => {
  it('suggests discovery from covered pages and excludes transaction without flow evidence', () => {
    const suggestions = suggestJourneys({
      manifest: manifestWith([homepage, chambres]),
      findings: [],
    });
    expect(suggestions).toEqual([
      { journeyId: 'discovery-navigation', available: true },
      { journeyId: 'transaction-booking', available: false, reason: 'no-transactional-flow' },
    ]);
  });

  it('requires transactional-flow evidence and a visited transactional page', () => {
    const withoutVisit = manifestWith([homepage], {
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [
          {
            kind: 'booking-engine-script' as const,
            selector: '#booking',
            pageUrl: 'https://site.example/reserver',
            detail: 'booking script detected',
          },
        ],
      },
    });
    expect(suggestJourneys({ manifest: withoutVisit, findings: [] })).toContainEqual({
      journeyId: 'transaction-booking',
      available: false,
      reason: 'no-transactional-page-visited',
    });

    const withVisit = manifestWith([homepage, reservation], { siteSignals: transactionalSignals });
    expect(suggestJourneys({ manifest: withVisit, findings: [] })).toContainEqual({
      journeyId: 'transaction-booking',
      available: true,
    });
  });

  it('excludes every journey when the evidence is unavailable', () => {
    expect(suggestJourneys(null)).toEqual([
      { journeyId: 'discovery-navigation', available: false, reason: 'evidence-unavailable' },
      { journeyId: 'transaction-booking', available: false, reason: 'evidence-unavailable' },
    ]);
  });

  it('excludes discovery when nothing was visited', () => {
    const nothingVisited = manifestWith([
      buildPage('https://site.example/sitemap', { status: 'skipped-robots' }),
    ]);
    expect(suggestJourneys({ manifest: nothingVisited, findings: [] })).toContainEqual({
      journeyId: 'discovery-navigation',
      available: false,
      reason: 'no-visited-pages',
    });
  });
});

describe('resolveJourney step states', () => {
  it('reports an observed issue when the detector found one in scope', () => {
    const findings = [
      buildFinding({
        source: 'renderdiff',
        category: 'rendering',
        severity: 'moderate',
        pageUrls: ['https://site.example/'],
      }),
    ];
    const resolved = resolveJourney(
      { manifest: manifestWith([homepage, chambres]), findings },
      'discovery-navigation',
    );
    expect(resolved?.steps.find((step) => step.stepId === 'arrival-page')).toEqual({
      stepId: 'arrival-page',
      state: 'issue-observed',
    });
  });

  it('reports no issue detected only when the detector ran successfully everywhere in scope', () => {
    const resolved = resolveJourney(
      { manifest: manifestWith([homepage, chambres]), findings: [] },
      'discovery-navigation',
    );
    for (const step of resolved?.steps ?? []) {
      expect(step.state).toBe('no-issue-detected');
      expect(step.notEvaluatedReason).toBeUndefined();
    }
  });

  it('never yields no issue detected when a detector failed on a scoped page', () => {
    const pages = [
      homepage,
      buildPage('https://site.example/contact', { depth: 1, errors: { axe: 'axe crashed' } }),
    ];
    const resolved = resolveJourney(
      { manifest: manifestWith(pages), findings: [] },
      'discovery-navigation',
    );
    const mainPages = resolved?.steps.find((step) => step.stepId === 'main-pages');
    expect(mainPages).toEqual({
      stepId: 'main-pages',
      state: 'not-evaluated',
      notEvaluatedReason: 'detector-failed',
    });
  });

  it('never yields no issue detected when render evidence is absent', () => {
    const noRenderEvidence = buildPage('https://site.example/');
    delete noRenderEvidence.renderDiffMissingPercent;
    const resolved = resolveJourney(
      { manifest: manifestWith([noRenderEvidence]), findings: [] },
      'discovery-navigation',
    );
    expect(resolved?.steps.find((step) => step.stepId === 'arrival-page')).toEqual({
      stepId: 'arrival-page',
      state: 'not-evaluated',
      notEvaluatedReason: 'detector-absent',
    });
  });

  it('yields not evaluated with no page in scope for booking steps without transactional pages', () => {
    const resolved = resolveJourney(
      { manifest: manifestWith([homepage]), findings: [] },
      'transaction-booking',
    );
    expect(resolved).toBeNull();
  });

  it('scopes booking steps to the visited transactional pages', () => {
    const findings = [
      buildFinding({
        source: 'axe',
        category: 'accessibility',
        severity: 'moderate',
        pageUrls: ['https://site.example/'],
      }),
    ];
    const resolved = resolveJourney(
      {
        manifest: manifestWith([homepage, reservation], { siteSignals: transactionalSignals }),
        findings,
      },
      'transaction-booking',
    );
    // The homepage axe finding is out of scope for the booking journey, and
    // both booking steps ran cleanly on the reservation page.
    expect(resolved?.steps).toEqual([
      { stepId: 'booking-page', state: 'no-issue-detected' },
      { stepId: 'booking-form', state: 'no-issue-detected' },
    ]);
  });

  it('resolves an issue observed on the booking page from render-diff findings', () => {
    const findings = [
      buildFinding({
        source: 'renderdiff',
        category: 'rendering',
        severity: 'moderate',
        pageUrls: ['https://site.example/reservation'],
      }),
    ];
    const resolved = resolveJourney(
      {
        manifest: manifestWith([homepage, reservation], { siteSignals: transactionalSignals }),
        findings,
      },
      'transaction-booking',
    );
    expect(resolved?.steps.find((step) => step.stepId === 'booking-page')?.state).toBe(
      'issue-observed',
    );
  });

  it('prefers the site URL as the arrival page and falls back to the shallowest visited page', () => {
    const noHomepage = manifestWith([
      buildPage('https://site.example/b', { depth: 2 }),
      buildPage('https://site.example/a', { depth: 1 }),
    ]);
    const resolved = resolveJourney({ manifest: noHomepage, findings: [] }, 'discovery-navigation');
    const findings = [
      buildFinding({
        source: 'renderdiff',
        category: 'rendering',
        severity: 'minor',
        pageUrls: ['https://site.example/a'],
      }),
    ];
    const resolvedWithFinding = resolveJourney(
      { manifest: noHomepage, findings },
      'discovery-navigation',
    );
    expect(resolved?.steps.find((step) => step.stepId === 'arrival-page')?.state).toBe(
      'no-issue-detected',
    );
    expect(resolvedWithFinding?.steps.find((step) => step.stepId === 'arrival-page')?.state).toBe(
      'issue-observed',
    );
  });
});

describe('resolveConfirmedJourneys', () => {
  const confirmedDiscovery: JourneyDecision[] = [
    { journeyId: 'discovery-navigation', decision: 'confirmed' },
  ];

  it('renders only the confirmed journeys, resolved from current evidence', () => {
    const resolution = resolveConfirmedJourneys(
      {
        manifest: manifestWith([homepage, reservation], { siteSignals: transactionalSignals }),
        findings: [],
      },
      [...confirmedDiscovery, { journeyId: 'transaction-booking', decision: 'removed' }],
    );
    expect(resolution.confirmed.map((journey) => journey.journeyId)).toEqual([
      'discovery-navigation',
    ]);
  });

  it('never lets a stored confirmation create a journey the evidence excludes', () => {
    const resolution = resolveConfirmedJourneys(
      { manifest: manifestWith([homepage]), findings: [] },
      [...confirmedDiscovery, { journeyId: 'transaction-booking', decision: 'confirmed' }],
    );
    expect(resolution.confirmed.map((journey) => journey.journeyId)).toEqual([
      'discovery-navigation',
    ]);
    expect(resolution.excluded).toEqual([
      { journeyId: 'transaction-booking', reason: 'no-transactional-flow' },
    ]);
  });

  it('excludes confirmed journeys when the evidence itself is unavailable', () => {
    const resolution = resolveConfirmedJourneys(null, confirmedDiscovery);
    expect(resolution.confirmed).toEqual([]);
    expect(resolution.excluded).toEqual([
      { journeyId: 'discovery-navigation', reason: 'evidence-unavailable' },
    ]);
  });

  it('keeps unconfirmed journeys out of both confirmed and exclusion lists', () => {
    const resolution = resolveConfirmedJourneys(
      { manifest: manifestWith([homepage]), findings: [] },
      [],
    );
    expect(resolution.confirmed).toEqual([]);
    expect(resolution.excluded).toEqual([]);
  });
});

describe('journey catalogue', () => {
  it('stays closed and keeps every step on a detector with success evidence', () => {
    expect(JOURNEY_CATALOGUE.map((journey) => journey.journeyId)).toEqual([
      'discovery-navigation',
      'transaction-booking',
    ]);
    for (const journey of JOURNEY_CATALOGUE) {
      for (const step of journey.steps) {
        expect(['axe', 'render-diff']).toContain(step.detector);
      }
    }
  });
});
