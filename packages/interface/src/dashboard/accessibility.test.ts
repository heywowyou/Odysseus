// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { I18nProvider } from './i18n/provider';
import { AuditDetailPage } from './routes/audit-detail';
import { AuditsPage } from './routes/audits';
import { DraftsPage } from './routes/drafts';
import { EvidencePage } from './routes/evidence';
import { LoginPage } from './routes/login';
import { NewScanPage } from './routes/new-scan';
import { OutreachIndexPage } from './routes/outreach-index';
import { OutcomesPage } from './routes/outcomes';
import { PrescanPage } from './routes/prescan';
import { PreviewPage } from './routes/preview';
import { ProspectDetailPage } from './routes/prospect-detail';
import { ProspectsPage } from './routes/prospects';
import { RepliesPage } from './routes/replies';
import { ScanProgressPage } from './routes/scan-progress';
import { ScorePage } from './routes/score';
import { SuppressionsPage } from './routes/suppressions';
import { VendorsPage } from './routes/vendors';

/** Plan 013 step 5, extended by plan 022 step 6: axe must report zero
 *  violations on every dashboard route. The pages render through the real
 *  providers; list pages see a stubbed fetch returning an empty page and
 *  detail pages a minimal real document, so the scanned DOM is the settled,
 *  populated chrome including each route's own empty state. Keyboard
 *  operation, focus visibility at real contrast, and narrow-width table
 *  behaviour stay with the operator's manual checklist and the live
 *  review - jsdom cannot measure them. The file stays .ts with
 *  createElement because the workspace vitest glob only collects .ts
 *  suites. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function withProviders(
  child: React.ReactElement,
  route: { path: string; pattern: string } | undefined,
): React.ReactElement {
  const router = createElement(
    MemoryRouter,
    route === undefined ? null : { initialEntries: [route.path] },
    route === undefined
      ? child
      : createElement(Routes, null, createElement(Route, { path: route.pattern, element: child })),
  );
  return createElement(I18nProvider, null, router);
}

function emptyPage(): unknown {
  return { rows: [], total: 0, limit: 50, offset: 0 };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function notFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'not found' }),
  } as unknown as Response;
}

/** Replaces the default empty-page stub with per-URL bodies: detail routes
 *  need a real document so the scanned DOM is the populated page chrome, and
 *  a null body answers 404 so the page renders its dedicated not-found or
 *  error state instead of hanging in a skeleton. */
function stubRoutes(table: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const pattern = Object.keys(table).find((candidate) => url.includes(candidate));
      if (pattern === undefined) return jsonResponse(emptyPage());
      const body = table[pattern];
      return body === null ? notFoundResponse() : jsonResponse(body);
    }),
  );
}

async function renderPage(
  element: React.ReactElement,
  route?: { path: string; pattern: string },
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(withProviders(element, route));
  });
  return { container, root };
}

/** Resolves once the container shows the expected settled text or the
 *  budget runs out, so a slow polling fetch cannot race the scan. */
async function settle(container: HTMLElement, expected: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (container.textContent?.includes(expected)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error(`Page did not settle on the expected text: ${expected}`);
}

/** vitest-axe's shipped expect extension is missing its compiled entry
 *  point, so the assertion is spelled out: fail with the violation ids
 *  and help text, pass on an empty list. */
async function expectNoAxeViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  const summary = (results.violations ?? [])
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join('; ');
  expect(summary, summary).toBe('');
}

