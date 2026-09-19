// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { AuditDetailPage } from './audit-detail';
import { AuditsPage } from './audits';

/** Issue #90 (extended by #91 and #93): the audit pages render the states
 *  the API can hand them. The same createElement discipline as
 *  accessibility.test.ts: the workspace vitest glob only collects .ts
 *  suites, so no JSX here. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDENTITY_ERROR =
  'Report generation aborted: the client identity on the cover is still a detected guess.';

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

/** Plan 061: every GET /api/scans row carries its server capabilities. */
const FINISHED_ROW_CAPABILITIES = {
  cancel: { state: 'blocked', stateToken: 't-cancel', reasonCode: 'already-terminal' },
  delete: { state: 'available', stateToken: 't-delete' },
};

function stubRoutes(table: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const pattern = Object.keys(table).find((candidate) => url.includes(candidate));
      if (pattern === undefined) return jsonResponse({});
      const body = table[pattern];
      // A null body means the endpoint answers 404, so the page renders
      // its dedicated unavailable state, the same stub language as
      // accessibility.test.ts.
      return body === null ? notFoundResponse() : jsonResponse(body);
    }),
  );
}

async function renderPage(
  element: React.ReactElement,
  initialPath?: string,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // Detail pages read their route param, so they mount behind a Route;
  // list pages render as the router's bare child.
  const router =
    initialPath === undefined
      ? element
      : createElement(Routes, null, createElement(Route, { path: 'audits/:auditId', element }));
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(
          MemoryRouter,
          initialPath === undefined ? null : { initialEntries: [initialPath] },
          router,
        ),
      ),
    );
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
  throw new Error(
    `Page did not settle on the expected text: ${expected}\nActual: ${container.textContent?.slice(0, 600)}`,
  );
}

const emptyAudit = {
  auditId: 'audit-1',
  siteUrl: 'https://exemple.fr',
  startedAt: '2026-09-01T10:00:00.000Z',
  finishedAt: '2026-09-01T10:20:00.000Z',
  pagesVisited: 12,
  severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
  findings: [],
  reportLanguages: [],
  reports: [
    { language: 'fr', status: 'unverified', pdfAvailable: false },
    { language: 'en', status: 'unverified', pdfAvailable: false },
  ],
  lifecycle: 'scanned',
  analysisPair: 'none',
  analysisLanguages: [],
  findingsStale: false,
  approval: null,
  manualFields: null,
};

/** A minimal report-preparation view (plan 019 contract): nothing filled
 *  in, no warnings, no writing candidate. Tests override one field at a
 *  time. */
function preparationView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const previewLanguage = (language: string): Record<string, unknown> => ({
    language,
    coverQuestion: { value: 'Question de couverture', source: 'fallback' },
    hook: { family: 'family', value: 'value', evidenceUnavailable: true },
  });
  return {
    preparation: {
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    preview: {
      fr: previewLanguage('fr'),
      en: previewLanguage('en'),
      warnings: [],
      warningDigest: 'digest-1',
    },
    regenerationInFlight: false,
    ...overrides,
  };
}

describe('audits list prospect link', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the prospect link while the row keeps opening the audit', async () => {
    stubRoutes({
      '/api/scans?limit=200': [
        {
          jobId: 'job-1',
          type: 'outreach-full-scan',
          status: 'complete',
          outcomeCode: 'complete',
          phase: 'complete',
          siteUrl: 'https://exemple.fr',
          createdAt: '2026-09-05T13:09:00.000Z',
          capabilities: FINISHED_ROW_CAPABILITIES,
          auditId: 'audit-1',
          prospectId: 'prospect-1',
        },
      ],
    });
    const { container, root } = await renderPage(createElement(AuditsPage));
    await settle(container, 'exemple.fr');
    const prospectLink = [...container.querySelectorAll('a')].find((link) =>
      link.textContent?.includes('Prospects'),
    );
    expect(prospectLink).toBeDefined();
    expect(prospectLink?.getAttribute('href')).toContain('/prospects/prospect-1');
    // The row's own link still opens the audit.
    const siteLink = [...container.querySelectorAll('a')].find((link) =>
      link.textContent?.includes('exemple.fr'),
    );
    expect(siteLink?.getAttribute('href')).toContain('/audits/audit-1');
    root.unmount();
  });
});

