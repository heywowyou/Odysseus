// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { HubPreviewSection } from './hub-preview-section';

// Plan 040 slice 5: the audit page's publish, revoke, and refusal-sentence
// coverage moved here, because slice 4 moved the actions themselves to the
// hub's Apercu section. The section takes its actions as callbacks, so the
// tests assert the wiring (a confirmed dialog calls the callback) and the
// read-only rendering; the page-level token handling lives with the hub
// page. Same createElement discipline as the other dashboard suites: the
// workspace vitest glob only collects .ts suites, so no JSX here.

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

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value !== undefined) return value;
    await pause();
  }
  throw new Error('condition did not become true');
}

function livePreview(): Record<string, unknown> {
  return {
    previewId: 'preview-1',
    name: 'Hôtel Exemple',
    commune: null,
    postcode: null,
    domain: 'exemple.fr',
    language: 'fr',
    status: 'live',
    publishedAt: '2026-09-01T09:00:00.000Z',
    publicExpiresAt: '2099-01-01T00:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
    prescanVersion: null,
    evidenceVersion: null,
    previewContentVersion: 'v2',
    sourceKind: 'full-audit',
  };
}

function revokedPreview(): Record<string, unknown> {
  return { ...livePreview(), status: 'revoked', revokedAt: '2026-09-02T09:00:00.000Z' };
}

async function renderSection(props: {
  preview: Record<string, unknown> | null;
  publishedLink?: string | null;
  hasTouch1Draft?: boolean;
  onPublish?: () => Promise<void>;
  onRevoke?: () => Promise<void>;
}): Promise<{ root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(HubPreviewSection, {
          auditId: 'audit-1',
          preview: props.preview as never,
          publishedLink: props.publishedLink ?? null,
          hasTouch1Draft: props.hasTouch1Draft ?? false,
          isBusy: false,
          onPublish: props.onPublish ?? (async () => {}),
          onRevoke: props.onRevoke ?? (async () => {}),
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

describe('HubPreviewSection action wiring', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      jsonResponse({ rendered: true, html: '<main></main>' }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('offers publish for a prospect with no live preview and calls onPublish directly, no confirmation', async () => {
    const onPublish = vi.fn(async () => {});
    const { root } = await renderSection({ preview: null, onPublish });

    // Plan 045 section 2.4: a first publish is a plain action, nobody holds
    // a link yet, so no confirm dialog stands in front of it.
    await clickButton('Publier l’aperçu');
    await waitFor(() => (onPublish.mock.calls.length > 0 ? true : undefined));
    // A publish in flight, no takedown yet: nothing is live.
    expect(
      [...document.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Retirer l’aperçu'),
      ),
    ).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });

  it('reissues over a live preview directly when no touch-1 draft holds the link', async () => {
    const onPublish = vi.fn(async () => {});
    const { root } = await renderSection({
      preview: revokedPreview(),
      onPublish,
      hasTouch1Draft: false,
    });

    await clickButton('Réémettre un lien');
    await waitFor(() => (onPublish.mock.calls.length > 0 ? true : undefined));

    await act(async () => {
      root.unmount();
    });
  });

  it('asks for confirmation before reissuing over a touch-1 draft that already carries the link', async () => {
    const onPublish = vi.fn(async () => {});
    const { root } = await renderSection({
      preview: revokedPreview(),
      onPublish,
      hasTouch1Draft: true,
    });

    await clickButton('Réémettre un lien');
    expect(onPublish).not.toHaveBeenCalled();
    // The confirm dialog is radix-mounted at the end of body, so its
    // footer button is the last match for the action label.
    const confirm = [...document.querySelectorAll('button')].at(-1);
    expect(confirm?.textContent).toContain('Réémettre un lien');
    await act(async () => {
      confirm?.click();
    });
    await waitFor(() => (onPublish.mock.calls.length > 0 ? true : undefined));

    await act(async () => {
      root.unmount();
    });
  });

  it('offers the takedown only for a live preview and calls onRevoke after confirmation', async () => {
    const onRevoke = vi.fn(async () => {});
    const { root } = await renderSection({ preview: livePreview(), onRevoke });

    await clickButton('Retirer l’aperçu');
    const confirm = [...document.querySelectorAll('button')].at(-1);
    expect(confirm?.textContent).toContain('Retirer l’aperçu');
    await act(async () => {
      confirm?.click();
    });
    await waitFor(() => (onRevoke.mock.calls.length > 0 ? true : undefined));
    // The preview is live, so publishing is not offered; reissue replaces it.
    expect(findPublishButton()).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
  });

  it('shows the once-only published link with a copy button while it is held', async () => {
    const { root } = await renderSection({
      preview: null,
      publishedLink: 'https://www.odysseusaudit.com/apercu/one-time-token',
    });
    await waitFor(() =>
      (document.body.textContent ?? '').includes('one-time-token') ? true : undefined,
    );
    expect(document.body.textContent ?? '').toContain('une seule fois');
    expect(
      [...document.querySelectorAll('button')].some((button) =>
        button.textContent?.includes('Copier le lien'),
      ),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('explains a render refusal with its sentence instead of an iframe', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ rendered: false, refusal: 'coverage-incomplete' }),
    );
    const { root } = await renderSection({ preview: null });

    await clickButton('Afficher l’aperçu');

    await waitFor(() =>
      (document.body.textContent ?? '').includes('refuse d’inventer des chiffres')
        ? true
        : undefined,
    );
    expect(document.querySelector('iframe')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });
});

function findPublishButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((element) =>
    element.textContent?.includes('Publier l’aperçu'),
  );
}
