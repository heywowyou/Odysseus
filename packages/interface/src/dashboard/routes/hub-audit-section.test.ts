// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { HubAuditSection } from './hub-audit-section';
import type { ProspectDetailResponse } from './prospects-model';

// Plan 042 slice 2: the hub's Audit tab renders the same findings the
// audit page renders, through the same components. These tests mirror the
// audit-detail-render.test.ts expectations (reviewed FR copy over raw
// detector titles, row expansion, the publisher-identification alert) and
// add the picker behaviour. Same createElement discipline as the other
// dashboard suites: the workspace vitest glob only collects .ts suites.

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

function detailWithAudits(
  audits: NonNullable<ProspectDetailResponse['outreachAudits']>,
): ProspectDetailResponse {
  return {
    candidateId: 'cand-1',
    businessId: null,
    resolutionVersion: 'v1',
    identityKey: 'key-1',
    identityStatus: 'resolved',
    matchedOn: null,
    siret: null,
    siren: null,
    name: 'Hôtel Exemple',
    commune: 'Grenoble',
    postcode: '38000',
    starRating: null,
    roomCount: null,
    capacity: null,
    campaignEligibility: 'eligible',
    groupStatus: 'independent',
    groupDomain: null,
    groupSize: null,
    ownRegistrableDomain: 'exemple.fr',
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
    qualificationFreshness: { state: 'missing' },
    prescanFreshness: { state: 'missing' },
    scoreFreshness: { state: 'missing' },
    prescan: null,
    score: null,
    evidence: null,
    preview: null,
    contact: null,
    thread: null,
    outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
    outreachScan: { canStart: false },
    outreachAudit: null,
    outreachAudits: audits,
  };
}

const element = {
  pageUrl: 'https://exemple.fr/contact',
  selector: '#formulaire > button:nth-child(3)',
  snippet: '<button class="valider"></button>',
};