describe('audits header KPIs (issue #269)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('omits the aggregate critical-problems count', async () => {
    stubRoutes({
      '/api/scans?limit=200': [
        {
          jobId: 'job-1',
          type: 'full-audit',
          status: 'complete',
          outcomeCode: 'complete',
          phase: 'complete',
          siteUrl: 'https://exemple.fr',
          createdAt: '2026-09-05T13:09:00.000Z',
          capabilities: FINISHED_ROW_CAPABILITIES,
          auditId: 'audit-1',
          severityRollup: { critical: 4, serious: 0, moderate: 0, minor: 0 },
        },
      ],
    });
    const { container, root } = await renderPage(createElement(AuditsPage));
    await settle(container, 'exemple.fr');

    expect(container.textContent).toContain('Terminés');
    expect(container.textContent).not.toContain('Problèmes critiques');
    root.unmount();
  });
});

describe('audits list report-stage failure display (issues #90, #382, #386)', () => {
  beforeEach(() => {
    stubRoutes({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('reads Rapport à corriger, not Échoué or Action requise, when only the report failed', async () => {
    stubRoutes({
      '/api/scans?limit=200': [
        {
          jobId: 'job-1',
          type: 'full-audit',
          status: 'failed',
          outcomeCode: 'report-issue',
          phase: 'failed',
          failedPhase: 'report-fr',
          siteUrl: 'https://exemple.fr',
          createdAt: '2026-09-05T13:09:00.000Z',
          capabilities: FINISHED_ROW_CAPABILITIES,
          auditId: 'audit-1',
        },
        {
          jobId: 'job-2',
          type: 'full-audit',
          status: 'failed',
          outcomeCode: 'failed',
          phase: 'failed',
          failedPhase: 'crawl',
          siteUrl: 'https://autre.fr',
          createdAt: '2026-09-05T12:09:00.000Z',
          capabilities: FINISHED_ROW_CAPABILITIES,
        },
      ],
    });
    const { container, root } = await renderPage(createElement(AuditsPage));
    await settle(container, 'exemple.fr');
    // Assert inside the table: the status filter select carries every
    // status label as an option, so the whole-document text cannot
    // discriminate.
    const rows = [...container.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '');
    const reportRow = rows.find((text) => text.includes('exemple.fr')) ?? '';
    const crawlRow = rows.find((text) => text.includes('autre.fr')) ?? '';
    expect(reportRow).toContain('Rapport à corriger');
    expect(reportRow).not.toContain('Échoué');
    expect(reportRow).not.toContain('Action requise');
    expect(crawlRow).toContain('Échoué');
    const kpis = container.querySelector('dl')?.textContent ?? '';
    expect(kpis).toContain('Action requise0');
    expect(kpis).toContain('Rapports à corriger1');
    expect(kpis).toContain('Échecs1');
    root.unmount();
  });
});

describe('audit detail report-stage failure card (issue #90)', () => {
  beforeEach(() => {
    stubRoutes({ '/api/audits/audit-1/report-preparation': null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('surfaces the stored reason and links the identity gate to the hotel fields', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...emptyAudit,
        failure: {
          jobId: 'job-1',
          status: 'needs-input',
          error: IDENTITY_ERROR,
          needsInputFields: [
            { field: 'nomCommercial', value: 'Site Officiel' },
            { field: 'raisonSociale', value: 'L’ESPRIT DU SUD' },
          ],
        },
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Le rapport n’a pas pu être généré');
    // The pipeline's own message is shown verbatim.
    expect(container.textContent).toContain(IDENTITY_ERROR);
    // The typed case names the awaited fields and links to the job row.
    expect(container.textContent).toContain('Site Officiel');
    expect(container.querySelector('a[href="/scans/job-1"]')?.textContent).toContain(
      'Voir le détail du scan',
    );
    // Plan 040 slice 5: the card carries no regenerate button; the
    // identity gate links to the hotel-fields form inside the panel.
    const fieldsLink = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Aller aux champs à confirmer',
    );
    expect(fieldsLink).toBeDefined();
    expect(container.querySelector('#audit-hotel-fields')).not.toBeNull();
    // Plan 045 stage 3.1: the produce action stays visible, greyed with its
    // reason - no French writing resolves for this audit yet.
    const produceButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Régénérer les PDF',
    );
    expect(produceButton).toBeDefined();
    expect(produceButton?.disabled).toBe(true);
    expect(container.textContent).toContain(
      'Aucune rédaction française n’est encore disponible : rédigez le rapport ci-dessus avant de produire le PDF.',
    );
    root.unmount();
  });

  it('points a scanned audit at the writing step instead of a regenerate that always 409s', async () => {
    // hautsdesancerre.com case: the job failed inside the fr writing pass,
    // before any analysis was stored. Regenerating the report cannot
    // succeed, so the card must route the operator to the panel's writing
    // section, the only action that creates a pair.
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...emptyAudit,
        failure: {
          jobId: 'job-1',
          status: 'failed',
          error:
            'odysseus analyze (writing pass, language=fr): exhausted 3 attempts without a valid response.',
        },
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Le rapport n’a pas pu être généré');
    expect(container.textContent).toContain('aucune analyse française n’a encore été enregistrée');
    const redactLink = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Aller à Rédiger le rapport',
    );
    expect(redactLink).toBeDefined();
    expect(container.querySelector('#audit-panel-writing')).not.toBeNull();
    // Plan 045 stage 3.1: the produce action stays visible (greyed, no pair
    // resolves yet) instead of disappearing; only the old "Régénérer le
    // rapport" wording is gone for good.
    expect(container.textContent).not.toContain('Régénérer le rapport');
    const produceButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Régénérer les PDF',
    );
    expect(produceButton?.disabled).toBe(true);
    root.unmount();
  });

  it('stays quiet on a healthy audit', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': emptyAudit,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'exemple.fr');
    expect(container.textContent).not.toContain('Le rapport n’a pas pu être généré');
    root.unmount();
  });

  it('offers an inline Confirm per detected identity field instead of an implicit confirm-on-save', async () => {
    // Plan 045 slice 1.3: confirming a detected identity field used to
    // require an operator to open the Prepare step and hit the form's own
    // Save, which rode the field along unasked (and, worse, only if the
    // form happened to be untouched). Each detected field now gets its
    // own Confirm control; the step 1 Save no longer touches them at all.
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('report-preparation')) return notFoundResponse();
      return jsonResponse({
        ...emptyAudit,
        manualFields: {
          nomCommercial: { value: 'Site Officiel', provenance: 'detected' },
          raisonSociale: { value: "L'ESPRIT DU SUD", provenance: 'detected' },
          updatedAt: '2026-09-01T10:20:00.000Z',
        },
        failure: {
          jobId: 'job-1',
          status: 'needs-input',
          error: IDENTITY_ERROR,
          needsInputFields: [
            { field: 'nomCommercial', value: 'Site Officiel' },
            { field: 'raisonSociale', value: "L'ESPRIT DU SUD" },
          ],
        },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Enregistrer les choix');

    // One Confirm button per detected identity field, prefilled with the
    // detected value as an editable input.
    const confirmButtons = [...container.querySelectorAll('button')].filter(
      (button) => button.textContent === 'Confirmer',
    );
    expect(confirmButtons).toHaveLength(2);
    const inputValues = [...container.querySelectorAll('input')].map((input) => input.value);
    expect(inputValues).toEqual(expect.arrayContaining(['Site Officiel', "L'ESPRIT DU SUD"]));

    const saveButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Enregistrer les choix',
    );
    expect(saveButton).toBeDefined();
    await act(async () => {
      saveButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    // Step 1's own Save never sends a patch for fields nothing changed:
    // confirming a detected field is the Confirm button's job now, not an
    // implicit side effect of an unrelated click.
    const patchCall = fetchSpy.mock.calls.find(([input]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.includes('/manual-fields') && !url.includes('/confirm');
    });
    expect(patchCall).toBeUndefined();
    root.unmount();
  });
});

describe('publisher-identification alert (issue #120)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the bounded alert and opens its existing finding remediation', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...emptyAudit,
        severityRollup: { critical: 0, serious: 1, moderate: 0, minor: 0 },
        findings: [
          {
            findingId: 'lcen-1',
            auditId: 'audit-1',
            schemaVersion: 1,
            source: 'custom',
            ruleId: 'lcen-mentions-legales-missing',
            category: 'seo',
            severity: 'serious',
            wcagCriteria: [],
            title: 'No publisher identification found',
            description: 'No identifier found.',
            pageUrls: ['https://exemple.fr/'],
            occurrences: 1,
            elements: [],
            rawEvidence: {},
            dedupeKey: 'lcen-1',
            firstSeenAt: '2026-09-01T10:00:00.000Z',
            lastSeenAt: '2026-09-01T10:00:00.000Z',
          },
        ],
        ruleCopy: {
          'lcen-mentions-legales-missing': {
            titleFr: 'Aucun numéro SIREN, RCS ou de TVA trouvé sur le site',
            remediationFr: "Publiez les informations d'identification de l'entreprise.",
            remediationEn: "Publish the company's identification information.",
          },
        },
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Vérifier les informations d’identification du site');
    expect(container.textContent).toContain(
      'Le scan n’a trouvé aucun numéro SIREN, RCS ou de TVA publié sur les pages de ce site qu’il a visitées.',
    );
    const revealButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Voir le constat et la piste de correction',
    );
    expect(revealButton).toBeDefined();
    await act(async () => {
      revealButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.textContent).toContain(
      "Publiez les informations d'identification de l'entreprise.",
    );
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
    root.unmount();
  });
});

describe('static fallback analysis notice (issue #162)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // The reports list renders inside the production step, which unlocks
  // whenever a bilingual analysis pair resolves at all (plan 045 slice
  // 1.2): the fixture carries the report languages the fallback gate
  // wrote, plus the resolved pair kind that fact now depends on.
  const analysedAudit = {
    ...emptyAudit,
    lifecycle: 'analysed',
    reportLanguages: ['fr', 'en'],
    analysisPair: 'selected',
  };

  it('shows the fallback notice on the reports card when the pair is a static fallback', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...analysedAudit,
        analysisIsStaticFallback: true,
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Rapports');
    expect(container.textContent).toContain(
      'Ce rapport a été rédigé à partir des seuls constats du scan.',
    );
    root.unmount();
  });

  it('shows no fallback notice for a model-generated pair', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...analysedAudit,
        analysisIsStaticFallback: false,
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Rapports');
    expect(container.textContent).not.toContain(
      'Ce rapport a été rédigé à partir des seuls constats du scan.',
    );
    root.unmount();
  });
});

