// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { I18nProvider } from '../i18n/provider';
import { DirectoryPage } from './directory';
import { buildRandomIndependentPath } from './prospect-hub-model';
import { parseProspectFilters } from './prospect-filter-model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RANDOM_PATH = '/api/directory/random-independent';

interface RandomResponse {
  status: number;
  body: unknown;
}

function response({ status, body }: RandomResponse): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

/** Stubs the directory list and the random draw. `draw` resolves when the
 *  test releases it, so a pending request can be observed. */
function stubFetch(draw: () => Promise<RandomResponse>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(RANDOM_PATH)) return response(await draw());
    return response({ status: 200, body: { rows: [], total: 0, page: 1, pageSize: 50 } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function LocationProbe() {
  const location = useLocation();
  return createElement(
    'output',
    { 'data-testid': 'location' },
    location.pathname + location.search,
  );
}

async function render(path: string, language: 'fr' | 'en') {
  window.localStorage.setItem('odysseus.dashboard.language', language);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: 'annuaire',
              element: createElement(
                'div',
                null,
                createElement(DirectoryPage),
                createElement(LocationProbe),
              ),
            }),
            createElement(Route, {
              path: 'prospects/:prospectId',
              element: createElement(LocationProbe),
            }),
          ),
        ),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { container, root };
}

function randomButton(container: HTMLElement, language: 'fr' | 'en'): HTMLButtonElement {
  const label = (language === 'fr' ? fr : en).prospectHub.directory.randomIndependent;
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`no "${label}" button`);
  return button;
}

function location(container: HTMLElement): string {
  return container.querySelector('[data-testid="location"]')?.textContent ?? '';
}

function randomCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith(RANDOM_PATH));
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('random independent prospect path', () => {
  it('forces independence, keeps the facets, and drops pagination', () => {
    const state = parseProspectFilters(
      new URLSearchParams('stars=4&department=33&groupStatus=unknown&q=phare&page=3'),
    );
    const url = new URL(buildRandomIndependentPath(state), 'http://dashboard.test');

    expect(url.pathname).toBe(RANDOM_PATH);
    expect(url.searchParams.get('groupStatus')).toBe('independent');
    expect(url.searchParams.get('stars')).toBe('4');
    expect(url.searchParams.get('department')).toBe('33');
    expect(url.searchParams.get('q')).toBe('phare');
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('pageSize')).toBe(false);
  });
});

describe('Directory random independent prospect', () => {
  it('is a keyboard-reachable button with visible text in both languages', async () => {
    stubFetch(async () => ({ status: 409, body: {} }));
    for (const language of ['fr', 'en'] as const) {
      const { container, root } = await render('/annuaire', language);
      const button = randomButton(container, language);
      expect(button.tagName).toBe('BUTTON');
      expect(button.disabled).toBe(false);
      expect(button.tabIndex).toBe(0);
      button.focus();
      expect(document.activeElement).toBe(button);
      root.unmount();
      document.body.innerHTML = '';
    }
  });

  it('sends the current facets, blocks a second click while drawing, and opens the created prospect', async () => {
    let release: (value: RandomResponse) => void = () => undefined;
    const fetchMock = stubFetch(
      () =>
        new Promise<RandomResponse>((resolve) => {
          release = resolve;
        }),
    );
    const { container, root } = await render(
      '/annuaire?stars=4&department=33&groupStatus=group-member&page=2',
      'fr',
    );

    await act(async () => {
      randomButton(container, 'fr').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(randomButton(container, 'fr').disabled).toBe(true);
    await act(async () => {
      randomButton(container, 'fr').click();
    });

    const calls = randomCalls(fetchMock);
    expect(calls).toHaveLength(1);
    const [input, init] = calls[0]!;
    const sent = new URL(String(input), 'http://dashboard.test');
    expect(init?.method).toBe('POST');
    expect(sent.searchParams.get('stars')).toBe('4');
    expect(sent.searchParams.get('department')).toBe('33');
    expect(sent.searchParams.get('groupStatus')).toBe('independent');
    expect(sent.searchParams.has('page')).toBe(false);
    // The visible filter now states the pool that was sampled.
    expect(new URLSearchParams(location(container).split('?')[1]).get('groupStatus')).toBe(
      'independent',
    );

    await act(async () => {
      release({ status: 201, body: { prospectId: 'p-random-1' } });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(location(container)).toBe('/prospects/p-random-1');
    root.unmount();
  });

  it.each(['fr', 'en'] as const)(
    'keeps the operator on the Directory with an accessible no-match status in %s',
    async (language) => {
      stubFetch(async () => ({
        status: 409,
        body: {
          error: 'No unlinked independent directory entry matches the filters',
          code: 'no-eligible-independent-directory-entry',
        },
      }));
      const { container, root } = await render('/annuaire?department=33', language);

      await act(async () => {
        randomButton(container, language).click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const copy = (language === 'fr' ? fr : en).prospectHub.directory;
      expect(location(container).startsWith('/annuaire')).toBe(true);
      const status = container.querySelector('[role="status"]');
      expect(status?.textContent).toBe(copy.randomIndependentNoMatch);
      expect(randomButton(container, language).disabled).toBe(false);

      const results = await axe(container);
      const summary = (results.violations ?? [])
        .map((violation) => `${violation.id}: ${violation.help}`)
        .join('; ');
      expect(summary, summary).toBe('');
      root.unmount();
    },
  );
});
