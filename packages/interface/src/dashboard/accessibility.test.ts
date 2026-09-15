// @vitest-environment jsdom

import { createElement, type ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { I18nProvider } from './i18n/provider';
import { DirectoryPage } from './routes/directory';
import { ProspectHubDetailPage } from './routes/prospect-hub-detail';
import { ProspectHubListPage } from './routes/prospect-hub-list';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prospect = {
  prospectId: 'prospect-1',
  sector: 'hotel',
  name: 'Hôtel Exemple',
  websites: [
    {
      url: 'https://exemple.fr/',
      registrableDomain: 'exemple.fr',
      kind: 'own',
      primary: true,
    },
  ],
  commune: 'Grenoble',
  department: '38',
  status: 'new',
  hotel: { stars: 3, rooms: 42, groupStatus: 'independent' },
  emails: [{ address: 'contact@exemple.fr', origin: 'operator' }],
  lastActivityAt: '2026-09-15T10:00:00.000Z',
  address: '1 rue Exemple',
  postcode: '38000',
  phone: '+33 4 00 00 00 00',
  notes: '',
  fieldOrigins: { name: 'operator', websites: 'operator' },
  audits: [],
  previews: [],
  events: [],
  work: {
    items: [],
    auditState: 'missing',
    websiteSuppressed: false,
    emailSuppressed: false,
  },
  thread: null,
  drafts: [],
};

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function stubRoutes(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/prospects/prospect-1/actionability')) {
        return jsonResponse({
          actions: {
            preview: { state: 'blocked', reason: 'no-complete-audit' },
            'first-email': { state: 'blocked', reason: 'no-complete-audit' },
            'follow-up': { state: 'blocked', reason: 'no-complete-audit' },
          },
        });
      }
      if (url.includes('/api/prospects/prospect-1')) return jsonResponse(prospect);
      if (url.includes('/api/directory')) {
        return jsonResponse({ rows: [], total: 0, page: 1, pageSize: 50 });
      }
      return jsonResponse({
        rows: [prospect],
        total: 1,
        page: 1,
        pageSize: 50,
        statusCounts: {
          contacted: 0,
          'follow-up': 0,
          replied: 1,
          call: 0,
          quoted: 0,
          won: 0,
          lost: 0,
          'opted-out': 0,
        },
      });
    }),
  );
}

function withRoute(
  child: ReactElement,
  path: string,
  pattern: string,
  language: 'fr' | 'en',
): ReactElement {
  window.localStorage.setItem('odysseus.dashboard.language', language);
  return createElement(
    I18nProvider,
    null,
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(Routes, null, createElement(Route, { path: pattern, element: child })),
    ),
  );
}

async function renderPage(
  element: ReactElement,
  path: string,
  pattern: string,
  language: 'fr' | 'en',
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(withRoute(element, path, pattern, language));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { container, root };
}

async function expectNoAxeViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  const summary = (results.violations ?? [])
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join('; ');
  expect(summary, summary).toBe('');
}

describe('prospect dashboard accessibility contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it.each(['fr', 'en'] as const)('Directory is axe-clean in %s', async (language) => {
    stubRoutes();
    const { container, root } = await renderPage(
      createElement(DirectoryPage),
      '/annuaire',
      'annuaire',
      language,
    );
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it.each(['fr', 'en'] as const)('Prospects is axe-clean in %s', async (language) => {
    stubRoutes();
    const { container, root } = await renderPage(
      createElement(ProspectHubListPage),
      '/prospects',
      'prospects',
      language,
    );
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it.each(['fr', 'en'] as const)('Results view is axe-clean in %s', async (language) => {
    stubRoutes();
    const { container, root } = await renderPage(
      createElement(ProspectHubListPage),
      '/prospects?view=results',
      'prospects',
      language,
    );
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it.each(['fr', 'en'] as const)('prospect detail is axe-clean in %s', async (language) => {
    stubRoutes();
    const { container, root } = await renderPage(
      createElement(ProspectHubDetailPage),
      '/prospects/prospect-1',
      'prospects/:prospectId',
      language,
    );
    await expectNoAxeViolations(container);
    root.unmount();
  });
});
