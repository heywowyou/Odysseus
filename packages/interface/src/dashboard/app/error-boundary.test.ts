// @vitest-environment jsdom

import { Component, createElement, type ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { I18nProvider } from '../i18n/provider';
import { fr } from '../i18n/fr';
import { App } from '../App';
import { DashboardErrorBoundary } from './error-boundary';

/** Issue #228 regression coverage. Mirrors accessibility.test.ts's render
 *  harness (createElement + react-dom/client, .ts so the workspace vitest
 *  glob collects the file) rather than pulling in a testing-library
 *  dependency the workspace does not otherwise use. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SENSITIVE_ERROR_MESSAGE = 'raw-secret-token-should-never-reach-the-dom';

/** Throws on demand from render, the shape a real component exception takes
 *  (a malformed record, a formatting bug). `shouldThrow` is read fresh on
 *  every render, so flipping it and retrying can be observed clearing the
 *  error without remounting the tree. */
class Bomb extends Component<{ shouldThrow: () => boolean }> {
  override render(): ReactNode {
    if (this.props.shouldThrow()) {
      throw new Error(SENSITIVE_ERROR_MESSAGE);
    }
    return createElement('p', null, 'safe page content');
  }
}

async function renderAtBroken(shouldThrow: () => boolean): Promise<{
  container: HTMLElement;
  root: Root;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(
          MemoryRouter,
          { initialEntries: ['/broken'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/broken',
              element: createElement(
                DashboardErrorBoundary,
                null,
                createElement(Bomb, { shouldThrow }),
              ),
            }),
            createElement(Route, {
              path: '/a-traiter',
              element: createElement('p', null, 'landing page reached'),
            }),
          ),
        ),
      ),
    );
  });
  return { container, root };
}

describe('dashboard error boundary (issue #228)', () => {
  beforeEach(() => {
    // The thrown error also reaches React's own dev-mode console logging in
    // addition to this component's componentDidCatch; both are expected
    // noise for these tests, not a signal to assert on.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the recovery screen instead of a blank app when a child throws during render', async () => {
    const { container, root } = await renderAtBroken(() => true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain(fr.errorBoundary.heading);
    root.unmount();
  });

  it('renders the route normally, with no recovery screen, when nothing throws', async () => {
    const { container, root } = await renderAtBroken(() => false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('safe page content');
    expect(container.textContent).not.toContain(fr.errorBoundary.heading);
    root.unmount();
  });

  it('offers a usable reload action and a usable retry action', async () => {
    let shouldThrow = true;
    const { container, root } = await renderAtBroken(() => shouldThrow);
    const buttons = [...container.querySelectorAll('button')];
    const retryButton = buttons.find(
      (button) => button.textContent === fr.errorBoundary.retryButton,
    );
    const reloadButton = buttons.find(
      (button) => button.textContent === fr.errorBoundary.reloadButton,
    );
    expect(retryButton).toBeDefined();
    expect(reloadButton).toBeDefined();

    // The next attempt succeeds once the underlying cause is gone, proving
    // retry actually re-attempts rendering the children rather than only
    // toggling UI state.
    shouldThrow = false;
    await act(async () => {
      retryButton?.click();
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('safe page content');
    root.unmount();
  });

  it('offers a safe navigation path back to the to-do list that actually navigates', async () => {
    const { container, root } = await renderAtBroken(() => true);
    const homeLink = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === fr.errorBoundary.homeButton,
    );
    expect(homeLink).toBeDefined();
    await act(async () => {
      homeLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('landing page reached');
    root.unmount();
  });

  it("never renders the thrown error object's own message", async () => {
    const { container, root } = await renderAtBroken(() => true);
    expect(container.textContent).not.toContain(SENSITIVE_ERROR_MESSAGE);
    root.unmount();
  });

  it('shows a copyable, non-secret incident id and the current route', async () => {
    const { container, root } = await renderAtBroken(() => true);
    expect(container.textContent).toContain(fr.errorBoundary.incidentLabel);
    expect(container.textContent).toContain(fr.errorBoundary.routeLabel);
    expect(container.textContent).toContain('/broken');
    root.unmount();
  });

  it('renders the login route outside the authenticated recovery surface', async () => {
    // App.tsx keeps /login as a sibling of the AppShell route rather than a
    // child of it, so it never mounts DashboardErrorBoundary at all - an
    // authenticated-page crash can never take the login screen down with it,
    // and the login screen never shows the recovery UI.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(MemoryRouter, { initialEntries: ['/login'] }, createElement(App)),
        ),
      );
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain(fr.errorBoundary.heading);
    expect(container.textContent).toContain(fr.login.title);
    root.unmount();
  });

  it('has no axe violations and moves focus to the recovery heading', async () => {
    const { container, root } = await renderAtBroken(() => true);
    const heading = container.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(document.activeElement).toBe(heading);
    const results = await axe(container);
    const summary = (results.violations ?? [])
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join('; ');
    expect(summary, summary).toBe('');
    root.unmount();
  });
});