describe('reports card PDF availability (issue #91)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const auditWithReports = (pdfAvailable: boolean): Record<string, unknown> => ({
    ...emptyAudit,
    lifecycle: 'analysed',
    reportLanguages: ['fr'],
    analysisPair: 'selected',
    reports: [
      {
        language: 'fr',
        status: 'fresh',
        pdfAvailable,
      },
      { language: 'en', status: 'unverified', pdfAvailable: false },
    ],
  });

  it('renders the unavailable state instead of live-looking anchors', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithReports(false),
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'PDF non disponible ici');
    expect(container.querySelector('a[href="/api/audits/audit-1/report/fr/preview"]')).toBeNull();
    // The row keeps an actionable path: the production step's single
    // regenerate button above the list.
    expect(container.textContent).toContain('Régénérer les PDF');
    root.unmount();
  });

  it('keeps the anchors when this machine can serve the bytes', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithReports(true),
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Prévisualiser');
    expect(container.textContent).not.toContain('PDF non disponible ici');
    expect(
      container.querySelector('a[href="/api/audits/audit-1/report/fr/preview"]'),
    ).not.toBeNull();
    root.unmount();
  });

  it('answers a residual 409 with a friendly toast, not a raw JSON page', async () => {
    // sonner's toast.error returns a toast id, so the spy must too.
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'test-toast');
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithReports(true),
    });
    // The click fetches the endpoint, which answers the conflict the
    // browser would otherwise render as a raw JSON page.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
        if (url.includes('/report/fr/preview')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: 'report PDF is missing or its digest does not match' }),
          } as unknown as Response;
        }
        if (url.includes('report-preparation')) return notFoundResponse();
        return jsonResponse(auditWithReports(true));
      }),
    );
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Prévisualiser');
    const previewAnchor = container.querySelector<HTMLAnchorElement>(
      'a[href="/api/audits/audit-1/report/fr/preview"]',
    );
    expect(previewAnchor).not.toBeNull();
    await act(async () => {
      previewAnchor?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Ce PDF n’est pas disponible depuis cette machine. Régénérez le rapport, puis réessayez.',
      { description: 'report PDF is missing or its digest does not match' },
    );
    root.unmount();
  });
});

