// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { ProspectDetailPage } from './prospect-detail';
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
    contact,
    thread: null,
    outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
  };
}

async function renderDetail(): Promise<void> {
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
          { initialEntries: ['/prospects/candidate-1'] },
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

/** The Contact card's own section element, found by its h2 title. */
function contactCard(): HTMLElement | undefined {
  const heading = [...document.querySelectorAll('h2')].find(
    (node) => node.textContent === 'Contact',
  );
  return heading?.closest('section') ?? undefined;
}

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
    await waitFor(() => (contactCard() !== undefined ? true : undefined));
    await pause();

    const text = contactCard()?.textContent ?? '';
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
    await waitFor(() => (contactCard() !== undefined ? true : undefined));
    await pause();

    expect(contactCard()?.textContent ?? '').not.toContain('Source');
  });
});
