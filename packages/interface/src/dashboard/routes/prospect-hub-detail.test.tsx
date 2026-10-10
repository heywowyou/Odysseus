// @vitest-environment jsdom

/**
 * Characterization tests for the prospect page (issue #532), written before
 * it was split into panels: the fully loaded page's markup, and the request
 * each panel's main controls send. The split had to leave both unchanged.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { ProspectHubDetailPage } from './prospect-hub-detail';
import { ACTIONABILITY, PROSPECT } from './prospect-detail/test-fixture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Call {
  method: string;
  url: string;
  body: unknown;
}

let calls: Call[] = [];

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  // The snapshot holds relative times ("il y a 6 jours"), so the clock is
  // frozen at the moment it was recorded. Only Date is faked: rendering
  // still needs real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-25T04:00:00.000Z') });
  calls = [];
  window.localStorage.setItem('odysseus.dashboard.language', 'fr');
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'GET' && url === '/api/prospects/prospect-1') return jsonResponse(PROSPECT);
      if (url === '/api/prospects/prospect-1/actionability') return jsonResponse(ACTIONABILITY);
      if (url.endsWith('/deletion-impact')) {
        return jsonResponse({ audits: 1, findings: 12, reports: 1, previews: 1, drafts: 1 });
      }
      if (url === '/api/scans') return jsonResponse({ started: true, jobId: 'job-1' });
      return jsonResponse({ published: true, created: true });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

async function renderPage(): Promise<{ container: HTMLElement; root: Root }> {
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
          { initialEntries: ['/prospects/prospect-1'] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/prospects/:prospectId',
              element: createElement(ProspectHubDetailPage),
            }),
            createElement(Route, {
              path: '/scans/:jobId',
              element: createElement('p', null, 'scan'),
            }),
          ),
        ),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { container, root };
}

async function click(element: Element | null | undefined): Promise<void> {
  if (!element) throw new Error('element not found');
  await act(async () => {
    (element as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function choose(select: Element | null, value: string): Promise<void> {
  if (!select) throw new Error('select not found');
  await act(async () => {
    (select as HTMLSelectElement).value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function type(input: Element | null, value: string): Promise<void> {
  if (!input) throw new Error('input not found');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(root: ParentNode, text: string): Element | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

function sent(method: string, url: string): Call | undefined {
  return calls.find((call) => call.method === method && call.url === url);
}

describe('prospect page characterization (issue #532)', () => {
  it('renders every panel of a loaded prospect', async () => {
    const { container } = await renderPage();
    // React's useId values depend on tree position, not on what renders.
    const markup = container.innerHTML.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/gu, 'ID');
    expect(markup).toMatchSnapshot();
  });

  it('publishes the preview and drafts the first email from the actions panel', async () => {
    const { container } = await renderPage();
    await click(button(container, 'Publier l’aperçu'));
    expect(sent('POST', '/api/prospects/prospect-1/preview/publish')).toBeDefined();
    await click(container.querySelector('#recommended button'));
    expect(sent('POST', '/api/prospects/prospect-1/outreach/first-email')).toMatchObject({
      body: { previewToken: 'token-1' },
    });
  });

  it('adds a website and an email, and saves an identity edit', async () => {
    const { container } = await renderPage();
    await type(
      container.querySelector('input[aria-label="Ajouter un site"]'),
      'https://new.fixture.example',
    );
    await click(button(container, 'Ajouter un site'));
    expect(sent('PATCH', '/api/prospects/prospect-1')?.body).toMatchObject({
      websites: expect.arrayContaining([
        expect.objectContaining({ url: 'https://new.fixture.example/' }),
      ]),
    });
    await click(button(container, 'Utiliser cette adresse'));
    expect(
      calls.some(
        (call) =>
          call.method === 'PATCH' && JSON.stringify(call.body).includes('info@fixture.example'),
      ),
    ).toBe(true);
  });

  it('discards a draft, revokes the preview and detaches an audit', async () => {
    const { container } = await renderPage();
    await click(button(container, 'Supprimer le brouillon'));
    expect(sent('POST', '/api/prospects/prospect-1/drafts/draft-1/discard')).toBeDefined();
    await click(button(container, 'Retirer l’aperçu'));
    expect(sent('POST', '/api/prospects/prospect-1/previews/preview-1/revoke')).toBeDefined();
    await click(button(container, 'Détacher'));
    expect(sent('POST', '/api/audits/audit-1/prospect')).toMatchObject({
      body: { prospectId: null },
    });
  });

  it('records a non-terminal outcome at once and asks before a terminal one', async () => {
    const { container } = await renderPage();
    const outcome = container.querySelector('select[aria-label="Enregistrer un résultat"]');
    await choose(outcome, 'reply-positive');
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toMatchObject({
      body: { outcome: 'reply-positive' },
    });
    calls = [];
    await choose(outcome, 'won');
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toBeUndefined();
    const dialog = document.body.querySelector('[role="alertdialog"], [role="dialog"]');
    await click(button(dialog!, 'Gagné'));
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toMatchObject({
      body: { outcome: 'won' },
    });
  });

  it('asks why before recording a refusal, and lets a not-now reply go without a reason', async () => {
    const { container } = await renderPage();
    const outcome = container.querySelector('select[aria-label="Enregistrer un résultat"]');
    const reason = (): Element | null =>
      container.querySelector('select[aria-label="Motif du refus"]');
    expect(reason()).toBeNull();

    await choose(outcome, 'reply-negative');
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toBeUndefined();
    expect((button(container, 'Enregistrer') as HTMLButtonElement).disabled).toBe(true);
    await choose(reason(), 'misread-offer');
    await click(button(container, 'Enregistrer'));
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toMatchObject({
      body: { outcome: 'reply-negative', lostReason: 'misread-offer' },
    });
    expect(reason()).toBeNull();

    calls = [];
    await choose(outcome, 'reply-not-now');
    expect((button(container, 'Enregistrer') as HTMLButtonElement).disabled).toBe(false);
    await click(button(container, 'Enregistrer'));
    expect(sent('POST', '/api/prospects/prospect-1/outcome')?.body).toMatchObject({
      outcome: 'reply-not-now',
    });
    expect(sent('POST', '/api/prospects/prospect-1/outcome')?.body).not.toHaveProperty(
      'lostReason',
    );

    // A lost prospect needs its reason first, then the usual confirmation.
    calls = [];
    await choose(outcome, 'lost');
    await choose(reason(), 'budget');
    await click(button(container, 'Enregistrer'));
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toBeUndefined();
    const dialog = document.body.querySelector('[role="alertdialog"], [role="dialog"]');
    await click(button(dialog!, 'Perdu'));
    expect(sent('POST', '/api/prospects/prospect-1/outcome')).toMatchObject({
      body: { outcome: 'lost', lostReason: 'budget' },
    });
  });

  it('launches a scan and archives through the impact dialog', async () => {
    const { container } = await renderPage();
    await click(button(container, 'Archiver le prospect'));
    expect(sent('GET', '/api/prospects/prospect-1/deletion-impact')).toBeDefined();
    const dialog = document.body.querySelector('[role="alertdialog"], [role="dialog"]');
    await click(button(dialog!, 'Archiver le prospect'));
    expect(sent('POST', '/api/prospects/prospect-1/archive')).toBeDefined();
    await click(button(container, 'Lancer un contrôle rapide'));
    expect(sent('POST', '/api/scans')).toMatchObject({
      body: { type: 'quick-check', url: 'https://fixture.example/' },
    });
  });
});