describe('operator page accessibility (plan 013 step 5, extended plan 022 step 6)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(emptyPage())),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('login page has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(LoginPage));
    await settle(container, 'Connexion');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('audits list has no axe violations in its loaded empty state', async () => {
    stubRoutes({ '/api/scans?limit=200': [] });
    const { container, root } = await renderPage(createElement(AuditsPage));
    await settle(container, 'Aucune analyse pour le moment');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('audit detail has no axe violations with an empty audit and an unreadable preparation', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        auditId: 'audit-1',
        siteUrl: 'https://exemple.fr',
        startedAt: '2026-09-01T10:00:00.000Z',
        finishedAt: '2026-09-01T10:20:00.000Z',
        pagesVisited: 12,
        severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        findings: [],
        reportLanguages: [],
        reports: [],
        lifecycle: 'scanned',
        approval: null,
        manualFields: null,
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), {
      path: '/audits/audit-1',
      pattern: 'audits/:auditId',
    });
    await settle(container, 'exemple.fr');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('new scan form has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(NewScanPage));
    await settle(container, 'Nouveau scan');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('scan progress has no axe violations while a job is running', async () => {
    stubRoutes({
      '/api/scans/job-1': {
        jobId: 'job-1',
        type: 'full-audit',
        status: 'running',
        phase: 'crawl',
        progress: { crawl: { visited: 3, target: 12 } },
      },
    });
    const { container, root } = await renderPage(createElement(ScanProgressPage), {
      path: '/scans/job-1',
      pattern: 'scans/:jobId',
    });
    await settle(container, 'Exploration du site');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('prospects list has no axe violations in its empty state', async () => {
    const { container, root } = await renderPage(createElement(ProspectsPage));
    await settle(container, 'Aucun prospect ne correspond à ces filtres.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('prospect detail has no axe violations with an empty record', async () => {
    stubRoutes({
      '/api/prospects/cand-1': {
        candidateId: 'cand-1',
        resolutionVersion: 'v1',
        identityKey: 'key-1',
        identityStatus: 'resolved',
        matchedOn: null,
        siret: null,
        siren: null,
        name: 'Hôtel Exemple',
        commune: null,
        postcode: null,
        starRating: null,
        roomCount: null,
        capacity: null,
        campaignEligibility: 'eligible',
        groupStatus: 'independent',
        groupDomain: null,
        groupSize: null,
        ownRegistrableDomain: 'exemple.fr',
        domainProvenance: null,
        declaredRegistrableDomain: null,
        reviewState: 'not-required',
        review: { queuedReason: null, actor: null, reason: null, decidedAt: null },
        qualificationOutcome: 'qualified',
        prescanStatus: null,
        websites: [],
        conflicts: [],
        sourceRefs: [],
        qualification: null,
        qualificationHistory: { rows: [], total: 0, limit: 50, offset: 0 },
        contact: null,
        thread: null,
        outcomes: { rows: [], total: 0, limit: 50, offset: 0 },
      },
    });
    const { container, root } = await renderPage(createElement(ProspectDetailPage), {
      path: '/prospects/cand-1',
      pattern: 'prospects/:candidateId',
    });
    await settle(container, 'Hôtel Exemple');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('prescan page has no axe violations with no captured pages', async () => {
    stubRoutes({
      '/api/prospects/cand-1/prescan': {
        prescanId: 'prescan-1',
        prescanVersion: 'v1',
        status: 'complete',
        domain: 'exemple.fr',
        startedAt: '2026-09-01T09:00:00.000Z',
        durationMs: 4200,
        robotsTxtFound: true,
        absentRoles: [],
        evidenceStatus: 'complete',
        pages: [],
      },
    });
    const { container, root } = await renderPage(createElement(PrescanPage), {
      path: '/prospects/cand-1/prescan',
      pattern: 'prospects/:candidateId/prescan',
    });
    await settle(container, 'Pré-scan');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('score page has no axe violations with an empty breakdown', async () => {
    stubRoutes({
      '/api/prospects/cand-1/score/diff': {
        candidateId: 'cand-1',
        fromVersion: 'v1',
        toVersion: 'v1',
        from: null,
        to: null,
        brokennessDelta: null,
        abilityDelta: null,
      },
      '/api/prospects/cand-1/score': {
        scoreId: 'score-1',
        candidateId: 'cand-1',
        scoringVersion: 'v1',
        prescanId: 'prescan-1',
        computedAt: '2026-09-01T09:05:00.000Z',
        worthy: true,
        evidenceComplete: true,
        brokenness: { total: 0, components: [] },
        ability: { total: 0, components: [] },
      },
    });
    const { container, root } = await renderPage(createElement(ScorePage), {
      path: '/prospects/cand-1/score',
      pattern: 'prospects/:candidateId/score',
    });
    await settle(container, 'Décomposition');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('evidence page has no axe violations with omitted assets', async () => {
    stubRoutes({
      '/api/prospects/cand-1/evidence': {
        prescanId: 'prescan-1',
        evidenceStatus: 'incomplete',
        renderComparison: { state: 'omitted', reason: 'homepage-unreachable' },
        specificFailure: { state: 'omitted', reason: 'no-failure-evidence' },
        summaries: [],
      },
    });
    const { container, root } = await renderPage(createElement(EvidencePage), {
      path: '/prospects/cand-1/evidence',
      pattern: 'prospects/:candidateId/evidence',
    });
    await settle(container, 'Preuves');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('preview page has no axe violations while the preview is live', async () => {
    stubRoutes({
      '/api/prospects/cand-1/preview': {
        previewId: 'preview-1',
        domain: 'exemple.fr',
        language: 'fr',
        status: 'live',
        publishedAt: '2026-09-01T09:00:00.000Z',
        publicExpiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        revokedReason: null,
        prescanVersion: 'v1',
        evidenceVersion: 'v1',
        previewContentVersion: 'v1',
      },
    });
    const { container, root } = await renderPage(createElement(PreviewPage), {
      path: '/prospects/cand-1/preview',
      pattern: 'prospects/:candidateId/preview',
    });
    await settle(container, 'Aperçu');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('vendors page has no axe violations in its empty state', async () => {
    stubRoutes({
      '/api/vendors': {
        prescanVersion: 'v1',
        prescansRead: 0,
        minimumGroupSize: 3,
        bookingHosts: [],
        bookingMechanisms: [],
        failureRules: [],
      },
    });
    const { container, root } = await renderPage(createElement(VendorsPage));
    await settle(container, 'Aucune donnée de serveur');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('outreach hub has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(OutreachIndexPage));
    await settle(container, 'Brouillons');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('drafts review page has no axe violations in its empty state', async () => {
    const { container, root } = await renderPage(createElement(DraftsPage));
    await settle(container, 'Aucun brouillon en attente de revue.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('replies page has no axe violations in its empty state', async () => {
    stubRoutes({ '/api/outreach/replies': { rows: [], total: 0, limit: 50, offset: 0 } });
    const { container, root } = await renderPage(createElement(RepliesPage));
    await settle(container, 'Aucune réponse en attente');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('suppression lookup form has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(SuppressionsPage));
    await settle(container, 'Vérifier');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('outcomes page has no axe violations in its empty state', async () => {
    stubRoutes({
      '/api/outreach/outcomes': {
        summary: { total: 0, byOutcome: {}, byLostReason: {} },
        rows: [],
        total: 0,
        limit: 50,
        offset: 0,
      },
    });
    const { container, root } = await renderPage(createElement(OutcomesPage));
    await settle(container, 'Aucun résultat enregistré');
    await expectNoAxeViolations(container);
    root.unmount();
  });
});
