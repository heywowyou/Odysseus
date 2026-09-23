// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { NewScanPage } from './new-scan';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

async function renderEstimate(estimate: {
  available: boolean;
  pageCount?: number;
  estimatedMs?: number;
}): Promise<{ container: HTMLElement; root: Root }> {
  window.localStorage.setItem('odysseus.dashboard.language', 'fr');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/scans/estimate')) return jsonResponse(estimate);
      if (url.includes('/api/prospects/match')) return jsonResponse([]);
      if (url.includes('/api/prospects?')) {
        return jsonResponse({ rows: [], total: 0, page: 1, pageSize: 20 });
      }
      return jsonResponse({ rows: [], total: 0, page: 1, pageSize: 20 });
    }),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: ['/scans/new?url=https%3A%2F%2Fexample.com%2F'] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: '/scans/new', element: createElement(NewScanPage) }),
          ),
        ),
      ),
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  return { container, root };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('NewScanPage prior-audit estimate', () => {
  it('shows the estimate for a site with a prior full audit', async () => {
    vi.useFakeTimers();
    const { container, root } = await renderEstimate({
      available: true,
      pageCount: 100,
      estimatedMs: 3_600_000,
    });
    expect(container.textContent).toContain(
      'Durée estimée d’après le dernier scan complet : environ 1 h.',
    );
    await act(async () => root.unmount());
  });

  it('shows nothing when no prior full audit exists', async () => {
    vi.useFakeTimers();
    const { container, root } = await renderEstimate({ available: false });
    expect(container.textContent).not.toContain('Durée estimée d’après le dernier scan complet');
    await act(async () => root.unmount());
  });
});
