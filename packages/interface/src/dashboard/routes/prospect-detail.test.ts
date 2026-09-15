// @vitest-environment jsdom

import { createElement, Fragment } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { fr } from '../i18n/fr';
import { actionBlockedReason, ProspectDetailPage } from './prospect-detail';
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
    businessId: null,
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
    qualificationOverride: null,
    prescanStatus: null,
    websites: [],
    conflicts: [],
    sourceRefs: [],
    qualification: null,
    qualificationHistory: { rows: [], total: 0, limit: 10, offset: 0 },
    qualificationFreshness: { state: 'missing' },
    prescanFreshness: { state: 'missing' },
    scoreFreshness: { state: 'missing' },
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

/** Issue #221: renders alongside the page (outside its matched Route, but
 *  inside the same MemoryRouter context) so tests can read the address bar
 *  the page's own navigation produced, and walk browser-style history with
 *  a real navigate(-1)/navigate(1) rather than reaching into router
 *  internals. */
function LocationProbe(): ReturnType<typeof createElement> {
  const location = useLocation();
  return createElement(
    'div',
    { 'data-testid': 'location-probe' },
    location.pathname + location.search + location.hash,
  );
}

function HistoryControls(): ReturnType<typeof createElement> {
  const navigate = useNavigate();
  return createElement(
    Fragment,
    null,
    createElement(
      'button',
      { type: 'button', 'data-testid': 'history-back', onClick: () => navigate(-1) },
      'history-back',
    ),
    createElement(
      'button',
      { type: 'button', 'data-testid': 'history-forward', onClick: () => navigate(1) },
      'history-forward',
    ),
  );
}

function currentLocation(): string {
  return document.querySelector('[data-testid="location-probe"]')?.textContent ?? '';
}

async function renderDetailWithProbe(
  initialEntry: string = '/prospects/candidate-1',
): Promise<void> {
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
            Fragment,
            null,
            createElement(LocationProbe),
            createElement(HistoryControls),
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
      ),
    );
  });
}

async function clickTestId(testId: string): Promise<void> {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (element === null) throw new Error(`no element with data-testid="${testId}"`);
  await act(async () => {
    (element as HTMLElement).click();
  });
  await pause();
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

describe('actionBlockedReason', () => {
  it('uses the specific dashboard copy for a known server refusal', () => {
    expect(actionBlockedReason({ state: 'blocked', reason: 'not-selected' }, fr, 'fr')).toBe(
      'Cet hôtel ne fait pas partie de la sélection actuelle.',
    );
  });

  it('falls back to outreach refusal copy for a non-scan reason', () => {
    expect(
      actionBlockedReason({ state: 'blocked', reason: 'audit-required' }, fr, 'fr'),
    ).not.toBeNull();
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

function notFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'not found' }),
  } as unknown as Response;
}

function buttonWithText(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

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
    const auditDetailFixture = {
      auditId: 'audit-1',
      siteUrl: 'https://exemple.fr',
      startedAt: '2026-09-01T10:00:00.000Z',
      finishedAt: '2026-09-01T10:20:00.000Z',
      pagesVisited: 12,
      lifecycle: 'rendered',
      severityRollup: { critical: 1, serious: 0, moderate: 2, minor: 3 },
      findings: [],
      findingsStale: false,
      ruleCopy: {},
      reportLanguages: [],
      reports: [
        { language: 'fr', status: 'unverified', pdfAvailable: false },
        { language: 'en', status: 'unverified', pdfAvailable: false },
      ],
      approval: null,
      manualFields: null,
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/report-preparation')) return notFoundResponse();
      if (url.endsWith('/full-audit')) {
        return jsonResponse({ started: true, jobId: 'job-9' });
      }
      if (url.endsWith('/wave')) {
        return jsonResponse({
          added: true,
          wave: 'wave-1',
          candidateId: 'candidate-1',
          domain: 'hotel-exemple.fr',
        });
      }
      if (url.endsWith('/wave/remove')) {
        return jsonResponse({ revoked: true, wave: 'wave-1', candidateId: 'candidate-1' });
      }
      if (url.includes('/outreach-preview/publish')) {
        return jsonResponse({
          published: true,
          previewId: 'preview-1',
          url: 'https://apercu.example.fr/apercu/token-abc',
          publicExpiresAt: '2099-01-01T00:00:00.000Z',
        });
      }
      if (url.endsWith('/api/audits/audit-1')) return jsonResponse(auditDetailFixture);
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

    // Plan 045 section 1.7: the primary action now creates the first
    // email directly (it publishes its own preview server-side), so this
    // switches panels through the tab strip itself instead.
    await clickButton('Aperçu');
    expect(document.getElementById('hub-preview')).not.toBeNull();
    expect(document.getElementById('hub-fiche')).toBeNull();

    await clickButton('Contrôle rapide');
    expect(document.getElementById('hub-quick-check')).not.toBeNull();
  });

  it('keeps the one-time publish link across tab switches', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    // Plan 045 section 1.7: the header's primary action creates the first
    // email directly and no longer routes through this tab, so this test
    // reaches the Aperçu tab through the tab strip to exercise the
    // section's own manual publish button.
    await clickButton('Aperçu');
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

  it('shows Rapport client whenever a full audit exists, with no sold gate (plan 045 stage 3.2)', async () => {
    // The default fixture (detailWithAudit) carries an outreachAudit and no
    // recorded outcome at all: the tab is visible purely because a full
    // audit exists, replacing the old isSold/reportRevealed double gate.
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(buttonWithText('Rapport client')).toBeDefined();
    await clickButton('Rapport client');
    expect(document.getElementById('hub-report')).not.toBeNull();
  });

  it('hides Rapport client while no full audit exists yet', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/report-preparation')) return notFoundResponse();
      return jsonResponse(detailWithContact(null));
    });
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(buttonWithText('Rapport client')).toBeUndefined();
  });
});