function auditDetail(auditId: string): Record<string, unknown> {
  return {
    auditId,
    lifecycle: 'rendered',
    severityRollup: { critical: 0, serious: 2, moderate: 0, minor: 0 },
    findings: [
      {
        findingId: 'f001',
        auditId,
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'button-name',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['4.1.2'],
        title: 'Buttons must have discernible text',
        description: 'The button has no accessible name.',
        pageUrls: ['https://exemple.fr/', 'https://exemple.fr/contact'],
        occurrences: 6,
        elements: [element],
        rawEvidence: {},
        dedupeKey: 'dedupe-1',
        firstSeenAt: '2026-09-01T10:00:00.000Z',
        lastSeenAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    ruleCopy: {
      'button-name': {
        titleFr: 'Les boutons doivent avoir un texte explicite',
        glossFr: 'Un bouton sans texte lisible ne dit pas à quoi il sert.',
        remediationFr: 'Ajoutez un texte visible dans chaque bouton.',
        remediationEn: 'Add visible text inside every button.',
      },
    },
  };
}

describe('HubAuditSection findings and picker (plan 042 slice 2)', () => {
  const fetchMock = vi.fn();
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/audits/audit-1')) return jsonResponse(auditDetail('audit-1'));
      if (url.includes('/api/audits/audit-2')) {
        return jsonResponse({ ...auditDetail('audit-2'), lifecycle: 'analysed' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function renderSection(detail: ProspectDetailResponse): Promise<void> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // The chosen audit lives in the page; the harness replays that
    // ownership with one mutable variable and a rerender on pick.
    let auditId: string | null = null;
    const render = async (): Promise<void> => {
      await act(async () => {
        root.render(
          createElement(
            I18nProvider,
            null,
            createElement(
              MemoryRouter,
              null,
              createElement(HubAuditSection, {
                detail,
                auditId,
                onPickAudit: (picked: string) => {
                  auditId = picked;
                  void render();
                },
              }),
            ),
          ),
        );
      });
    };
    await render();
    await pause();
  }

  it('renders the same reviewed findings the audit page renders for the same audit', async () => {
    await renderSection(
      detailWithAudits([
        {
          auditId: 'audit-1',
          startedAt: '2026-09-10T00:00:00.000Z',
          jobType: 'outreach-full-scan',
        },
      ]),
    );
    await waitFor(() =>
      container.textContent?.includes('Les boutons doivent avoir un texte explicite')
        ? true
        : undefined,
    );
    // The reviewed FR copy replaces the raw detector title; the row keeps
    // its id and first selector, exactly like the audit page's table.
    expect(container.textContent).not.toContain('Buttons must have discernible text');
    expect(container.textContent).toContain('f001');
    expect(container.textContent).toContain('#formulaire > button:nth-child(3)');
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/audits/audit-1')).toBe(
      true,
    );
  });

  it('expands a finding row into its reviewed remediation', async () => {
    await renderSection(
      detailWithAudits([
        {
          auditId: 'audit-1',
          startedAt: '2026-09-10T00:00:00.000Z',
          jobType: 'outreach-full-scan',
        },
      ]),
    );
    const toggle = await waitFor(() =>
      [...container.querySelectorAll('button')].find((button) =>
        (button.getAttribute('aria-label') ?? '').includes('Afficher le détail du constat'),
      ),
    );
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await pause();
    expect(container.textContent).toContain('Ajoutez un texte visible dans chaque bouton.');
  });

  it('shows the publisher-identification alert and its reveal button', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/audits/audit-1')) {
        return jsonResponse({
          ...auditDetail('audit-1'),
          findings: [
            {
              findingId: 'lcen-1',
              auditId: 'audit-1',
              schemaVersion: 1,
              source: 'custom',
              ruleId: 'lcen-mentions-legales-missing',
              category: 'seo',
              severity: 'serious',
              wcagCriteria: [],
              title: 'No publisher identification found',
              description: 'No identifier found.',
              pageUrls: ['https://exemple.fr/'],
              occurrences: 1,
              elements: [],
              rawEvidence: {},
              dedupeKey: 'lcen-1',
              firstSeenAt: '2026-09-01T10:00:00.000Z',
              lastSeenAt: '2026-09-01T10:00:00.000Z',
            },
          ],
          ruleCopy: {
            'lcen-mentions-legales-missing': {
              titleFr: 'Aucun numéro SIREN, RCS ou de TVA trouvé sur le site',
              remediationFr: "Publiez les informations d'identification de l'entreprise.",
              remediationEn: "Publish the company's identification information.",
            },
          },
        });
      }
      return jsonResponse({});
    });
    await renderSection(
      detailWithAudits([
        {
          auditId: 'audit-1',
          startedAt: '2026-09-10T00:00:00.000Z',
          jobType: 'outreach-full-scan',
        },
      ]),
    );
    await waitFor(() =>
      container.textContent?.includes('Vérifier les informations d’identification du site')
        ? true
        : undefined,
    );
    const revealButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Voir le constat et la piste de correction',
    );
    expect(revealButton).toBeDefined();
    await act(async () => {
      revealButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await pause();
    expect(container.textContent).toContain(
      "Publiez les informations d'identification de l'entreprise.",
    );
    expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();
  });

  it('defaults the picker to the newest audit and switches on demand', async () => {
    await renderSection(
      detailWithAudits([
        {
          auditId: 'audit-1',
          startedAt: '2026-09-10T00:00:00.000Z',
          jobType: 'outreach-full-scan',
        },
        {
          auditId: 'audit-2',
          startedAt: '2026-09-01T00:00:00.000Z',
          jobType: 'outreach-full-scan',
        },
      ]),
    );
    await waitFor(() =>
      container.textContent?.includes('Les boutons doivent avoir un texte explicite')
        ? true
        : undefined,
    );
    // Newest first: audit-1 fetched, audit-2 not.
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/audits/audit-1')).toBe(
      true,
    );
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/audits/audit-2')).toBe(
      false,
    );

    // Radix ToggleGroup items expose role="radio"; the second one is the
    // older audit (the list is newest first).
    const older = await waitFor(
      () => container.querySelectorAll('[role="radio"]')[1] as HTMLElement | undefined,
    );
    await act(async () => {
      older?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await waitFor(() =>
      container.textContent?.includes('Étape du rapport client: Analysé') ? true : undefined,
    );
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/audits/audit-2')).toBe(
      true,
    );
  });
});
