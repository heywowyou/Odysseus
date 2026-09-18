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
 * Plan 060 §16, "Primary IA stays three destinations": the shell's primary
 * navigation renders exactly À traiter, Prospects and Audits — no fourth
 * primary destination, and directory/results stay modes inside Prospects.
 * Asserted against what actually renders (the shell's <nav> anchors), not
 * against the route table.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubTodo(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rows: [], attentionCount: 0 }),
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
    'renders exactly the three destinations in the primary nav, in %s',
    async (language) => {
      stubTodo();
      const { container, root } = await renderShell(language);
      const strings = language === 'fr' ? fr : en;
      const nav = container.querySelector(`nav[aria-label="${strings.shell.navigation}"]`);
      expect(nav, 'the shell must render its primary navigation').not.toBeNull();

      const links = [...nav!.querySelectorAll('a')];
      expect(links, 'no fourth primary destination may appear').toHaveLength(3);
      expect(links.map((link) => link.getAttribute('href')).sort()).toEqual(
        ['/a-traiter', '/audits', '/prospects'].sort(),
      );
      // Each destination carries its operator label from the nav copy, and
      // the labels themselves are the three destination names.
      const expectedLabels: Record<string, string> = {
        '/audits': strings.nav.audits,
        '/prospects': strings.nav.prospects,
        '/a-traiter': strings.nav.outreach,
      };
      for (const link of links) {
        expect(link.textContent?.trim()).toBe(expectedLabels[link.getAttribute('href') ?? '']);
      }
      expect([strings.nav.audits, strings.nav.outreach, strings.nav.prospects]).toEqual([
        'Audits',
        language === 'fr' ? 'À traiter' : 'To do',
        'Prospects',
      ]);
      await act(async () => {
        root.unmount();
      });
    },
  );
});
