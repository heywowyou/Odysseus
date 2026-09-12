// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { ProspectsPage } from './prospects';

// Plan 043 slice 3: the prospects list's wave add and the read-only
// selection overview. Same createElement discipline as the other dashboard
// suites: the workspace vitest glob only collects .ts suites.

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

function row(overrides: {
  candidateId: string;
  name: string;
  inSelection: boolean;
}): Record<string, unknown> {
  return {
    candidateId: overrides.candidateId,
    name: overrides.name,
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
    brokennessTotal: null,
    abilityTotal: null,
    worthy: null,
    contactState: null,
    threadState: null,
    outcome: null,
    inSelection: overrides.inSelection,
    selectionSource: null,
    selectionRank: null,
  };
}

function listResponse(rows: Record<string, unknown>[]): Record<string, unknown> {
  return {
    rows,
    total: rows.length,
    limit: 25,
    offset: 0,
    selection: null,
    selectedCount: 0,
    catalogueTotal: 2,
  };
}

describe('ProspectsPage wave roster (plan 043 slice 3)', () => {
  const fetchMock = vi.fn();
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/wave')) {
        return jsonResponse({ added: true, wave: 'wave-1' });
      }
      if (url.startsWith('/api/selection')) {
        return jsonResponse({
          cohorts: [
            {
              cohortId: 'cohort-1',
              scoringVersion: 'hotel-outreach-v1',
              approved: true,
              computedAt: '2026-09-08T00:00:00.000Z',
              populationSize: 42,
              selectedCount: 6,
              abilityCutoff: 60,
              brokennessCutoff: 40,
            },
          ],
          roster: [
            {
              entryId: 'entry-1',
              wave: 'wave-1',
              candidateId: 'cand-7',
              domain: 'hotel-extra.fr',
              rank: null,
              scoringVersion: 'hotel-outreach-v1',
              actor: 'dashboard',
              decidedAt: '2026-09-09T00:00:00.000Z',
            },
          ],
        });
      }
      return jsonResponse(
        listResponse([
          row({ candidateId: 'cand-out', name: 'Hôtel Hors Sélection', inSelection: false }),
          row({ candidateId: 'cand-in', name: 'Hôtel Dans la Sélection', inSelection: true }),
        ]),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function renderList(): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(MemoryRouter, null, createElement(ProspectsPage)),
        ),
      );
    });
    await pause();
  }

  it('offers the wave add only on out-of-selection rows and posts it', async () => {
    await renderList();
    await waitFor(() =>
      container.textContent?.includes('Hôtel Hors Sélection') ? true : undefined,
    );

    const addButtons = [...container.querySelectorAll('button')].filter(
      (button) => button.textContent === '+ Vague',
    );
    expect(addButtons).toHaveLength(1);

    await act(async () => {
      addButtons[0]?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const confirm = [...dialog!.querySelectorAll('button')].find(
      (button) => button.textContent === 'Ajouter',
    );
    expect(confirm).toBeDefined();
    await act(async () => {
      confirm?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await pause();
    const waveCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/wave') && (call[1] as RequestInit).method === 'POST',
    );
    expect(waveCall).toBeDefined();
    expect(String(waveCall?.[0])).toContain('/api/prospects/cand-out/wave');
    expect(JSON.parse(String((waveCall?.[1] as RequestInit).body))).toEqual({ wave: 'wave-1' });
  });

  it('shows the read-only selection overview when opened', async () => {
    await renderList();
    await waitFor(() =>
      container.textContent?.includes('Hôtel Hors Sélection') ? true : undefined,
    );

    const toggle = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Voir la sélection',
    );
    expect(toggle).toBeDefined();
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await waitFor(() =>
      container.textContent?.includes('Dernières sélections') ? true : undefined,
    );
    expect(container.textContent).toContain('Retenue');
    expect(container.textContent).toContain('hotel-extra.fr');
    expect(container.textContent).toContain('dashboard');
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/selection')).toBe(true);

    // Read-only: the overview adds its two record tables to the page (the
    // main list renders the third) and no mutation control.
    expect(container.querySelectorAll('table')).toHaveLength(3);
    expect(container.textContent).not.toContain('Retirer de la vague');
  });
});
