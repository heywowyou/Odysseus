// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { InfoTip } from './info-tip';

/** Plan 022 step 6, finding A15: the hint must open for keyboard users, not
 *  only on pointer hover. The trigger is a real button, and focusing it (or
 *  entering it with a pointer) shows the hint content; the assertion reads
 *  the portal the tooltip renders into. Keyboard operation at real contrast
 *  stays with the operator's manual checklist - jsdom cannot measure it. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderTip(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(InfoTip, { label: 'Score', hint: 'A versioned score combining severity.' }),
    );
  });
  return { container, root };
}

function hintVisible(): boolean {
  return document.body.textContent?.includes('A versioned score combining severity.') ?? false;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  throw new Error('Condition not met within the wait budget');
}

describe('InfoTip', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a focusable trigger carrying the localized label', async () => {
    const { container, root } = await renderTip();
    const trigger = container.querySelector('button');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-label')).toBe('Score');
    root.unmount();
  });

  it('shows the hint when the trigger receives keyboard focus', async () => {
    const { container, root } = await renderTip();
    const trigger = container.querySelector('button');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger?.focus();
    });
    await waitFor(hintVisible);
    root.unmount();
  });

  it('hides the hint again when the trigger loses focus', async () => {
    const { container, root } = await renderTip();
    const trigger = container.querySelector('button');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger?.focus();
    });
    await waitFor(hintVisible);
    await act(async () => {
      trigger?.blur();
    });
    await waitFor(() => !hintVisible());
    root.unmount();
  });
});
