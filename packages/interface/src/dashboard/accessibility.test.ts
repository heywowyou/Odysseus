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
  return {
    rows: [],
    total: 0,
    limit: 50,
    offset: 0,
    selection: null,
    selectedCount: 0,
    catalogueTotal: 0,
  };
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

  it('prospects list selection overview has no axe violations while open', async () => {
    // Plan 043 slice 3: the read-only selection record (recent cohorts and
    // the active roster) inside the list page, rows present so the scanned
    // DOM is the populated table.
    stubRoutes({
      '/api/selection': {
        cohorts: [
          {
            cohortId: 'cohort-1',
            scoringVersion: 'hotel-outreach-v1',
            approved: true,
            computedAt: '2026-09-08T00:00:00.000Z',
            populationSize: 42,
            selectedCount: 6,
            abilityCutoff: 60,
            brokennessCutoff: 40,
          },
        ],
        roster: [
          {
            entryId: 'entry-1',
            wave: 'wave-1',
            candidateId: 'cand-7',
            domain: 'hotel-extra.fr',
            rank: null,
            scoringVersion: 'hotel-outreach-v1',
            actor: 'dashboard',
            decidedAt: '2026-09-09T00:00:00.000Z',
          },
        ],
      },
      '/api/prospects?': {
        rows: [
          {
            candidateId: 'cand-1',
            name: 'Hôtel Exemple',
            commune: 'Grenoble',
            postcode: '38000',
            starRating: null,
            identityStatus: 'resolved',
            groupStatus: 'independent',
            campaignEligibility: 'eligible',
            reviewState: 'not-required',
            qualificationOutcome: 'qualified',
            qualificationReasons: [],
            prescanStatus: null,
            scoringVersion: null,
            brokennessTotal: null,
            abilityTotal: null,
            worthy: null,
            contactState: null,
            threadState: null,
            outcome: null,
            inSelection: false,
            selectionSource: null,
            selectionRank: null,
          },
        ],
        total: 1,
        limit: 25,
        offset: 0,
        selection: null,
        selectedCount: 0,
        catalogueTotal: 1,
      },
    });
    const { container, root } = await renderPage(createElement(ProspectsPage));
    await settle(container, 'Hôtel Exemple');
    const toggle = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Voir la sélection',
    );
    expect(toggle).toBeDefined();
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await settle(container, 'Dernières sélections');
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
        qualificationFreshness: { state: 'missing' },
        prescanFreshness: { state: 'missing' },
        scoreFreshness: { state: 'missing' },
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
        qualificationFreshness: { state: 'missing' },
        prescanFreshness: { state: 'missing' },
        scoreFreshness: { state: 'missing' },
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

  it('hotel hub Audit tab has no axe violations with findings rendered and one expanded', async () => {
    // Plan 042 slice 2: the findings table moved into the hub. This scan
    // covers the state the audit page's own axe suite cannot see: the
    // findings inside the hub, behind the tab bar, with a row expanded.
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        auditId: 'audit-1',
        lifecycle: 'rendered',
        severityRollup: { critical: 0, serious: 1, moderate: 0, minor: 0 },
        findings: [
          {
            findingId: 'f001',
            auditId: 'audit-1',
            schemaVersion: 1,
            source: 'axe',
            ruleId: 'button-name',
            category: 'accessibility',
            severity: 'serious',
            wcagCriteria: ['4.1.2'],
            title: 'Buttons must have discernible text',
            description: 'The button has no accessible name.',
            pageUrls: ['https://exemple.fr/'],
            occurrences: 6,
            elements: [
              {
                pageUrl: 'https://exemple.fr/',
                selector: '#formulaire > button:nth-child(3)',
                snippet: '<button class="valider"></button>',
              },
            ],
            rawEvidence: {},
            dedupeKey: 'dedupe-1',
            firstSeenAt: '2026-09-01T10:00:00.000Z',
            lastSeenAt: '2026-09-01T10:00:00.000Z',
          },
        ],
        ruleCopy: {
          'button-name': {
            titleFr: 'Les boutons doivent avoir un texte explicite',
            glossFr: 'Un bouton sans texte lisible ne dit pas à quoi il sert.',
            remediationFr: 'Ajoutez un texte visible dans chaque bouton.',
            remediationEn: 'Add visible text inside every button.',
          },
        },
      },
      '/api/prospects/cand-1': {
        candidateId: 'cand-1',
        resolutionVersion: 'v1',
        identityKey: 'key-1',
        identityStatus: 'resolved',
        matchedOn: null,
        siret: null,
        siren: null,
        name: 'Hôtel Exemple',
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
        prescanStatus: null,
        websites: [],
        conflicts: [],
        sourceRefs: [],
        qualification: null,
        qualificationHistory: { rows: [], total: 0, limit: 10, offset: 0 },
        qualificationFreshness: { state: 'missing' },
        prescanFreshness: { state: 'missing' },
        scoreFreshness: { state: 'missing' },
        prescan: null,
        score: null,
        evidence: null,
        preview: null,
        contact: null,
        thread: null,
        outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
        outreachScan: { canStart: false, refusal: 'not-selected' },
        outreachAudit: {
          auditId: 'audit-1',
          startedAt: '2026-09-01T10:00:00.000Z',
          severityRollup: { critical: 0, serious: 1, moderate: 0, minor: 0 },
        },
        outreachScanJobId: null,
      },
    });
    const { container, root } = await renderPage(createElement(ProspectDetailPage), {
      path: '/prospects/cand-1',
      pattern: 'prospects/:candidateId',
    });
    await settle(container, 'Hôtel Exemple');
    // Switch to the Audit tab.
    const auditTab = [...container.querySelectorAll('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Audit'),
    ) as HTMLElement | undefined;
    expect(auditTab).toBeDefined();
    await act(async () => {
      auditTab?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await settle(container, 'Les boutons doivent avoir un texte explicite');
    await expectNoAxeViolations(container);
    // Expand the finding row, then scan the expanded state.
    const toggle = [...container.querySelectorAll('button')].find((button) =>
      (button.getAttribute('aria-label') ?? '').includes('Afficher le détail du constat'),
    );
    expect(toggle).toBeDefined();
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await settle(container, 'Ajoutez un texte visible dans chaque bouton.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('hotel hub Rapport client tab has no axe violations while active', async () => {
    // Plan 042 slice 3: the paid report chain relocated into the hub.
    // Plan 045 stage 3.2: the tab is visible whenever a full audit exists
    // (the fixture's outreachAudit), no longer gated on a recorded won
    // outcome; this fixture also keeps a won outcome to show both can
    // coexist.
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        auditId: 'audit-1',
        siteUrl: 'https://exemple.fr',
        startedAt: '2026-09-01T10:00:00.000Z',
        finishedAt: '2026-09-01T10:20:00.000Z',
        pagesVisited: 12,
        lifecycle: 'rendered',
        severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        findings: [],
        ruleCopy: {},
        reportLanguages: [],
        reports: [
          { language: 'fr', status: 'unverified', pdfAvailable: false },
          { language: 'en', status: 'unverified', pdfAvailable: false },
        ],
        approval: null,
        manualFields: null,
      },
      '/api/prospects/cand-1': {
        candidateId: 'cand-1',
        resolutionVersion: 'v1',
        identityKey: 'key-1',
        identityStatus: 'resolved',
        matchedOn: null,
        siret: null,
        siren: null,
        name: 'Hôtel Exemple',
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
        prescanStatus: null,
        websites: [],
        conflicts: [],
        sourceRefs: [],
        qualification: null,
        qualificationHistory: { rows: [], total: 0, limit: 10, offset: 0 },
        qualificationFreshness: { state: 'missing' },
        prescanFreshness: { state: 'missing' },
        scoreFreshness: { state: 'missing' },
        prescan: null,
        score: null,
        evidence: null,
        preview: null,
        contact: null,
        thread: null,
        outcomes: {
          rows: [
            {
              outcomeId: 'o-1',
              outcome: 'won',
              lostReason: null,
              actor: 'operator',
              recordedAt: '2026-09-05T08:00:00.000Z',
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        },
        outreachScan: { canStart: false, refusal: 'not-selected' },
        outreachAudit: {
          auditId: 'audit-1',
          startedAt: '2026-09-01T10:00:00.000Z',
          severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        },
        outreachScanJobId: null,
      },
    });
    const { container, root } = await renderPage(createElement(ProspectDetailPage), {
      path: '/prospects/cand-1',
      pattern: 'prospects/:candidateId',
    });
    await settle(container, 'Hôtel Exemple');
    const reportTab = [...container.querySelectorAll('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('Rapport client'),
    ) as HTMLElement | undefined;
    expect(reportTab).toBeDefined();
    await act(async () => {
      reportTab?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    // The panel's own description proves the section mounted.
    await settle(
      container,
      'Chaque action reste visible : elle est grisée avec sa raison quand elle n’est pas encore disponible.',
    );
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('a-traiter page has no axe violations in its empty state', async () => {
    stubRoutes({ '/api/todo': { rows: [] } });
    const { container, root } = await renderPage(createElement(ATraiterPage));
    await settle(container, 'Rien n’attend de décision.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('a-traiter page has no axe violations with the table populated', async () => {
    stubRoutes({
      '/api/todo': {
        rows: [
          {
            kind: 'draft',
            subject: 'Hôtel du Quai Exemple',
            action: 'review-draft',
            href: '/prospects/cand-1#hub-emails',
            since: '2026-09-01T08:00:00.000Z',
          },
          {
            kind: 'reply',
            subject: 'cand-2',
            action: 'review-reply',
            href: '/prospects/cand-2#hub-outcome',
            since: '2026-09-02T08:00:00.000Z',
          },
          {
            kind: 'hotel',
            subject: 'Hôtel de la Gare',
            action: 'review-hotel',
            href: '/prospects/cand-3',
            since: null,
          },
          {
            kind: 'audit',
            subject: 'exemple.fr',
            action: 'generate-pdfs',
            href: '/audits/audit-1',
            since: '2026-09-01T10:00:00.000Z',
          },
        ],
      },
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
