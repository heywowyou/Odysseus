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
  approval: null,
  manualFields: null,
};

describe('audits list report-stage failure display (issue #90)', () => {
  beforeEach(() => {
    stubRoutes({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('reads Action requise for a failed job whose audit was persisted', async () => {
    stubRoutes({
      '/api/scans?limit=200': [
        {
          jobId: 'job-1',
          type: 'full-audit',
          status: 'failed',
          phase: 'failed',
          siteUrl: 'https://exemple.fr',
          createdAt: '2026-09-05T13:09:00.000Z',
          auditId: 'audit-1',
        },
      ],
    });
    const { container, root } = await renderPage(createElement(AuditsPage));
    await settle(container, 'exemple.fr');
    // Assert inside the table: the status filter select carries every
    // status label as an option, so the whole-document text cannot
    // discriminate.
    const tableText = container.querySelector('tbody')?.textContent ?? '';
    expect(tableText).toContain('Action requise');
    expect(tableText).not.toContain('Échoué');
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

  it('surfaces the stored reason, the job link, and the inline regenerate path', async () => {
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
    // The row keeps an actionable path: regenerate from this machine.
    expect(container.textContent).toContain('Régénérer le rapport');
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

  it('distinguishes duplicate detector titles by id and selector, in French', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithFindings,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'Les boutons doivent avoir un texte explicite');
    // The raw detector title no longer shows; both rows carry the reviewed
    // French title, told apart by id and first selector.
    expect(container.textContent).not.toContain('Buttons must have discernible text');
    expect(container.textContent).toContain('f001');
    expect(container.textContent).toContain('f002');
    expect(container.textContent).toContain('#formulaire > button:nth-child(3)');
    root.unmount();
  });

  it('expands a row into reviewed copy, affected pages, and element identity', async () => {
    stubRoutes({
      '/api/audits/audit-1/report-preparation': null,
      '/api/audits/audit-1': auditWithFindings,
    });
    const { container, root } = await renderPage(createElement(AuditDetailPage), '/audits/audit-1');
    await settle(container, 'f001');
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
