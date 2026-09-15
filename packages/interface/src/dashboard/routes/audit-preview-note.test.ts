// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { AuditPreviewNote } from './audit-preview-note';

// Plan 040 slice 5: the read-only preview note that replaced the plan 037
// outreach card. Publication, revocation, and the first-draft coverage
// moved behind the hub's Apercu section (see hub-preview-section.test.ts);
// what is left on the audit page is the scorecard view and the operator
// PDF for an audit with no prospect, and one link for a prospect-linked
// one. The same createElement discipline as the other dashboard suites:
// the workspace vitest glob only collects .ts suites, so no JSX here.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    // The preview-note fetch dance inspects the content type before the
    // bytes reach the browser, so the stub must carry a header reader.
    headers: { get: () => 'application/json' },
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

async function renderNote(props: {
  auditId: string;
  prospectId: string | null;
}): Promise<{ root: Root }> {
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
          null,
          createElement(AuditPreviewNote, {
            auditId: props.auditId,
            prospectId: props.prospectId,
          }),
        ),
      ),
    );
  });
  return { root };
}

async function clickButton(label: string): Promise<void> {
  const button = await waitFor(() =>
    [...document.querySelectorAll('button')].find((element) =>
      element.textContent?.includes(label),
    ),
  );
  await act(async () => {
    button.click();
  });
  await pause();
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(label),
  );
}

describe('AuditPreviewNote', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/outreach-preview')) {
        return jsonResponse({ rendered: true, html: '<main>Synthèse</main>' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders one line to the hub for a prospect-linked audit, with no preview actions', async () => {
    const { root } = await renderNote({ auditId: 'audit-1', prospectId: 'prospect-1' });
    await pause();

    const link = document.querySelector('a[href="/prospects/prospect-1#emails"]');
    expect(link?.textContent).toContain('Aperçu géré depuis la fiche du prospect');
    expect(findButton('Afficher l’aperçu')).toBeUndefined();
    expect(findButton('Télécharger le PDF')).toBeUndefined();
    // Slice 4 moved these to the hub; they must not reappear here.
    expect(findButton('Publier l’aperçu')).toBeUndefined();
    expect(findButton('Retirer l’aperçu')).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('fetches the scorecard only when opened and embeds it in an empty sandbox', async () => {
    const { root } = await renderNote({ auditId: 'audit-1', prospectId: null });
    const renderUrl = '/api/audits/audit-1/outreach-preview';

    await pause();
    expect(document.querySelector('iframe')).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(renderUrl);

    await clickButton('Afficher l’aperçu');

    const iframe = await waitFor(() => document.querySelector('iframe') ?? undefined);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(renderUrl);
    expect(iframe.hasAttribute('sandbox')).toBe(true);
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('srcdoc')).toBe('<main>Synthèse</main>');

    await act(async () => {
      root.unmount();
    });
  });

  it('regenerates an open scorecard from the latest confirmed audit data', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ rendered: true, html: '<main>Note A</main>' }))
      .mockResolvedValueOnce(jsonResponse({ rendered: true, html: '<main>Note D</main>' }));
    const { root } = await renderNote({ auditId: 'audit-1', prospectId: null });

    await clickButton('Afficher l’aperçu');
    expect(
      (await waitFor(() => document.querySelector('iframe') ?? undefined)).getAttribute('srcdoc'),
    ).toBe('<main>Note A</main>');

    await clickButton('Régénérer l’aperçu');
    expect(
      await waitFor(() => {
        const value = document.querySelector('iframe')?.getAttribute('srcdoc');
        return value === '<main>Note D</main>' ? value : undefined;
      }),
    ).toBe('<main>Note D</main>');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('explains a render refusal with its sentence instead of an iframe', async () => {
    // The scorecard fetch is the note's first fetch, so a one-shot override
    // is enough.
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ rendered: false, refusal: 'coverage-incomplete' }),
    );
    const { root } = await renderNote({ auditId: 'audit-1', prospectId: null });

    await clickButton('Afficher l’aperçu');

    await waitFor(() =>
      (document.body.textContent ?? '').includes('refuse d’inventer des chiffres')
        ? true
        : undefined,
    );
    expect(document.querySelector('iframe')).toBeNull();
    // The refusal state keeps an actionable path.
    expect(findButton('Réessayer')).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('answers a PDF readiness refusal with a sentence, never a downloaded file', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/outreach-preview/pdf')) {
        return jsonResponse({ refusal: 'not-an-outreach-audit' });
      }
      return jsonResponse({});
    });
    const { root } = await renderNote({ auditId: 'audit-1', prospectId: null });

    await clickButton('Télécharger le PDF');

    await waitFor(() =>
      (document.body.textContent ?? '').includes('n’est pas lié à un prospect de la campagne')
        ? true
        : undefined,
    );
    // The refusal is a notice on the page, not a navigation and not a
    // corrupt file handed to the browser.
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/outreach-preview/pdf')),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
