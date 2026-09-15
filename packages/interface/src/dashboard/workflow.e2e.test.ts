// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { I18nProvider } from './i18n/provider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type WorkflowStage = 'added' | 'audit' | 'draft' | 'won';

interface WorkflowFixture {
  stage: WorkflowStage;
  directoryAdded: boolean;
  calls: { method: string; url: string }[];
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function createFixture(): WorkflowFixture {
  return { stage: 'added', directoryAdded: false, calls: [] };
}

function prospect(fixture: WorkflowFixture): Record<string, unknown> {
  const status = fixture.stage === 'won' ? 'won' : fixture.stage === 'audit' ? 'audited' : 'new';
  const hasAudit = fixture.stage !== 'added';
  const hasDraft = fixture.stage === 'draft' || fixture.stage === 'won';
  return {
    prospectId: 'prospect-1',
    sector: 'hotel',
    name: 'Hôtel Fixture',
    websites: [
      {
        url: 'https://fixture.example/',
        registrableDomain: 'fixture.example',
        kind: 'own',
        primary: true,
      },
    ],
    commune: 'Lyon',
    department: '69',
    status,
    hotel: { stars: 4, rooms: 50, groupStatus: 'independent' },
    emails: [{ address: 'contact@fixture.example', origin: 'operator' }],
    lastActivityAt: '2026-09-15T10:00:00.000Z',
    address: '1 rue Fixture',
    postcode: '69001',
    phone: '',
    notes: '',
    fieldOrigins: { name: 'operator', websites: 'operator' },
    audits: hasAudit
      ? [
          {
            auditId: 'audit-1',
            siteUrl: 'https://fixture.example/',
            kind: 'prospecting-audit',
            startedAt: '2026-09-15T10:00:00.000Z',
            finishedAt: '2026-09-15T10:01:00.000Z',
          },
        ]
      : [],
    previews: [],
    events: [],
    work: {
      items: [],
      ...(fixture.stage === 'added'
        ? {
            recommendation: {
              action: 'prepare-audit',
              href: '/prospects/prospect-1#actions',
              reason: 'no-audit',
            },
            auditState: 'missing',
          }
        : fixture.stage === 'audit'
          ? {
              recommendation: {
                action: 'create-first-email',
                href: '/prospects/prospect-1#actions',
              },
              auditState: 'qualifying',
              qualifyingAuditId: 'audit-1',
            }
          : fixture.stage === 'draft'
            ? {
                recommendation: {
                  action: 'review-draft',
                  href: '/prospects/prospect-1#emails',
                },
                auditState: 'qualifying',
                qualifyingAuditId: 'audit-1',
              }
            : { auditState: 'qualifying', qualifyingAuditId: 'audit-1' }),
      websiteSuppressed: false,
      emailSuppressed: false,
    },
    thread: hasDraft
      ? {
          threadId: 'thread-1',
          state: 'draft',
          currentTouch: 1,
          updatedAt: '2026-09-15T10:02:00.000Z',
        }
      : null,
    drafts: hasDraft
      ? [
          {
            draftId: 'draft-1',
            touch: 1,
            status: 'pending-review',
            subject: 'Une question pour votre établissement',
            createdAt: '2026-09-15T10:02:00.000Z',
          },
        ]
      : [],
  };
}

function listRow(fixture: WorkflowFixture): Record<string, unknown> {
  const current = prospect(fixture);
  return {
    prospectId: current.prospectId,
    sector: current.sector,
    name: current.name,
    websites: current.websites,
    commune: current.commune,
    department: current.department,
    status: current.status,
    hotel: current.hotel,
    emails: current.emails,
    lastActivityAt: current.lastActivityAt,
  };
}

function statusCounts(fixture: WorkflowFixture): Record<string, number> {
  return {
    contacted: 0,
    'follow-up': 0,
    replied: 0,
    call: 0,
    quoted: 0,
    won: fixture.stage === 'won' ? 1 : 0,
    lost: 0,
    'opted-out': 0,
  };
}

function installFixture(fixture: WorkflowFixture): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(url, 'http://dashboard.test').pathname;
      fixture.calls.push({ method, url });

      if (path === '/api/prospect-hub/todo') {
        const rows =
          fixture.stage === 'audit'
            ? [
                {
                  kind: 'first-email',
                  subject: 'Hôtel Fixture',
                  action: 'create-first-email',
                  href: '/prospects/prospect-1#actions',
                  since: '2026-09-15T10:01:00.000Z',
                },
              ]
            : fixture.stage === 'draft'
              ? [
                  {
                    kind: 'draft',
                    subject: 'Hôtel Fixture',
                    action: 'review-draft',
                    href: '/prospects/prospect-1#emails',
                    since: '2026-09-15T10:02:00.000Z',
                  },
                ]
              : [];
        return jsonResponse({ rows });
      }

