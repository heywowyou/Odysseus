// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { PreviewPage } from './preview';

// Plan 037: the prescan-backed v1 preview is retired. This suite keeps the
// two behaviours the page still owns: the stored row's status display and
// the revoke flow for legacy v1 rows.

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

async function renderPreview(): Promise<{ root: Root }> {
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
          { initialEntries: ['/prospects/candidate-1/preview'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/prospects/:candidateId/preview',
              element: createElement(PreviewPage),
            }),
          ),
        ),
      ),
    );
  });
  return { root };
}

describe('PreviewPage status display', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/preview')) {
        return jsonResponse({
          previewId: 'preview-1',
          domain: 'hotel-exemple.fr',
          language: 'fr',
          status: 'live',
          publishedAt: '2026-09-01T00:00:00.000Z',
          publicExpiresAt: '2026-10-01T00:00:00.000Z',
          revokedAt: null,
          revokedReason: null,
          prescanVersion: 'v3',
          evidenceVersion: 'v2',
          previewContentVersion: 'v1',
        });
      }
      return jsonResponse({ revoked: 0, alreadyRevoked: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the stored row status and no publication controls', async () => {
    const { root } = await renderPreview();

    await waitFor(() =>
      (document.body.textContent ?? '').includes('En ligne') ? true : undefined,
    );
    // Plan 037: publication moved to the audit page's v2 card; the retired
    // render iframe is gone too. The revoke action stays for legacy rows.
    expect(document.querySelector('iframe')).toBeNull();
    expect(
      [...document.querySelectorAll('button')].some((element) =>
        element.textContent?.includes('Publier l’aperçu'),
      ),
    ).toBe(false);
    expect(
      [...document.querySelectorAll('button')].some((element) =>
        element.textContent?.includes('Réémettre un lien'),
      ),
    ).toBe(false);
    expect(
      [...document.querySelectorAll('button')].some((element) =>
        element.textContent?.includes('Retirer l’aperçu'),
      ),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('PreviewPage revoke action', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/preview/revoke')) {
        return jsonResponse({ revoked: 1, alreadyRevoked: 0 });
      }
      return jsonResponse({
        previewId: 'preview-1',
        domain: 'hotel-exemple.fr',
        language: 'fr',
        status: 'live',
        publishedAt: '2026-09-01T00:00:00.000Z',
        publicExpiresAt: '2026-10-01T00:00:00.000Z',
        revokedAt: null,
        revokedReason: null,
        prescanVersion: 'v3',
        evidenceVersion: 'v2',
        previewContentVersion: 'v1',
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('withdraws the previews only after the confirmation dialog', async () => {
    const { root } = await renderPreview();
    await waitFor(() =>
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/preview')) ? true : undefined,
    );
    await pause();

    const revoke = await waitFor(() =>
      [...document.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('Retirer l’aperçu'),
      ),
    );
    await act(async () => {
      revoke.click();
    });
    await pause();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/preview/revoke'))).toBe(
      false,
    );

    // The confirm dialog is radix-mounted at the end of body, so its footer
    // button is the last match for the action label.
    const confirm = [...document.querySelectorAll('button')].at(-1);
    expect(confirm?.textContent).toContain('Retirer l’aperçu');
    await act(async () => {
      confirm?.click();
    });

    await waitFor(() =>
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/preview/revoke'))
        ? true
        : undefined,
    );

    await act(async () => {
      root.unmount();
    });
  });
});
