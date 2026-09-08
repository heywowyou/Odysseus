// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { EvidencePage } from './evidence';
import type { EvidenceResponse } from './insights-model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

async function pause(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value !== undefined) return value;
    await pause();
  }
  throw new Error('condition did not become true');
}

const evidenceResponse: EvidenceResponse = {
  prescanId: 'prescan-1',
  name: 'Hôtel Exemple',
  commune: 'GRENOBLE',
  postcode: '38000',
  evidenceStatus: 'complete',
  renderComparison: {
    state: 'captured',
    pageRole: 'homepage',
    selectionReason: 'material-render-gap',
    byteSize: 204_800,
    width: 1280,
    height: 720,
    altText: { fr: 'Comparaison du site brut et du site rendu.', en: 'Render comparison.' },
  },
  specificFailure: { state: 'omitted', reason: 'no-eligible-failure' },
  summaries: [],
};

async function renderEvidence(): Promise<void> {
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
          { initialEntries: ['/prospects/candidate-1/evidence'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/prospects/:candidateId/evidence',
              element: createElement(EvidencePage),
            }),
          ),
        ),
      ),
    );
  });
}

describe('EvidencePage asset rendering (issue #92)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => jsonResponse(evidenceResponse));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders the captured screenshot as an img pointing at the asset endpoint', async () => {
    await renderEvidence();
    await waitFor(() => (document.querySelector('img') !== null ? true : undefined));
    await pause();

    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe(
      '/api/prospects/candidate-1/evidence/assets/render-comparison',
    );
    expect(img?.getAttribute('alt')).toBe('Comparaison du site brut et du site rendu.');
  });

  it('shows the explicit unavailable state instead of a broken image on load failure', async () => {
    await renderEvidence();
    const img = (await waitFor(() => document.querySelector('img'))) as HTMLImageElement;
    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });
    await pause();

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Cette capture n’a pas pu être chargée',
    );
  });

  it('renders no figure for an omitted asset', async () => {
    await renderEvidence();
    await waitFor(() => (document.querySelector('img') !== null ? true : undefined));
    await pause();

    expect(document.querySelectorAll('img')).toHaveLength(1);
  });
});