      if (path === '/api/directory' && method === 'GET') {
        return jsonResponse({
          rows: [
            {
              directoryId: 'directory-1',
              sector: 'hotel',
              name: 'Hôtel Fixture',
              commune: 'Lyon',
              department: '69',
              postcode: '69001',
              websiteUrl: 'https://fixture.example/',
              registrableDomain: 'fixture.example',
              websiteKind: 'own',
              stars: 4,
              rooms: 50,
              groupStatus: 'independent',
              ...(fixture.directoryAdded ? { prospectId: 'prospect-1' } : {}),
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        });
      }

      if (path === '/api/directory/add' && method === 'POST') {
        fixture.directoryAdded = true;
        return jsonResponse({ added: 1 });
      }

      if (path === '/api/prospects' && method === 'GET') {
        return jsonResponse({
          rows: fixture.directoryAdded ? [listRow(fixture)] : [],
          total: fixture.directoryAdded ? 1 : 0,
          page: 1,
          pageSize: 50,
          statusCounts: statusCounts(fixture),
        });
      }

      if (path === '/api/prospects/prospect-1/actionability') {
        const ready = fixture.stage === 'audit';
        return jsonResponse({
          actions: {
            preview: { state: ready ? 'available' : 'blocked', reason: 'no-complete-audit' },
            'first-email': { state: ready ? 'available' : 'blocked', reason: 'no-complete-audit' },
            'follow-up': { state: 'blocked', reason: 'no-due-follow-up' },
          },
        });
      }

      if (path === '/api/prospects/prospect-1' && method === 'GET') {
        return jsonResponse(prospect(fixture));
      }

      if (path === '/api/scans' && method === 'POST') {
        fixture.stage = 'audit';
        return jsonResponse({ started: true, jobId: 'job-1' });
      }

      if (path === '/api/scans/job-1') {
        return jsonResponse({
          jobId: 'job-1',
          type: 'prospecting-audit',
          status: 'complete',
          phase: 'complete',
          siteUrl: 'https://fixture.example/',
          createdAt: '2026-09-15T10:00:00.000Z',
          progress: {},
          prospectId: 'prospect-1',
        });
      }

      if (path === '/api/prospects/prospect-1/outreach/first-email' && method === 'POST') {
        fixture.stage = 'draft';
        return jsonResponse({ created: true });
      }

      if (path === '/api/prospects/prospect-1/outcome' && method === 'POST') {
        fixture.stage = 'won';
        return jsonResponse({ recorded: true });
      }

      return jsonResponse({});
    }),
  );
}

async function pause(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
    await pause();
  });
}

function exactElement(container: HTMLElement, selector: string, text: string): Element {
  const element = [...container.querySelectorAll(selector)].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!element) throw new Error(`Could not find ${selector} with text ${text}`);
  return element;
}

async function renderApp(path: string): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)),
      ),
    );
    await pause();
  });
  return { container, root };
}

describe('dashboard prospect workflow', () => {
  let fixture: WorkflowFixture;

  beforeEach(() => {
    fixture = createFixture();
    window.localStorage.setItem('odysseus.dashboard.language', 'fr');
    installFixture(fixture);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('carries a directory entry through outreach work and a recorded result', async () => {
    const { container, root } = await renderApp('/annuaire');

    const checkbox = container.querySelector('input[type="checkbox"]');
    if (!checkbox) throw new Error('Directory row checkbox was not rendered');
    await click(checkbox);
    await click(exactElement(container, 'button', 'Ajouter aux prospects (1)'));
    await click(container.querySelector('a[href="/prospects"]')!);
    await click(container.querySelector('a[href^="/prospects/prospect-1?"]')!);
    expect(container.textContent).toContain('État de l’audit : absent');
    expect(container.textContent).not.toContain('{state}');
    await click(exactElement(container, 'button', 'Préparer la prospection'));

    expect(fixture.calls.some(({ method, url }) => method === 'POST' && url === '/api/scans')).toBe(
      true,
    );

    await click(container.querySelector('a[href="/a-traiter"]')!);
    expect(container.textContent).toContain('Odysseus ne peut pas envoyer de brouillons');
    expect(container.textContent).toContain('Hôtel Fixture');
    expect(container.querySelector('a[href="/prospects/prospect-1#actions"]')).not.toBeNull();

    await click(container.querySelector('a[href="/prospects/prospect-1#actions"]')!);
    await click(exactElement(container, 'button', 'Rédiger le premier email'));
    await click(exactElement(container, 'a', 'Relire le brouillon'));
    expect(container.textContent).toContain('Une question pour votre établissement');

    await click(exactElement(container, 'summary', 'Toutes les actions'));
    const outcome = container.querySelector('select[aria-label="Enregistrer un résultat"]');
    if (!outcome) throw new Error('Outcome control was not rendered');
    await act(async () => {
      (outcome as HTMLSelectElement).value = 'won';
      outcome.dispatchEvent(new Event('change', { bubbles: true }));
      await pause();
    });

    await click(container.querySelector('a[href="/prospects"]')!);
    await click(exactElement(container, 'button', 'Résultats'));
    expect(container.textContent).toContain('Gagné');
    expect(container.textContent).toContain('1');
    expect(
      fixture.calls.some(({ method, url }) => method === 'POST' && url.endsWith('/outcome')),
    ).toBe(true);
    expect(container.textContent).not.toContain('Rédiger le premier email');

    root.unmount();
  });
});
