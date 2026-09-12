// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { ProspectDetailPage } from './prospect-detail';
import { websiteHref } from './hub-fiche-section';
import type { ProspectDetailResponse } from './prospects-model';

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

function detailWithContact(contact: ProspectDetailResponse['contact']): ProspectDetailResponse {
  return {
    candidateId: 'candidate-1',
    resolutionVersion: 'v1',
    identityKey: 'key-1',
    identityStatus: 'resolved',
    matchedOn: null,
    siret: null,
    siren: null,
    name: 'Hôtel Exemple',
    commune: 'GRENOBLE',
    postcode: '38000',
    starRating: null,
    roomCount: null,
    capacity: null,
    campaignEligibility: 'eligible',
    groupStatus: 'independent',
    groupDomain: null,
    groupSize: null,
    ownRegistrableDomain: 'hotel-exemple.fr',
    domainProvenance: null,
    declaredRegistrableDomain: null,
    reviewState: 'not-required',
    review: { queuedReason: null, actor: null, reason: null, decidedAt: null },
    qualificationOutcome: 'qualified',
    prescanStatus: null,
    websites: [],
    conflicts: [],
    sourceRefs: [],
    qualification: null,
    qualificationHistory: { rows: [], total: 0, limit: 10, offset: 0 },
    prescan: null,
    score: null,
    evidence: null,
    preview: null,
    contact,
    thread: null,
    outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
    outreachScan: { canStart: false },
  };
}

async function renderDetail(initialEntry: string = '/prospects/candidate-1'): Promise<void> {
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
          { initialEntries: [initialEntry] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/prospects/:candidateId',
              element: createElement(ProspectDetailPage),
            }),
          ),
        ),
      ),
    );
  });
}

/** The hub's whole text: the contact rows render inside the Fiche
 *  section since the hub merged the former per-topic cards. */
function pageText(): string {
  return document.body.textContent ?? '';
}

describe('websiteHref', () => {
  it('keeps an https value unchanged', () => {
    expect(websiteHref('https://ok.example')).toBe('https://ok.example');
  });

  it('keeps an http value unchanged', () => {
    expect(websiteHref('http://ok.example/page')).toBe('http://ok.example/page');
  });

  it('https-prefixes a scheme-less host', () => {
    expect(websiteHref('www.example.fr')).toBe('https://www.example.fr');
  });

  it('rejects a javascript scheme', () => {
    expect(websiteHref('javascript:alert(1)')).toBeUndefined();
  });

  it('rejects a data scheme', () => {
    expect(websiteHref('data:text/html,<h1>x</h1>')).toBeUndefined();
  });

  it('rejects a mailto scheme', () => {
    expect(websiteHref('mailto:contact@example.fr')).toBeUndefined();
  });
});

describe('ProspectDetailPage contact section (issue #95)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      jsonResponse(
        detailWithContact({
          contactId: 'contact-1',
          contactVersion: 'v1',
          cohortId: 'cohort-1',
          domain: 'hotel-exemple.fr',
          state: 'rejected',
          reason: 'named-local-parts-only',
          mxStatus: 'unknown',
          sourceKind: null,
          validatedAt: '2026-08-29T00:28:00.000Z',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders labelled operator copy instead of raw field names', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Décision') ? true : undefined));
    await pause();

    const text = pageText();
    expect(text).toContain('Décision');
    expect(text).toContain('Inutilisable');
    expect(text).toContain('Motif');
    expect(text).toContain('Seules des boîtes nominatives sont publiées');
    expect(text).toContain('Boîte aux lettres');
    expect(text).toContain('Le domaine n’a pas pu être vérifié');
    expect(text).not.toContain('mxStatus');
    expect(text).not.toContain('named-local-parts-only');
  });

  it('omits the source row when the contact carries no source kind', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Décision') ? true : undefined));
    await pause();

    expect(pageText()).not.toContain('Source');
  });
});

describe('ProspectDetailPage section deep links (plan 040 slice 7)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => jsonResponse(detailWithContact(null)));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('scrolls to the hashed section once the detail has loaded', async () => {
    const calls: string[] = [];
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element): void {
      calls.push(this.id);
    };
    try {
      await renderDetail('/prospects/candidate-1#hub-emails');
      await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
      await pause();
      expect(calls).toEqual(['hub-emails']);
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('does not scroll without a hash', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      await renderDetail();
      await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
      await pause();
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

async function clickButton(label: string, root?: ParentNode): Promise<void> {
  const scope = root ?? document;
  const button = await waitFor(() =>
    [...scope.querySelectorAll('button')].find((element) => element.textContent?.includes(label)),
  );
  await act(async () => {
    button.click();
  });
  await pause();
}

describe('ProspectDetailPage tabs (plan 042 slice 1)', () => {
  const fetchMock = vi.fn();

  const detailWithAudit = (): ProspectDetailResponse => ({
    ...detailWithContact(null),
    outreachScan: { canStart: false },
    outreachAudit: {
      auditId: 'audit-1',
      startedAt: '2026-09-01T10:00:00.000Z',
      severityRollup: { critical: 1, serious: 0, moderate: 2, minor: 3 },
    },
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/outreach-preview/publish')) {
        return jsonResponse({
          published: true,
          previewId: 'preview-1',
          url: 'https://apercu.example.fr/apercu/token-abc',
          publicExpiresAt: '2099-01-01T00:00:00.000Z',
        });
      }
      return jsonResponse(detailWithAudit());
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders one panel at a time and switches on the strip', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(document.getElementById('hub-fiche')).not.toBeNull();
    expect(document.getElementById('hub-preview')).toBeNull();

    await clickButton('Publier l’aperçu');
    expect(document.getElementById('hub-preview')).not.toBeNull();
    expect(document.getElementById('hub-fiche')).toBeNull();

    await clickButton('Contrôle rapide');
    expect(document.getElementById('hub-quick-check')).not.toBeNull();
  });

  it('keeps the one-time publish link across tab switches', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    // The header's primary action lands on the Aperçu tab.
    await clickButton('Publier l’aperçu');
    const panel = document.getElementById('hub-preview');
    expect(panel).not.toBeNull();

    // Publish from inside the section: confirm the dialog.
    await clickButton('Publier l’aperçu', panel ?? undefined);
    await clickButton('Publier l’aperçu', document.querySelector('[role="dialog"]') ?? undefined);
    await pause();
    expect(pageText()).toContain('Conservez ce lien maintenant');

    // Leave the tab and come back: the page (not the section) owns the
    // link and its token, so the one-time link must still be shown.
    await clickButton('Contrôle rapide');
    expect(pageText()).not.toContain('Conservez ce lien maintenant');
    await clickButton('Aperçu');
    expect(pageText()).toContain('Conservez ce lien maintenant');
  });
});