describe('ProspectDetailPage stage/audit deep links (issue #221)', () => {
  const fetchMock = vi.fn();

  const auditDetailFixture = (auditId: string) => ({
    auditId,
    siteUrl: 'https://exemple.fr',
    startedAt: '2026-09-01T10:00:00.000Z',
    finishedAt: '2026-09-01T10:20:00.000Z',
    pagesVisited: 12,
    lifecycle: 'rendered',
    severityRollup: { critical: 1, serious: 0, moderate: 2, minor: 3 },
    findings: [],
    findingsStale: false,
    ruleCopy: {},
    reportLanguages: [],
    reports: [
      { language: 'fr', status: 'unverified', pdfAvailable: false },
      { language: 'en', status: 'unverified', pdfAvailable: false },
    ],
    approval: null,
    manualFields: null,
  });

  const detailWithTwoAudits = (): ProspectDetailResponse => ({
    ...detailWithContact(null),
    outreachScan: { canStart: false },
    outreachAudit: {
      auditId: 'audit-1',
      startedAt: '2026-09-01T10:00:00.000Z',
      severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    },
    outreachAudits: [
      { auditId: 'audit-2', startedAt: '2026-09-05T10:00:00.000Z', jobType: 'full-audit' },
      {
        auditId: 'audit-1',
        startedAt: '2026-09-01T10:00:00.000Z',
        jobType: 'outreach-full-scan',
      },
    ],
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/report-preparation')) return notFoundResponse();
      if (url.includes('/outreach-preview/publish')) {
        return jsonResponse({
          published: true,
          previewId: 'preview-1',
          url: 'https://apercu.example.fr/apercu/token-selected',
          publicExpiresAt: '2099-01-01T00:00:00.000Z',
        });
      }
      if (url.endsWith('/api/audits/audit-1')) return jsonResponse(auditDetailFixture('audit-1'));
      if (url.endsWith('/api/audits/audit-2')) return jsonResponse(auditDetailFixture('audit-2'));
      return jsonResponse(detailWithTwoAudits());
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('opens a deep-linked tab directly, no click required', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=quick-check');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(document.getElementById('hub-quick-check')).not.toBeNull();
    expect(document.getElementById('hub-fiche')).toBeNull();
  });

  it('selects the audit named in the URL rather than defaulting to the newest', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=audit&audit=audit-1');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    // audit-1 started 2026-09-01, audit-2 (the newest) started 2026-09-05;
    // only the requested one's fetch confirms the picker honored the URL
    // instead of the default-newest fallback.
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/api/audits/audit-1')),
    ).toBe(true);
  });

  it('keeps the paid audit selection independent from preview actions', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=preview&audit=audit-2');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    await clickButton('Publier l’aperçu');
    await waitFor(() =>
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/api/audits/audit-1/outreach-preview/publish'),
      )
        ? true
        : undefined,
    );
    expect(currentLocation()).toContain('audit=audit-2');
  });

  it('publishes the outreach audit when the default selected audit is a newer paid audit', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=preview');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    await clickButton('Publier l’aperçu');
    await waitFor(() =>
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/outreach-preview/publish'))
        ? true
        : undefined,
    );
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/api/audits/audit-1/outreach-preview/publish'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes('/api/audits/audit-2/outreach-preview/publish'),
      ),
    ).toBe(false);
  });

  it('falls back to the newest owned audit for an id that does not belong to this prospect', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=audit&audit=someone-elses-audit');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(pageText()).not.toContain('someone-elses-audit');
    expect(currentLocation()).toContain('audit=audit-2');
    expect(currentLocation()).not.toContain('someone-elses-audit');
  });

  it('falls back to the fiche tab for an unrecognised tab value', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=not-a-real-tab');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(document.getElementById('hub-fiche')).not.toBeNull();
  });

  it('updates the URL when the tab strip is used, and old plain links still open the default state', async () => {
    await renderDetailWithProbe();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(document.getElementById('hub-fiche')).not.toBeNull();
    expect(currentLocation()).toBe('/prospects/candidate-1');

    await clickButton('Contrôle rapide');
    expect(currentLocation()).toBe('/prospects/candidate-1?tab=quick-check');
  });

  it('updates the URL when the audit picker changes, without remounting the page', async () => {
    await renderDetailWithProbe('/prospects/candidate-1?tab=audit');
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    // Two choices render as a segmented control (radix ToggleGroup, role
    // "radio" per item); the newest (audit-2) is already selected, so
    // picking the other one is the unselected radio.
    const options = [...document.querySelectorAll('[role="radio"]')];
    const other = options.find((option) => option.getAttribute('data-state') !== 'on');
    expect(other).toBeDefined();
    await act(async () => {
      (other as HTMLElement).click();
    });
    await pause();

    expect(currentLocation()).toContain('audit=audit-1');
    // Still the same mounted page, not a fresh load: the hub's own name
    // stays rendered rather than a skeleton/loading state briefly showing.
    expect(pageText()).toContain('Hôtel Exemple');
  });

  it('lets browser back/forward walk prior tab navigation', async () => {
    await renderDetailWithProbe();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    await clickButton('Contrôle rapide');
    expect(currentLocation()).toBe('/prospects/candidate-1?tab=quick-check');

    await clickButton('Audit');
    expect(currentLocation()).toBe('/prospects/candidate-1?tab=audit');

    await clickTestId('history-back');
    expect(currentLocation()).toBe('/prospects/candidate-1?tab=quick-check');
    expect(document.getElementById('hub-quick-check')).not.toBeNull();

    await clickTestId('history-forward');
    expect(currentLocation()).toBe('/prospects/candidate-1?tab=audit');
    expect(document.getElementById('hub-audit')).not.toBeNull();
  });
});

