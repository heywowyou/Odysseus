// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { ProspectsPage } from './prospects';

/** The search box is the prospects list's only per-keystroke server round
 *  trip, so this suite drives the real input and asserts on the requests
 *  the page sends: settled typing reaches the API as `q`, interim
 *  keystrokes coalesce into one request, and clearing drops the
 *  constraint. Same render discipline as accessibility.test.ts (no
 *  Testing Library in the workspace; the vitest glob only collects .ts
 *  suites). The waits run inside act so the debounced state update the
 *  timer triggers is processed as part of the await. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

type FetchMock = ReturnType<typeof vi.fn>;

function requestedUrls(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

async function renderProspects(fetchMock: FetchMock): Promise<{ root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(MemoryRouter, null, createElement(ProspectsPage)),
      ),
    );
  });
  await waitForRequest(fetchMock, 'limit=25');
  return { root };
}

async function typeSearch(value: string): Promise<void> {
  const input = document.querySelector('input[type="search"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('search input not found');
  await act(async () => {
    // React reads the value through the DOM node, so the native setter is
    // what makes the controlled change visible to its onChange.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pause(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitForRequest(fetchMock: FetchMock, marker: string): Promise<string> {
  for (let i = 0; i < 200; i += 1) {
    const hit = requestedUrls(fetchMock).find((url) => url.includes(marker));
    if (hit !== undefined) return hit;
    await pause(10);
  }
  throw new Error(`no request carried "${marker}"; sent: ${requestedUrls(fetchMock).join(', ')}`);
}

describe('prospects search box', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      jsonResponse({
        rows: [],
        total: 0,
        limit: 25,
        offset: 0,
        selection: null,
        selectedCount: 0,
        catalogueTotal: 0,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('coalesces settled keystrokes into one q request', async () => {
    const { root } = await renderProspects(fetchMock);

    // Three typing bursts, each shorter than the debounce window, must
    // produce exactly one search request carrying the final text.
    await typeSearch('H');
    await pause(100);
    await typeSearch('Hô');
    await pause(100);
    await typeSearch('Hôtel');
    const searchRequest = await waitForRequest(fetchMock, 'q=');
    expect(searchRequest).toBe('/api/prospects?inSelection=true&q=H%C3%B4tel&limit=25');
    expect(requestedUrls(fetchMock).filter((url) => url.includes('q='))).toHaveLength(1);

    root.unmount();
  });

  it('drops the q param when the box is cleared', async () => {
    const { root } = await renderProspects(fetchMock);
    await typeSearch('Hôtel');
    await waitForRequest(fetchMock, 'q=');

    await typeSearch('');
    const clearedRequest = await waitForRequest(fetchMock, 'limit=25');
    expect(clearedRequest).not.toContain('q=');

    root.unmount();
  });
});
