// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { fr } from '../i18n/fr';
import { ProspectsPage } from './prospects';

/** Issue #215: the "Problems found" / "Ability to fix" headers double as
 *  the sort toggle. Same render discipline as prospects-search.test.ts and
 *  prospects-wave.test.ts (no Testing Library in the workspace; the vitest
 *  glob only collects .ts suites). */

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

async function pause(ms = 10): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function waitForRequest(fetchMock: FetchMock, marker: string): Promise<string> {
  for (let i = 0; i < 200; i += 1) {
    const hit = requestedUrls(fetchMock).find((url) => url.includes(marker));
    if (hit !== undefined) return hit;
    await pause();
  }
  throw new Error(`no request carried "${marker}"; sent: ${requestedUrls(fetchMock).join(', ')}`);
}

function row(candidateId: string, name: string): Record<string, unknown> {
  return {
    candidateId,
    name,
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
    brokennessTotal: 10,
    abilityTotal: 5,
    worthy: null,
    contactState: null,
    threadState: null,
    outcome: null,
    inSelection: true,
    selectionSource: null,
    selectionRank: null,
  };
}

function listResponse(): Record<string, unknown> {
  return {
    rows: [row('cand-1', 'Hotel Un'), row('cand-2', 'Hotel Deux')],
    total: 2,
    limit: 25,
    offset: 0,
    selection: null,
    selectedCount: 2,
    catalogueTotal: 2,
  };
}

function findHeaderButton(label: string): HTMLButtonElement {
  const th = [...document.querySelectorAll('th')].find((cell) =>
    (cell.textContent ?? '').includes(label),
  );
  const button = th?.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`sort header button for "${label}" not found`);
  }
  return button;
}

describe('prospects list sort headers (issue #215)', () => {
  let fetchMock: FetchMock;
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse(listResponse()));
    vi.stubGlobal('fetch', fetchMock);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderProspects(): Promise<void> {
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
    await pause();
  }

  it('sorts descending on first click, ascending on second, then off', async () => {
    await renderProspects();

    // Each click's key change resets the poll's data to undefined while
    // the refetch is in flight (usePolling.ts), which unmounts the table
    // and its buttons - so the header button is re-queried after every
    // request settles rather than reused across renders.
    await act(async () => findHeaderButton(fr.labels.scoreSide.brokenness).click());
    let request = await waitForRequest(fetchMock, 'sortBy=brokenness');
    expect(request).toContain('sortBy=brokenness');
    expect(request).not.toContain('sortDirection');
    await pause();
    expect(
      findHeaderButton(fr.labels.scoreSide.brokenness).closest('th')?.getAttribute('aria-sort'),
    ).toBe('descending');

    await act(async () => findHeaderButton(fr.labels.scoreSide.brokenness).click());
    request = await waitForRequest(fetchMock, 'sortDirection=asc');
    expect(request).toContain('sortBy=brokenness');
    expect(request).toContain('sortDirection=asc');
    await pause();
    expect(
      findHeaderButton(fr.labels.scoreSide.brokenness).closest('th')?.getAttribute('aria-sort'),
    ).toBe('ascending');

    await act(async () => findHeaderButton(fr.labels.scoreSide.brokenness).click());
    await pause(50);
    const last = requestedUrls(fetchMock).at(-1) ?? '';
    expect(last).not.toContain('sortBy');
    expect(
      findHeaderButton(fr.labels.scoreSide.brokenness).closest('th')?.getAttribute('aria-sort'),
    ).toBe('none');
  });

  it('resets to the first page when the sort changes', async () => {
    await renderProspects();
    const button = findHeaderButton(fr.labels.scoreSide.ability);
    await act(async () => button.click());
    const request = await waitForRequest(fetchMock, 'sortBy=fixability');
    expect(request).not.toContain('offset=');
  });
});