describe('ProspectDetailPage wave roster (plan 043)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/wave')) {
        return jsonResponse({
          added: true,
          wave: 'wave-1',
          candidateId: 'candidate-1',
          domain: 'hotel-exemple.fr',
        });
      }
      if (method === 'POST' && url.endsWith('/wave/remove')) {
        return jsonResponse({ revoked: true, wave: 'wave-1', candidateId: 'candidate-1' });
      }
      return jsonResponse(detailWithContact(null));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('offers the wave add on a not-selected refusal and posts the confirmed wave', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/wave')) {
        return jsonResponse({ added: true, wave: 'wave-1' });
      }
      return jsonResponse({
        ...detailWithContact(null),
        outreachScan: { canStart: false, refusal: 'not-selected' },
      });
    });
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    const add = buttonWithText('Ajouter à une vague');
    expect(add).toBeDefined();
    await clickButton('Ajouter à une vague');
    await clickButton('Ajouter', document.querySelector('[role="dialog"]') ?? undefined);
    await pause();
    const waveCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/wave') && (call[1] as RequestInit).method === 'POST',
    );
    expect(waveCall).toBeDefined();
    expect(JSON.parse(String((waveCall?.[1] as RequestInit).body))).toEqual({ wave: 'wave-1' });
  });

  it('offers no wave add for refusals a roster entry cannot cure', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        ...detailWithContact(null),
        outreachScan: { canStart: false, refusal: 'suppressed' },
      }),
    );
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();
    expect(buttonWithText('Ajouter à une vague')).toBeUndefined();
  });

  it('shows the roster line with its remove for a wave-roster source', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/wave/remove')) {
        return jsonResponse({ revoked: true, wave: 'wave-1' });
      }
      return jsonResponse({
        ...detailWithContact(null),
        outreachScan: { canStart: false },
        selectionVerdict: {
          inSelection: true,
          source: 'wave-roster',
          rank: null,
          cohort: null,
          wave: 'wave-1',
          decidedAt: '2026-09-12T00:00:00.000Z',
          actor: 'dashboard',
        },
      });
    });
    await renderDetail();
    await waitFor(() => (pageText().includes('Ajouté à la vague wave-1') ? true : undefined));
    await pause();

    await clickButton('Retirer de la vague');
    await clickButton('Retirer', document.querySelector('[role="dialog"]') ?? undefined);
    await pause();
    const removeCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith('/wave/remove') && (call[1] as RequestInit).method === 'POST',
    );
    expect(removeCall).toBeDefined();
    expect(JSON.parse(String((removeCall?.[1] as RequestInit).body))).toEqual({ wave: 'wave-1' });
  });
});

