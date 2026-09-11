// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { OutreachPreviewCard } from './audit-detail';

// Plan 037 slice 5: the audit page's outreach preview card. The same
// createElement discipline as the other dashboard suites: the workspace
// vitest glob only collects .ts files, so no JSX here. Rendering is direct
// (the card takes props and reads no route), with the i18n provider around
// it exactly like preview.test.ts does for its page.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LANGUAGE_STORAGE_KEY = 'odysseus.dashboard.language';

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

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value !== undefined) return value;
    await pause();
  }
  throw new Error('condition did not become true');
}

interface CardProps {
  auditId: string;
  candidateId: string | null;
  hasLiveV2Preview: boolean;
}

async function renderCard(
  props: CardProps = {
    auditId: 'audit-1',
    candidateId: 'candidate-1',
    hasLiveV2Preview: false,
  },
): Promise<{ root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(OutreachPreviewCard, {
          auditId: props.auditId,
          candidateId: props.candidateId,
          hasLiveV2Preview: props.hasLiveV2Preview,
          refresh: () => {},
        }),
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

describe('OutreachPreviewCard', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/outreach-preview/publish')) {
        return jsonResponse({
          published: true,
          previewId: 'preview-2',
          url: 'https://www.odysseusaudit.com/apercu/one-time-token',
          publicExpiresAt: '2026-10-01T00:00:00.000Z',
        });
      }
      if (url.endsWith('/outreach-preview/revoke')) {
        return jsonResponse({ revoked: 1, alreadyRevoked: 0 });
      }
      if (url.includes('/outreach/draft')) {
        return jsonResponse({ created: false, refusal: 'preview-not-published' });
      }
      if (url.endsWith('/outreach-preview')) {
        return jsonResponse({ rendered: true, html: '<main>Synthèse</main>' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('renders French copy by default and English copy from the stored language', async () => {
    const { root } = await renderCard();
    await waitFor(() =>
      (document.body.textContent ?? '').includes('Aperçu de prospection') ? true : undefined,
    );
    await act(async () => {
      root.unmount();
    });

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    const { root: enRoot } = await renderCard();
    await waitFor(() =>
      (document.body.textContent ?? '').includes('Outreach preview') ? true : undefined,
    );
    await act(async () => {
      enRoot.unmount();
    });
  });

  it('fetches the scorecard only when opened and embeds it in an empty sandbox', async () => {
    const { root } = await renderCard();
    const renderUrl = '/api/audits/audit-1/outreach-preview';

    await pause();
    expect(document.querySelector('iframe')).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(renderUrl);

    await clickButton('Afficher la synthèse');

    const iframe = await waitFor(() => document.querySelector('iframe') ?? undefined);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(renderUrl);
    expect(iframe.hasAttribute('sandbox')).toBe(true);
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('srcdoc')).toBe('<main>Synthèse</main>');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the published one-time link once with a copy button after the publish flow', async () => {
    const { root } = await renderCard({
      auditId: 'audit-1',
      candidateId: 'candidate-1',
      hasLiveV2Preview: false,
    });

    await clickButton('Publier l’aperçu');
    // The confirm dialog is radix-mounted at the end of body, so its footer
    // button is the last match for the action label.
    const confirm = [...document.querySelectorAll('button')].at(-1);
    expect(confirm?.textContent).toContain('Publier l’aperçu');
    await act(async () => {
      confirm?.click();
    });

    await waitFor(() =>
      (document.body.textContent ?? '').includes('one-time-token') ? true : undefined,
    );
    expect(document.body.textContent ?? '').toContain('une seule fois');
    expect(findButton('Copier le lien')).not.toBeNull();
    // Holding the one-time token enables the first draft immediately.
    const draft = findButton('Créer le premier brouillon');
    expect(draft?.disabled).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('offers no publication actions for a non-candidate audit', async () => {
    const { root } = await renderCard({
      auditId: 'audit-1',
      candidateId: null,
      hasLiveV2Preview: false,
    });
    await pause();

    expect(findButton('Publier l’aperçu')).toBeUndefined();
    expect(findButton('Retirer l’aperçu')).toBeUndefined();
    expect(findButton('Créer le premier brouillon')).toBeUndefined();
    expect(findButton('Afficher la synthèse')).toBeDefined();
    // The PDF control fetches the bytes itself (a refusal must become a
    // sentence, never a downloaded JSON file), so it is a button.
    expect(findButton('Télécharger le PDF')).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('disables the first draft until a preview exists in this session or on the server', async () => {
    const { root } = await renderCard({
      auditId: 'audit-1',
      candidateId: 'candidate-1',
      hasLiveV2Preview: false,
    });
    const draft = await waitFor(() => findButton('Créer le premier brouillon'));
    expect(draft.disabled).toBe(true);
    await act(async () => {
      root.unmount();
    });

    const { root: liveRoot } = await renderCard({
      auditId: 'audit-1',
      candidateId: 'candidate-1',
      hasLiveV2Preview: true,
    });
    const liveDraft = await waitFor(() => findButton('Créer le premier brouillon'));
    expect(liveDraft.disabled).toBe(false);
    await act(async () => {
      liveRoot.unmount();
    });
  });

  it('sends the draft call and points at the reissue remedy on preview-not-published', async () => {
    const { root } = await renderCard({
      auditId: 'audit-1',
      candidateId: 'candidate-1',
      hasLiveV2Preview: true,
    });

    await clickButton('Créer le premier brouillon');

    const draftCall = await waitFor(() =>
      fetchMock.mock.calls.find(([url]) => String(url).includes('/outreach/draft')),
    );
    expect(JSON.parse(String((draftCall?.[1] as RequestInit).body))).toEqual({ previewToken: '' });
    await waitFor(() =>
      (document.body.textContent ?? '').includes('Réémettez un lien') ? true : undefined,
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('revokes through the confirmation dialog', async () => {
    const { root } = await renderCard({
      auditId: 'audit-1',
      candidateId: 'candidate-1',
      hasLiveV2Preview: true,
    });

    await clickButton('Retirer l’aperçu');
    const confirm = [...document.querySelectorAll('button')].at(-1);
    expect(confirm?.textContent).toContain('Retirer l’aperçu');
    await act(async () => {
      confirm?.click();
    });

    await waitFor(() =>
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/outreach-preview/revoke'))
        ? true
        : undefined,
    );

    await act(async () => {
      root.unmount();
    });
  });

  it('says why in a sentence when the publish refuses', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'test-toast');
    // The publish is the card's first fetch, so a one-shot override is enough.
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ published: false, refusal: 'suppressed' }),
    );
    const { root } = await renderCard();

    await clickButton('Publier l’aperçu');
    const confirm = [...document.querySelectorAll('button')].at(-1);
    await act(async () => {
      confirm?.click();
    });
    await waitFor(() => (errorSpy.mock.calls.length > 0 ? true : undefined));
    expect(errorSpy).toHaveBeenCalledWith('Ce domaine figure sur la liste à ne pas contacter.');

    await act(async () => {
      root.unmount();
    });
    errorSpy.mockRestore();
  });

  it('explains a render refusal with its sentence instead of an iframe', async () => {
    // The scorecard fetch is the card's first fetch, so a one-shot override
    // is enough.
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ rendered: false, refusal: 'coverage-incomplete' }),
    );
    const { root } = await renderCard();

    await clickButton('Afficher la synthèse');

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

  it('maps a contact refusal of the draft action to its sentence', async () => {
    const errorSpy = vi.spyOn(toast, 'error').mockImplementation(() => 'test-toast');
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ created: false, refusal: 'address-suppressed' }),
    );
    const { root } = await renderCard({
      auditId: 'audit-1',
      candidateId: 'candidate-1',
      hasLiveV2Preview: true,
    });

    await clickButton('Créer le premier brouillon');

    await waitFor(() => (errorSpy.mock.calls.length > 0 ? true : undefined));
    expect(errorSpy).toHaveBeenCalledWith('Cette adresse figure sur la liste à ne pas contacter.');
    // The reissue hint is for unusable links only, not for contact refusals.
    expect(document.body.textContent ?? '').not.toContain('Réémettez un lien');

    await act(async () => {
      root.unmount();
    });
    errorSpy.mockRestore();
  });
});