describe('report approval is explicit (plan 060 §2.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const approvableAudit = {
    ...emptyAudit,
    lifecycle: 'analysed',
    reportLanguages: ['fr', 'en'],
    analysisPair: 'selected',
    reports: [
      { language: 'fr', status: 'fresh', pdfAvailable: true },
      { language: 'en', status: 'fresh', pdfAvailable: true },
    ],
  };

  function recordingFetchStub(): ReturnType<typeof vi.fn> {
    return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
      if (url.includes('/report/') || url.includes('/report-quality/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          blob: async () => new Blob(['pdf']),
        } as unknown as Response;
      }
      if (url.includes('report-preparation')) return notFoundResponse();
      return jsonResponse(approvableAudit);
    });
  }

  function spyObjectUrls(): void {
    (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:test');
    (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  }

  it('downloads a language without approving the pair', async () => {
    spyObjectUrls();
    const fetchMock = recordingFetchStub();
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Télécharger le PDF');
    const downloadAnchor = container.querySelector<HTMLAnchorElement>(
      'a[href="/api/audits/audit-1/report/fr"]',
    );
    expect(downloadAnchor).not.toBeNull();
    await act(async () => {
      downloadAnchor?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const calledUrls = fetchMock.mock.calls.map((call) =>
      typeof call[0] === 'string' ? call[0] : String(call[0]),
    );
    expect(calledUrls.some((url) => url.includes('/approve-reports'))).toBe(false);
    root.unmount();
  });

  it('approves only through the explicit pair control', async () => {
    spyObjectUrls();
    const fetchMock = recordingFetchStub();
    vi.stubGlobal('fetch', fetchMock);
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Approuver le rapport (les deux langues)');
    const approveButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Approuver le rapport (les deux langues)',
    );
    expect(approveButton).toBeDefined();
    await act(async () => {
      approveButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const approveCall = fetchMock.mock.calls.find((call) =>
      (typeof call[0] === 'string' ? call[0] : String(call[0])).includes('/approve-reports'),
    );
    expect(approveCall).toBeDefined();
    expect(approveCall?.[1]?.method).toBe('POST');
    root.unmount();
  });
});

describe('preview note on the audit page (plan 040 slice 5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('points a prospect-linked audit at the hub instead of offering publication', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...emptyAudit,
        outreach: { prospectId: 'prospect-1', hasLiveV2Preview: false },
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Aperçu géré depuis la fiche du prospect');
    const link = container.querySelector('a[href="/prospects/prospect-1#emails"]');
    expect(link?.textContent).toContain('Aperçu géré depuis la fiche du prospect');
    // Slice 4 moved publication, takedown, and the first draft to the
    // hub; none of them may reappear here.
    for (const label of ['Publier l’aperçu', 'Retirer l’aperçu', 'Créer le premier brouillon']) {
      expect(
        [...container.querySelectorAll('button')].some((button) =>
          button.textContent?.includes(label),
        ),
      ).toBe(false);
    }
    root.unmount();
  });

  it('keeps the two read-only preview actions for an audit with no prospect', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': {
        ...emptyAudit,
        outreach: { prospectId: null, hasLiveV2Preview: false },
      },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Aperçu');
    expect(
      [...container.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Afficher l’aperçu'),
      ),
    ).toBe(true);
    expect(
      [...container.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Télécharger le PDF'),
      ),
    ).toBe(true);
    expect(
      [...container.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Publier l’aperçu'),
      ),
    ).toBe(false);
    root.unmount();
  });
});

