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

  async function renderSection(response: ProspectDetailResponse): Promise<void> {
    await act(async () => {
      root!.render(
        createElement(
          I18nProvider,
          null,
          createElement(HubQuickCheckSection, { candidateId: 'cand-1', detail: response }),
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
