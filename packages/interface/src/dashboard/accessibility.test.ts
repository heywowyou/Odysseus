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
import { ATraiterPage } from './routes/a-traiter';
import { LoginPage } from './routes/login';
import { NewScanPage } from './routes/new-scan';
import { OutcomesPage } from './routes/outcomes';
import { ProspectDetailPage } from './routes/prospect-detail';
import { ProspectsPage } from './routes/prospects';
import { ScanProgressPage } from './routes/scan-progress';
import { SuppressionsPage } from './routes/suppressions';
import { ToolsPage } from './routes/tools';

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
      : createElement(
          Routes,
          null,
          createElement(Route, {
            path: route.pattern,
            // react-router declares no @types/react of its own, so its prop
            // types used to resolve through pnpm's virtual-store hoist,
            // where the 18 copy won and clashed with this file's 19 types
            // (issue #29). The packageExtensions pin in pnpm-workspace.yaml
            // anchors react-router to the same 19 types the dashboard
            // compiles against, so no cast belongs here: this line fails
            // loudly again if that anchor ever regresses.
            element: child,
          }),
        ),
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
    await settle(container, 'Aucun scan pour le moment');
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

  it('offers an explicit stop control for a running hotel pre-scan', async () => {
    stubRoutes({
      '/api/scans/job-hotel': {
        jobId: 'job-hotel',
        type: 'hotel-prescan',
        status: 'running',
        phase: 'prescanning',
        progress: { message: '12 hôtels pré-analysés' },
      },
    });
    const { container, root } = await renderPage(createElement(ScanProgressPage), {
      path: '/scans/job-hotel',
      pattern: 'scans/:jobId',
    });
    await settle(container, '12 hôtels pré-analysés');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Arrêter le scan',
      ),
    ).toBe(true);
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
        prescan: null,
        score: null,
        evidence: null,
        preview: null,
        contact: null,
        thread: null,
        outcomes: { rows: [], total: 0, limit: 50, offset: 0 },
        outreachScan: { canStart: false, refusal: 'not-selected' },
        outreachAudit: null,
        outreachScanJobId: null,
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

  it('hotel hub has no axe violations with every pipeline stage populated', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        auditId: 'audit-1',
        lifecycle: 'rendered',
      },
      '/api/prospects/cand-1': {
        candidateId: 'cand-1',
        resolutionVersion: 'v1',
        identityKey: 'key-1',
        identityStatus: 'resolved',
        matchedOn: null,
        siret: null,
        siren: null,
        name: 'Hôtel du Quai Exemple',
        commune: 'Grenoble',
        postcode: '38000',
        starRating: 3,
        roomCount: 42,
        capacity: 90,
        campaignEligibility: 'eligible',
        groupStatus: 'independent',
        groupDomain: null,
        groupSize: null,
        ownRegistrableDomain: 'exemple.fr',
        domainProvenance: 'declared',
        declaredRegistrableDomain: 'exemple.fr',
        reviewState: 'not-required',
        review: { queuedReason: null, actor: null, reason: null, decidedAt: null },
        qualificationOutcome: 'qualified',
        prescanStatus: 'complete',
        websites: [
          {
            raw: 'https://exemple.fr',
            kind: 'own-domain',
            hostname: 'exemple.fr',
            registrableDomain: 'exemple.fr',
            unusableReason: null,
          },
        ],
        conflicts: [],
        sourceRefs: [],
        qualification: {
          qualificationId: 'q-1',
          qualificationVersion: 'v3',
          domain: 'exemple.fr',
          outcome: 'qualified',
          reasons: ['three-stars-or-more'],
          notes: [],
          sireneStatus: 'active',
          effectifBandCode: '12',
          evaluatedAt: '2026-08-01T00:00:00.000Z',
        },
        qualificationHistory: { rows: [], total: 0, limit: 10, offset: 0 },
        prescan: {
          prescanId: 'prescan-1',
          name: 'Hôtel du Quai Exemple',
          commune: 'Grenoble',
          postcode: '38000',
          prescanVersion: 'v3',
          status: 'complete',
          domain: 'exemple.fr',
          startedAt: '2026-09-01T09:00:00.000Z',
          durationMs: 4200,
          robotsTxtFound: true,
          absentRoles: [],
          evidenceStatus: 'complete',
          pages: [
            {
              role: 'homepage',
              httpStatus: 200,
              missingPercent: 0,
              rawTextLength: 500,
              renderedTextLength: 900,
              consoleErrorCount: 0,
              axe: {
                violationCount: 2,
                byImpact: { critical: 0, serious: 1, moderate: 1, minor: 0 },
                affectedElementCount: 3,
                ruleIds: ['color-contrast'],
              },
              metrics: {
                largestContentfulPaintMs: 2100,
                cumulativeLayoutShift: 0.02,
                longTaskCount: 1,
                mainThreadBlockingMs: 220,
                requestCount: 24,
                transferBytes: 480000,
                thirdPartyRequestCount: 2,
                sizeUnavailableCount: 0,
                observationWindowMs: 8000,
              },
              bookingEvidenceKinds: ['checkout-form'],
              skippedByRobots: false,
              durationMs: 1400,
            },
          ],
        },
        score: {
          scoreId: 'score-1',
          candidateId: 'cand-1',
          name: 'Hôtel du Quai Exemple',
          commune: 'Grenoble',
          postcode: '38000',
          scoringVersion: 'hotel-outreach-v1',
          prescanId: 'prescan-1',
          computedAt: '2026-09-01T09:05:00.000Z',
          worthy: true,
          evidenceComplete: true,
          brokenness: { total: 4, components: [] },
          ability: { total: 12, components: [] },
        },
        evidence: {
          prescanId: 'prescan-1',
          name: 'Hôtel du Quai Exemple',
          commune: 'Grenoble',
          postcode: '38000',
          evidenceStatus: 'incomplete',
          renderComparison: { state: 'omitted', reason: 'homepage-unreachable' },
          specificFailure: { state: 'omitted', reason: 'no-failure-evidence' },
          summaries: [],
        },
        preview: {
          previewId: 'preview-1',
          name: 'Hôtel du Quai Exemple',
          commune: 'Grenoble',
          postcode: '38000',
          domain: 'exemple.fr',
          language: 'fr',
          status: 'live',
          publishedAt: '2026-09-01T09:00:00.000Z',
          publicExpiresAt: '2099-01-01T00:00:00.000Z',
          revokedAt: null,
          revokedReason: null,
          prescanVersion: null,
          evidenceVersion: null,
          previewContentVersion: 'v2',
          sourceKind: 'full-audit',
        },
        contact: null,
        thread: {
          threadId: 'thread-1',
          candidateId: 'cand-1',
          domain: 'exemple.fr',
          language: 'fr',
          languageSource: 'operator',
          currentTouch: 1,
          state: 'e1-drafted',
          stateEnteredAt: '2026-09-02T08:00:00.000Z',
          stateReason: null,
          touches: [],
          lastSyncedAt: null,
          needsReview: null,
          currentOutcome: null,
          drafts: [
            {
              draftId: 'draft-1',
              touch: 1,
              language: 'fr',
              status: 'created',
              touch1EvidenceSlot: null,
              failureReason: null,
              hasProviderDraft: true,
              createdAt: '2026-09-02T08:00:00.000Z',
              deletedAt: null,
              reviewOutcome: null,
              reviewedAt: null,
            },
          ],
        },
        outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
        outreachScan: { canStart: false, refusal: 'already-in-flight' },
        outreachAudit: {
          auditId: 'audit-1',
          startedAt: '2026-09-01T10:00:00.000Z',
          severityRollup: { critical: 0, serious: 1, moderate: 2, minor: 3 },
        },
        outreachScanJobId: null,
      },
    });
    const { container, root } = await renderPage(createElement(ProspectDetailPage), {
      path: '/prospects/cand-1',
      pattern: 'prospects/:candidateId',
    });
    await settle(container, 'Hôtel du Quai Exemple');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('a-traiter page has no axe violations in its empty state', async () => {
    // The scans inbox filter is the only list whose default empty-page stub
    // does not fit: the scans endpoint answers an array, not a page.
    stubRoutes({ '/api/scans?limit=200': [] });
    const { container, root } = await renderPage(createElement(ATraiterPage));
    await settle(container, 'Aucun brouillon en attente de revue.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('a-traiter page has no axe violations with every list populated', async () => {
    stubRoutes({
      '/api/outreach/drafts?limit=5': {
        rows: [
          {
            draftId: 'draft-1',
            threadId: 'thread-1',
            candidateId: 'cand-1',
            hotelName: 'Hôtel du Quai Exemple',
            touch: 1,
            language: 'fr',
            touch1EvidenceSlot: null,
            hasProviderDraft: true,
            createdAt: '2026-09-01T08:00:00.000Z',
          },
        ],
        total: 4,
        limit: 5,
        offset: 0,
      },
      '/api/outreach/replies?limit=5': {
        rows: [
          {
            threadId: 'thread-2',
            candidateId: 'cand-2',
            hotelName: null,
            domain: 'hotel-exemple.fr',
            language: 'fr',
            state: 'e1-sent',
            currentTouch: 1,
            reviewReason: 'unclassified-reply',
            reviewDetectedAt: '2026-09-02T08:00:00.000Z',
            lastSyncedAt: null,
          },
        ],
        total: 1,
        limit: 5,
        offset: 0,
      },
      '/api/prospects?queue=join-review': {
        rows: [
          {
            candidateId: 'cand-3',
            name: 'Hôtel de la Gare',
            commune: 'Grenoble',
            postcode: '38000',
            starRating: null,
            identityStatus: 'needs-review',
            groupStatus: 'independent',
            campaignEligibility: 'eligible',
            reviewState: 'pending',
            qualificationOutcome: 'not-evaluated',
            qualificationReasons: [],
            prescanStatus: null,
            scoringVersion: null,
            brokennessTotal: null,
            abilityTotal: null,
            worthy: null,
            contactState: null,
            threadState: null,
            outcome: null,
          },
        ],
        total: 2,
        limit: 5,
        offset: 0,
      },
      '/api/scans?limit=200': [
        {
          jobId: 'job-1',
          type: 'full-audit',
          status: 'failed',
          phase: 'report',
          siteUrl: 'https://exemple.fr',
          createdAt: '2026-09-01T10:00:00.000Z',
          auditId: 'audit-1',
        },
      ],
    });
    const { container, root } = await renderPage(createElement(ATraiterPage));
    await settle(container, 'Hôtel du Quai Exemple');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('suppression lookup form has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(SuppressionsPage));
    await settle(container, 'Vérifier');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('tools page has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(ToolsPage));
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
