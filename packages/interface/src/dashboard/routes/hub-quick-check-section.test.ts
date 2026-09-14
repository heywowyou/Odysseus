// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { HubQuickCheckSection } from './hub-quick-check-section';
import type { ProspectDetailResponse } from './prospects-model';

// Issue #199: a hotel in the selection without a score (typically one the
// operator added to a wave before its first scan) sees the section state
// that plainly instead of staying silent, which read as "no problems".

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function detail(overrides: {
  inSelection?: boolean;
  prescan?: ProspectDetailResponse['prescan'];
}): ProspectDetailResponse {
  return {
    candidateId: 'cand-1',
    qualificationFreshness: { state: 'missing' },
    prescanFreshness: { state: 'missing' },
    scoreFreshness: { state: 'missing' },
    prescan: overrides.prescan ?? null,
    score: null,
    evidence: null,
    selectionVerdict: {
      inSelection: overrides.inSelection ?? true,
      source: 'wave-roster',
      rank: null,
      cohort: null,
    },
  } as unknown as ProspectDetailResponse;
}

describe('HubQuickCheckSection not-scored notice (issue #199)', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    document.body.innerHTML = '';
  });

  async function renderSection(
    response: ProspectDetailResponse,
    extraProps: {
      onRunQuickCheck?: () => void;
      isQuickCheckBusy?: boolean;
      action?: { state: 'available' } | { state: 'blocked'; reason: string };
      blockedReason?: string | null;
    } = {},
  ): Promise<void> {
    await act(async () => {
      root!.render(
        createElement(
          I18nProvider,
          null,
          createElement(HubQuickCheckSection, {
            candidateId: 'cand-1',
            detail: response,
            ...extraProps,
          }),
        ),
      );
    });
  }

  it('states the missing score when the selection has nothing measured yet', async () => {
    await renderSection(detail({}));
    expect(container!.textContent).toContain('Pas encore scoré');
    expect(container!.textContent).toContain('aucun score à la version de scoring courante');
  });

  it('keeps the notice beside a prescan when the score is still missing', async () => {
    await renderSection(
      detail({
        prescan: {
          status: 'complete',
          prescanVersion: 'pv2',
          startedAt: '2026-09-12T00:00:00.000Z',
          pages: [],
          absentRoles: [],
        } as unknown as NonNullable<ProspectDetailResponse['prescan']>,
      }),
    );
    expect(container!.textContent).toContain('Pas encore scoré');
  });

  it('shows no notice when the hotel is not in the selection', async () => {
    await renderSection(detail({ inSelection: false }));
    expect(container!.textContent).not.toContain('Pas encore scoré');
  });
});

describe('HubQuickCheckSection quick-check action (issue #201)', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    document.body.innerHTML = '';
  });

  async function renderSection(
    response: ProspectDetailResponse,
    extraProps: {
      onRunQuickCheck?: () => void;
      isQuickCheckBusy?: boolean;
      action?: { state: 'available' } | { state: 'blocked'; reason: string };
      blockedReason?: string | null;
    } = {},
  ): Promise<void> {
    await act(async () => {
      root!.render(
        createElement(
          I18nProvider,
          null,
          createElement(HubQuickCheckSection, {
            candidateId: 'cand-1',
            detail: response,
            ...extraProps,
          }),
        ),
      );
    });
  }

  it('offers the one-click remedy when there is no prescan and a handler is wired', async () => {
    await renderSection(detail({}), { onRunQuickCheck: () => {} });
    expect(container!.textContent).toContain('Lancer une vérification rapide');
  });

  it('runs the handler when the operator clicks the action', async () => {
    let calls = 0;
    await renderSection(detail({}), { onRunQuickCheck: () => (calls += 1) });
    const button = container!.querySelector('button');
    expect(button).not.toBeNull();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(calls).toBe(1);
  });

  it('renders the server refusal proactively and does not run a blocked action', async () => {
    let calls = 0;
    await renderSection(detail({}), {
      onRunQuickCheck: () => (calls += 1),
      action: { state: 'blocked', reason: 'not-qualified' },
      blockedReason: 'Qualification requise.',
    });
    const button = container!.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(container!.textContent).toContain('Qualification requise.');
    button?.click();
    expect(calls).toBe(0);
  });

  it('withholds the action when no handler is wired, describing the manual passes instead', async () => {
    await renderSection(detail({}));
    expect(container!.textContent).not.toContain('Lancer une vérification rapide');
    expect(container!.textContent).toContain('lancez d’abord ces passages');
  });

  it('offers the action again when a completed prescan produced no score', async () => {
    await renderSection(
      detail({
        prescan: {
          status: 'complete',
          prescanVersion: 'pv2',
          startedAt: '2026-09-12T00:00:00.000Z',
          pages: [],
          absentRoles: [],
        } as unknown as NonNullable<ProspectDetailResponse['prescan']>,
      }),
      { onRunQuickCheck: () => {} },
    );
    expect(container!.textContent).toContain('Lancer une vérification rapide');
  });
});