describe('ProspectDetailPage full-audit launch (plan 044)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/full-audit')) {
        return jsonResponse({ started: true, jobId: 'job-9' });
      }
      if (url.endsWith('/api/audits/audit-1')) {
        return jsonResponse({
          auditId: 'audit-1',
          lifecycle: 'scanned',
          severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
          findings: [],
          ruleCopy: {},
          reportLanguages: [],
          reports: [
            { language: 'fr', status: 'unverified', pdfAvailable: false },
            { language: 'en', status: 'unverified', pdfAvailable: false },
          ],
          approval: null,
          manualFields: null,
        });
      }
      return jsonResponse({
        ...detailWithContact(null),
        outreachScan: { canStart: false },
        outreachAudit: {
          auditId: 'audit-1',
          startedAt: '2026-09-01T10:00:00.000Z',
          severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('launches the paid full audit from the Audit tab directly, no confirmation', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    // The launch lives on the Audit tab. Plan 045 section 2.4: this is a
    // plain action now, no confirm dialog stands in front of it.
    await clickButton('Audit');
    await clickButton('Lancer un audit complet');
    await pause();
    const launchCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith('/full-audit') && (call[1] as RequestInit).method === 'POST',
    );
    expect(launchCall).toBeDefined();
  });
});

describe('ProspectDetailPage active jobs (issue #220)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        ...detailWithContact(null),
        activeJobs: [
          {
            jobId: 'job-quickcheck-1',
            kind: 'quick-check',
            status: 'running',
            startedAt: '2026-09-01T10:00:00.000Z',
            targetDomain: 'hotel-exemple.fr',
          },
          {
            jobId: 'job-fullaudit-1',
            kind: 'full-audit',
            status: 'queued',
            startedAt: '2026-09-01T10:00:00.000Z',
            targetDomain: 'hotel-exemple.fr',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // Regression: every simultaneously active job renders its own kind badge
  // and progress link, so a Quick check running alongside a Full audit
  // never hides one behind the other.
  it('lists every active job by kind, each with its own progress link', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(pageText()).toContain('Contrôle rapide');
    expect(pageText()).toContain('Audit complet');
    const links = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/scans/job-quickcheck-1');
    expect(links).toContain('/scans/job-fullaudit-1');
  });
});

describe('ProspectDetailPage qualification override (issue #237)', () => {
  const fetchMock = vi.fn();
  let overridden = false;

  beforeEach(() => {
    overridden = false;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && url.endsWith('/qualification-override')) {
        overridden = true;
        return jsonResponse({ candidateId: 'candidate-1', overridden: true, changed: true });
      }
      if (method === 'POST' && url.endsWith('/qualification-override/remove')) {
        overridden = false;
        return jsonResponse({ candidateId: 'candidate-1', overridden: false, changed: true });
      }
      return jsonResponse({
        ...detailWithContact(null),
        qualificationOutcome: 'rejected',
        qualificationOverride: overridden
          ? { actor: 'dashboard', reason: null, decidedAt: '2026-09-14T00:00:00.000Z' }
          : null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('marks a rejected candidate as qualified, then removes the override', async () => {
    await renderDetail();
    await waitFor(() => (pageText().includes('Hôtel Exemple') ? true : undefined));
    await pause();

    expect(pageText()).not.toContain(fr.hub.fiche.qualificationOverrideBadge);

    await clickButton(fr.hub.fiche.qualificationOverrideAction);
    const overrideCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith('/qualification-override') &&
        (call[1] as RequestInit).method === 'POST',
    );
    expect(overrideCall).toBeDefined();
    await waitFor(() =>
      pageText().includes(fr.hub.fiche.qualificationOverrideBadge) ? true : undefined,
    );

    await clickButton(fr.hub.fiche.qualificationOverrideRemoveAction);
    const removeCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith('/qualification-override/remove') &&
        (call[1] as RequestInit).method === 'POST',
    );
    expect(removeCall).toBeDefined();
    await waitFor(() =>
      pageText().includes(fr.hub.fiche.qualificationOverrideBadge) ? undefined : true,
    );
  });
});