describe('audit report panel (plan 045 stage 3.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const analysedAudit = {
    ...emptyAudit,
    lifecycle: 'analysed',
    reportLanguages: ['fr', 'en'],
    analysisPair: 'selected',
  };

  it('renders every row always visible, with one save inside the collapsed report details', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': preparationView(),
      '/api/audits/audit-1': analysedAudit,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Rapport client');
    for (const heading of [
      'Confirmer l’identité du client',
      'Rédiger le rapport',
      'Produire les PDF',
      'Approuver et livrer',
    ]) {
      expect(container.textContent).toContain(heading);
    }
    // The collapsed "Report details" disclosure hosts both forms behind one
    // Enregistrer button.
    expect(container.textContent).toContain('Détails du rapport (optionnel)');
    expect(
      [...container.querySelectorAll('button')].filter(
        (button) => button.textContent === 'Enregistrer les choix',
      ),
    ).toHaveLength(1);
    expect(container.textContent).toContain('Informations sur l’hôtel');
    expect(container.querySelector('#audit-hotel-fields')).not.toBeNull();
    // The writing row's write button is always available, never gated.
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Rédiger le rapport',
      ),
    ).toBe(true);
    // A stored pair unlocks production even though no writing was chosen.
    const produceButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Régénérer les PDF',
    );
    expect(produceButton).toBeDefined();
    expect(produceButton?.disabled).toBe(false);
    root.unmount();
  });

  it('restores a running PDF stage on load and replaces both production actions (issue #376)', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': preparationView({
        production: {
          status: 'pdf-generation',
          startedAt: '2026-09-17T10:00:00.000Z',
          updatedAt: '2026-09-17T10:02:00.000Z',
        },
      }),
      '/api/audits/audit-1': analysedAudit,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Le contenu du rapport est prêt');
    const busyButtons = [...container.querySelectorAll('button')].filter((button) =>
      button.textContent?.includes('Génération des PDF…'),
    );
    expect(busyButtons).toHaveLength(2);
    expect(busyButtons.every((button) => button.disabled)).toBe(true);
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Régénérer les PDF',
      ),
    ).toBe(false);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Génération des PDF',
    );
    root.unmount();
  });

  it('shows a stale writing failure but no preview or approve action for a legacy ready candidate', async () => {
    // A candidate left 'ready' by a pre-plan-045-2.1 run: every regeneration
    // from this build already approves inline, so the preview and approve
    // routes and their UI were retired in stage 3.4. Regenerating again is
    // the only way forward for a leftover 'ready' record.
    stubRoutes({
      '/api/audits/audit-1/report-preparation': preparationView({
        preparation: {
          updatedAt: '2026-09-01T10:00:00.000Z',
          writingSelection: {
            candidate: {
              status: 'ready',
              pair: { frAnalysisId: 'fr-12345678', enAnalysisId: 'en-12345678' },
              createdAt: '2026-09-01T10:10:00.000Z',
            },
          },
        },
      }),
      '/api/audits/audit-1': analysedAudit,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Rapport client');
    expect(
      container.querySelector(
        'a[href="/api/audits/audit-1/report-preparation/candidate/fr/preview"]',
      ),
    ).toBeNull();
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Approuver cette version',
      ),
    ).toBe(false);
    root.unmount();
  });
});

