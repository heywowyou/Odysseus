// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { PreviewPage } from './preview';

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

describe('PreviewPage current preview disclosure', () => {
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
      return jsonResponse({ rendered: true, html: '<main>Current preview</main>' });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('fetches only when opened and embeds the response in an empty sandbox', async () => {
    const { root } = await renderPreview();
    const renderUrl = '/api/prospects/candidate-1/outreach/preview-render';

    await waitFor(() =>
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/preview')) ? true : undefined,
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(renderUrl);

    const button = await waitFor(() =>
      [...document.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('aperçu actuel'),
      ),
    );
    await act(async () => {
      button.click();
    });

    const iframe = await waitFor(() => document.querySelector('iframe') ?? undefined);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(renderUrl);
    expect(iframe.hasAttribute('sandbox')).toBe(true);
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('srcdoc')).toBe('<main>Current preview</main>');

    await act(async () => {
      root.unmount();
    });
  });
});

describe('PreviewPage publication actions (issue #97)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/preview/publish')) {
        return jsonResponse({
          published: true,
          previewId: 'preview-2',
          url: 'https://www.odysseusaudit.com/apercu/one-time-token',
          publicExpiresAt: '2026-10-08T00:00:00.000Z',
        });
      }
      if (String(url).endsWith('/preview')) {
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
      return jsonResponse({ rendered: true, html: '<main>Current preview</main>' });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function clickButton(label: string): Promise<void> {
    const button = await waitFor(() =>
      [...document.querySelectorAll('button')].find((element) =>
        element.textContent?.includes(label),
      ),
    );
    if (button === undefined) throw new Error(`button not found: ${label}`);
    await act(async () => {
      button.click();
    });
    await pause();
  }

  it('shows the re-issued link exactly once, then drops it after confirmation', async () => {
    const { root } = await renderPreview();
    await waitFor(() =>
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/preview')) ? true : undefined,
    );
    await pause();

    await clickButton('Réémettre un lien');
    // The confirm dialog is radix-mounted at the end of body, so its footer
    // button is the last match for the action label.
    const confirm = [...document.querySelectorAll('button')].at(-1);
    expect(confirm?.textContent).toContain('Réémettre un lien');
    await act(async () => {
      confirm?.click();
    });

    await waitFor(() =>
      (document.body.textContent ?? '').includes('one-time-token') ? true : undefined,
    );
    expect(document.body.textContent ?? '').toContain('une seule fois');

    await clickButton('J’ai enregistré le lien');
    expect(document.body.textContent ?? '').not.toContain('one-time-token');

    await act(async () => {
      root.unmount();
    });
  });
});
