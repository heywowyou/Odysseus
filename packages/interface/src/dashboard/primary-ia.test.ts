// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app/shell';
import { I18nProvider } from './i18n/provider';
import { en } from './i18n/en';
import { fr } from './i18n/fr';

/**
 * Plan 060 §16, amended 2026-10-10: the shell's primary navigation renders
 * exactly À traiter, Prospects, Audits and the campaign results page the
 * operator asked to have there. Directory and results stay modes inside
 * Prospects. Asserted against what actually renders (the shell's <nav>
 * anchors), not against the route table.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubTodo(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        rows: [],
        attentionCount: 0,
        summary: {
          activeProspects: 0,
          auditedProspects: 0,
          actionableItems: 0,
          actionableProspects: 0,
          kindCounts: {
            draft: 0,
            reply: 0,
            'follow-up': 0,
            'first-email': 0,
            'audit-input': 0,
            'audit-report': 0,
            'report-quality-review': 0,
          },
          mailboxConfigured: false,
          lastSyncAt: null,
        },
      }),
    })),
  );
}

async function renderShell(language: 'fr' | 'en'): Promise<{ container: HTMLElement; root: Root }> {
  window.localStorage.setItem('odysseus.dashboard.language', language);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(MemoryRouter, { initialEntries: ['/a-traiter'] }, createElement(AppShell)),
      ),
    );
  });
  // The shell's attention-count fetch resolves on the polling controller's
  // own timer; drain it inside act so no state update lands outside one.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { container, root };
}

describe('primary information architecture (plan 060 §7)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it.each(['fr', 'en'] as const)(
    'renders exactly the four destinations in the primary nav, in %s',
    async (language) => {
      stubTodo();
      const { container, root } = await renderShell(language);
      const strings = language === 'fr' ? fr : en;
      const nav = container.querySelector(`nav[aria-label="${strings.shell.navigation}"]`);
      expect(nav, 'the shell must render its primary navigation').not.toBeNull();

      const links = [...nav!.querySelectorAll('a')];
      expect(links, 'no fifth primary destination may appear').toHaveLength(4);
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/audits',
        '/a-traiter',
        '/prospects',
        '/campagne',
      ]);
      // Each destination carries its operator label from the nav copy.
      const expectedLabels: Record<string, string> = {
        '/audits': strings.nav.audits,
        '/prospects': strings.nav.prospects,
        '/a-traiter': strings.nav.outreach,
        '/campagne': strings.nav.campaign,
      };
      for (const link of links) {
        expect(link.textContent?.trim()).toBe(expectedLabels[link.getAttribute('href') ?? '']);
      }
      expect([
        strings.nav.audits,
        strings.nav.outreach,
        strings.nav.prospects,
        strings.nav.campaign,
      ]).toEqual(
        language === 'fr'
          ? ['Audits', 'À traiter', 'Prospects', 'Résultats de campagne']
          : ['Audits', 'To do', 'Prospects', 'Campaign results'],
      );
      await act(async () => {
        root.unmount();
      });
    },
  );
});