describe('findings table rows and expansion (issue #93)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const element = {
    pageUrl: 'https://exemple.fr/contact',
    selector: '#formulaire > button:nth-child(3)',
    snippet: '<button class="valider"></button>',
  };

  const auditWithFindings = {
    ...emptyAudit,
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
        pageUrls: ['https://exemple.fr/', 'https://exemple.fr/contact'],
        occurrences: 6,
        elements: [element],
        rawEvidence: {},
        dedupeKey: 'dedupe-1',
        firstSeenAt: '2026-09-01T10:00:00.000Z',
        lastSeenAt: '2026-09-01T10:00:00.000Z',
      },
      {
        findingId: 'f002',
        auditId: 'audit-1',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'button-name',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['4.1.2'],
        title: 'Buttons must have discernible text',
        description: 'The button has no accessible name.',
        pageUrls: ['https://exemple.fr/galerie'],
        occurrences: 1,
        elements: [{ ...element, pageUrl: 'https://exemple.fr/galerie' }],
        rawEvidence: {},
        dedupeKey: 'dedupe-2',
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
  };

  it('distinguishes duplicate detector titles by selector, never by internal id, in French', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithFindings,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Les boutons doivent avoir un texte explicite');
    // The raw detector title no longer shows; both rows carry the reviewed
    // French title, told apart by first selector; internal ids stay hidden.
    expect(container.textContent).not.toContain('Buttons must have discernible text');
    expect(container.textContent).not.toContain('f001');
    expect(container.textContent).toContain('#formulaire > button:nth-child(3)');
    root.unmount();
  });

  it('shows six findings by default and expands or collapses the rest in one click', async () => {
    const findings = Array.from({ length: 8 }, (_, index) => ({
      ...auditWithFindings.findings[0],
      findingId: `f00${index + 1}`,
      dedupeKey: `dedupe-${index + 1}`,
    }));
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': { ...auditWithFindings, findings },
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Afficher les 2 autres constats');
    const row = (id: string): Element | null => container.querySelector(`#finding-toggle-${id}`);

    expect(row('f006')).not.toBeNull();
    expect(row('f007')).toBeNull();
    const showMore = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Afficher les 2 autres constats',
    );
    expect(showMore?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => showMore?.click());
    expect(row('f007')).not.toBeNull();
    expect(row('f008')).not.toBeNull();

    const showLess = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Réduire à 6 constats',
    );
    expect(showLess?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => showLess?.click());
    expect(row('f007')).toBeNull();
    root.unmount();
  });

  it('expands a row into reviewed copy, affected pages, and element identity', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithFindings,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Les boutons doivent avoir un texte explicite');
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Afficher le détail du constat"]',
    );
    expect(toggle).not.toBeNull();
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.textContent).toContain(
      'Un bouton sans texte lisible ne dit pas à quoi il sert.',
    );
    expect(container.textContent).toContain('Ajoutez un texte visible dans chaque bouton.');
    expect(container.textContent).toContain('https://exemple.fr/contact');
    expect(container.textContent).toContain('<button class="valider"></button>');
    root.unmount();
  });
});
