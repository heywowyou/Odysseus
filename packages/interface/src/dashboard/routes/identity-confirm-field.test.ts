// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { I18nProvider } from '../i18n/provider';
import { IdentityConfirmField } from './identity-confirm-field';

// Plan 045 slice 1.3: the inline Confirm control for a detected identity
// field. Covers the render (label, prefilled and editable value, an
// accessible landing) and the write it fires - POST
// /api/audits/:auditId/manual-fields/confirm with the field and the
// (possibly edited) value - without asserting on the server's own
// behaviour, which make-report-ready.test.ts and the route tests own.

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

describe('IdentityConfirmField', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const fetchMock = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function renderField(onConfirmed: () => void): Promise<void> {
    await act(async () => {
      root!.render(
        createElement(
          I18nProvider,
          null,
          createElement(IdentityConfirmField, {
            auditId: 'audit-1',
            field: 'nomCommercial',
            detectedValue: '→ Les Flots Bleus · Hôtel Var, Lavandou',
            onConfirmed,
          }),
        ),
      );
    });
  }

  it('prefills the detected value, is editable, and has no axe violations', async () => {
    await renderField(() => {});
    const input = container!.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('→ Les Flots Bleus · Hôtel Var, Lavandou');

    const results = await axe(container!);
    expect(results.violations).toEqual([]);
  });

  it('confirms the edited value and reports the automatic-PDF outcome', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        manualFields: { nomCommercial: { value: 'Les Flots Bleus', provenance: 'operator' } },
        pdfs: 'generated',
      }),
    );
    const onConfirmed = vi.fn();
    await renderField(onConfirmed);

    const input = container!.querySelector('input') as HTMLInputElement;
    // React tracks the native value setter, so a plain `input.value = …`
    // assignment is invisible to its change detection; the native setter
    // has to be called directly before dispatching the input event.
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      nativeValueSetter.call(input, 'Les Flots Bleus');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const button = [...container!.querySelectorAll('button')][0]!;
    await act(async () => {
      button.click();
    });
    await pause();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/audits/audit-1/manual-fields/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ field: 'nomCommercial', value: 'Les Flots Bleus' }),
      }),
    );
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('still calls onConfirmed when the field saved but a second field is still awaited', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        manualFields: {},
        pdfs: 'waiting-other-field',
      }),
    );
    const onConfirmed = vi.fn();
    await renderField(onConfirmed);

    const button = [...container!.querySelectorAll('button')][0]!;
    await act(async () => {
      button.click();
    });
    await pause();

    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
