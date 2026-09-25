// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import type { StorageStatusResponse } from '../../retention/storage-status';
import { StorageStatusCard } from './storage-status-card';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

async function render(
  status: StorageStatusResponse,
): Promise<{ container: HTMLElement; root: Root }> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse(status)),
  );
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(StorageStatusCard)));
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (container.querySelector('[data-storage-level]') !== null) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  return { container, root };
}

const disk = (usedPercent: number, level: 'ok' | 'warning' | 'danger') => ({
  totalBytes: 200_000_000_000,
  freeBytes: 200_000_000_000 * (1 - usedPercent / 100),
  usedPercent,
  level,
});

describe('StorageStatusCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it.each([
    [40, 'ok', 'Espace suffisant', undefined],
    [80, 'warning', 'Disque rempli aux trois quarts', 'Le nettoyage quotidien'],
    [93, 'danger', 'Disque presque plein', 'Libérez de l’espace'],
  ] as const)('shows %s %% used as %s', async (usedPercent, level, label, help) => {
    const { container, root } = await render({
      disk: disk(usedPercent, level),
      lastRetentionRun: null,
    });

    expect(
      container.querySelector('[data-storage-level]')?.getAttribute('data-storage-level'),
    ).toBe(level);
    expect(container.textContent).toContain(label);
    expect(container.textContent).toContain(`${usedPercent} % utilisé`);
    if (help === undefined) expect(container.textContent).not.toContain('Libérez');
    else expect(container.textContent).toContain(help);
    expect(container.querySelector('[role="alert"]') !== null).toBe(level === 'danger');
    expect(container.textContent).toContain('Aucun nettoyage enregistré.');
    act(() => root.unmount());
  });

  it('summarizes the last retention run with its refusal, failures and holds', async () => {
    const { container, root } = await render({
      disk: disk(50, 'ok'),
      lastRetentionRun: {
        trigger: 'sweeper',
        finishedAt: '2026-09-30T03:15:00.000Z',
        auditsDeleted: 3,
        auditsSlimmed: 1,
        versionsDeleted: 12,
        auditsHeld: 2,
        bytesReclaimedLocal: 4_200_000_000,
        failureCount: 1,
        refused: false,
      },
    });

    const text = container.textContent ?? '';
    expect(text).toContain(
      '(automatique) : 3 audit(s) supprimé(s), 1 allégé(s), 12 version(s) retirée(s), 4,2 Go libérés.',
    );
    expect(text).toContain('1 élément(s) en échec');
    expect(text).toContain('2 audit(s) laissé(s) de côté');
    expect(text).not.toContain('Refusé');
    act(() => root.unmount());
  });

  it('says when the disk cannot be measured', async () => {
    const { container, root } = await render({
      disk: null,
      lastRetentionRun: {
        trigger: 'cli',
        finishedAt: '2026-09-30T03:15:00.000Z',
        auditsDeleted: 0,
        auditsSlimmed: 0,
        versionsDeleted: 0,
        auditsHeld: 0,
        bytesReclaimedLocal: 0,
        failureCount: 0,
        refused: true,
      },
    });

    expect(container.textContent).toContain('L’espace disque ne peut pas être mesuré');
    expect(container.textContent).toContain('Refusé : trop d’audits');
    act(() => root.unmount());
  });
});
