// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { I18nProvider } from './i18n/provider';
import { DraftsPage } from './routes/drafts';
import { OutreachIndexPage } from './routes/outreach-index';
import { ProspectsPage } from './routes/prospects';
import { SuppressionsPage } from './routes/suppressions';

/** Plan 013 step 5: axe must report zero violations on representative
 *  operator pages. The pages render through the real providers and the
 *  real empty states; the data-backed pages see a stubbed fetch returning
 *  an empty page so the scanned DOM is the settled, populated chrome.
 *  Keyboard operation, focus visibility at real contrast, and narrow-width
 *  table behaviour stay with the operator's manual checklist and the
 *  live review - jsdom cannot measure them. The file stays .ts with
 *  createElement because the workspace vitest glob only collects .ts
 *  suites. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function withProviders(child: React.ReactElement): React.ReactElement {
  return createElement(I18nProvider, null, createElement(MemoryRouter, null, child));
}

function emptyPage(): unknown {
  return { rows: [], total: 0, limit: 50, offset: 0 };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

async function renderPage(
  element: React.ReactElement,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(withProviders(element));
  });
  return { container, root };
}

/** Resolves once the container shows the expected settled text or the
 *  budget runs out, so a slow polling fetch cannot race the scan. */
async function settle(container: HTMLElement, expected: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (container.textContent?.includes(expected)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error(`Page did not settle on the expected text: ${expected}`);
}

/** vitest-axe's shipped expect extension is missing its compiled entry
 *  point, so the assertion is spelled out: fail with the violation ids
 *  and help text, pass on an empty list. */
async function expectNoAxeViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  const summary = (results.violations ?? [])
    .map((violation) => `${violation.id}: ${violation.help}`)
    .join('; ');
  expect(summary, summary).toBe('');
}

describe('operator page accessibility (plan 013 step 5)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(emptyPage())),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('prospects list has no axe violations in its empty state', async () => {
    const { container, root } = await renderPage(createElement(ProspectsPage));
    await settle(container, 'Aucun prospect ne correspond à ces filtres.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('outreach hub has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(OutreachIndexPage));
    await settle(container, 'Brouillons');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('drafts review page has no axe violations in its empty state', async () => {
    const { container, root } = await renderPage(createElement(DraftsPage));
    await settle(container, 'Aucun brouillon en attente de revue.');
    await expectNoAxeViolations(container);
    root.unmount();
  });

  it('suppression lookup form has no axe violations', async () => {
    const { container, root } = await renderPage(createElement(SuppressionsPage));
    await settle(container, 'Vérifier');
    await expectNoAxeViolations(container);
    root.unmount();
  });
});
