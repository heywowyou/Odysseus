// @vitest-environment jsdom

/**
 * One test per panel of the prospect page (issue #532): each renders alone
 * from the shared fixture and calls its own mutation hook's action.
 */

import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/provider';
import { ActionsPanel } from './actions-panel';
import { ContactsEditor } from './contacts-editor';
import { HistoryPanel } from './history-panel';
import { OutreachPanel, threadStateDate } from './outreach-panel';
import { ProspectHeader } from './prospect-header';
import { RecentActivityPanel } from './recent-activity-panel';
import { RecommendedPanel } from './recommended-panel';
import { useProspectDetailShared, type ProspectDetailShared } from './shared';
import { SummaryPanel } from './summary-panel';
import { ACTIONABILITY, PROSPECT } from './test-fixture';
import type { AuditActions } from './use-audit-actions';
import type { ContactActions } from './use-contact-actions';
import type { IdentityEdit } from './use-identity-edit';
import type { LifecycleActions } from './use-lifecycle-actions';
import type { OutreachActions } from './use-outreach-actions';
import type { ScanLauncher } from './use-scan-launcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  window.localStorage.setItem('odysseus.dashboard.language', 'fr');
});

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '';
});

/** Renders `panel(shared)` with the real shared state over the fixture. */
async function renderPanel(
  panel: (shared: ProspectDetailShared) => ReactElement,
): Promise<HTMLElement> {
  function Harness(): ReactElement {
    const shared = useProspectDetailShared(
      PROSPECT,
      { refresh: () => undefined },
      { data: ACTIONABILITY, error: undefined, refresh: () => undefined },
    );
    return panel(shared);
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      createElement(I18nProvider, null, createElement(MemoryRouter, null, createElement(Harness))),
    );
  });
  return container;
}

async function click(element: Element | undefined): Promise<void> {
  if (!element) throw new Error('element not found');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function button(root: ParentNode, text: string): Element | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

function outreachActions(overrides: Partial<OutreachActions> = {}): OutreachActions {
  return {
    pendingOutcome: null,
    setPendingOutcome: vi.fn(),
    pendingTerminalStatus: null,
    setPendingTerminalStatus: vi.fn(),
    publishPreview: vi.fn(async () => undefined),
    confirmMailboxChecked: vi.fn(async () => undefined),
    runFirstEmail: vi.fn(async () => undefined),
    runFollowUp: vi.fn(async () => undefined),
    recordOutcome: vi.fn(async () => undefined),
    requestOutcome: vi.fn(),
    requestStatusChange: vi.fn(),
    discardDraft: vi.fn(async () => undefined),
    revokePreview: vi.fn(async () => undefined),
    copyPreviewLink: vi.fn(async () => undefined),
    changeOutreachLanguage: vi.fn(async () => undefined),
    changeStatus: vi.fn(async () => undefined),
    ...overrides,
  };
}

function lifecycleActions(): LifecycleActions {
  return {
    lifecycleBusy: false,
    deletionImpact: null,
    setDeletionImpact: vi.fn(),
    archiveImpact: null,
    setArchiveImpact: vi.fn(),
    lifecycleNotice: null,
    restore: vi.fn(async () => undefined),
    requestArchive: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined),
    requestPermanentDelete: vi.fn(async () => undefined),
    deletePermanently: vi.fn(async () => undefined),
  };
}

function scanLauncher(): ScanLauncher {
  return { launchScan: vi.fn(async () => undefined), renderScanNotice: () => null };
}

describe('prospect page panels (issue #532)', () => {
  it('header: names the prospect and asks before archiving', async () => {
    const lifecycle = lifecycleActions();
    const container = await renderPanel((shared) =>
      createElement(ProspectHeader, {
        shared,
        lifecycle,
        outreach: outreachActions(),
        returnTo: '/prospects',
      }),
    );
    expect(container.textContent).toContain('Hôtel Fixture');
    await click(button(container, 'Archiver le prospect'));
    expect(lifecycle.requestArchive).toHaveBeenCalled();
  });

  it('recommended: runs the recommended first email', async () => {
    const outreach = outreachActions();
    const container = await renderPanel((shared) =>
      createElement(RecommendedPanel, { shared, outreach, scan: scanLauncher() }),
    );
    await click(container.querySelector('#recommended button') ?? undefined);
    expect(outreach.runFirstEmail).toHaveBeenCalled();
  });

  it('summary: shows the identity and saves an edit', async () => {
    const identity: IdentityEdit = {
      editedFields: { notes: 'Rappeler en novembre' },
      setEditedFields: vi.fn(),
      fieldValue: (key) => String(PROSPECT[key] ?? ''),
      sirenError: null,
      identityNotes: [],
      saveDetails: vi.fn(async () => undefined),
    };
    const container = await renderPanel((shared) =>
      createElement(SummaryPanel, { shared, identity, contacts: contactActions() }),
    );
    expect(container.textContent).toContain('552100554');
    expect(container.textContent).toContain('Fixture SAS');
    await click(button(container, 'Enregistrer les informations'));
    expect(identity.saveDetails).toHaveBeenCalled();
  });

  it('summary: edits the sector through its label, keeping the stored code', async () => {
    const identity: IdentityEdit = {
      editedFields: {},
      setEditedFields: vi.fn(),
      fieldValue: (key) => String(PROSPECT[key] ?? ''),
      sirenError: null,
      identityNotes: [],
      saveDetails: vi.fn(async () => undefined),
    };
    const container = await renderPanel((shared) =>
      createElement(SummaryPanel, { shared, identity, contacts: contactActions() }),
    );
    const select = [...container.querySelectorAll('select')].find((candidate) =>
      [...candidate.options].some((option) => option.value === 'restaurant'),
    );
    if (!select) throw new Error('sector select not found');
    expect(select.value).toBe('hotel');
    expect(select.selectedOptions[0]?.textContent).toBe('Hôtel');
    expect(identity.setEditedFields).not.toHaveBeenCalled();
  });

  it('contacts: adds a website and accepts the suggested address', async () => {
    const contacts = contactActions({ website: 'https://new.fixture.example' });
    const container = await renderPanel((shared) =>
      createElement(ContactsEditor, { shared, contacts }),
    );
    expect(container.textContent).toContain('Jeanne Dupont');
    await click(button(container, 'Ajouter un site'));
    expect(contacts.saveWebsite).toHaveBeenCalled();
    await click(button(container, 'Utiliser cette adresse'));
    expect(contacts.saveEmail).toHaveBeenCalledWith(PROSPECT.contactSuggestion);
  });

  it('outreach: lists the draft and discards it', async () => {
    const outreach = outreachActions();
    const container = await renderPanel((shared) =>
      createElement(OutreachPanel, { shared, outreach }),
    );
    expect(container.textContent).toContain('Une question pour votre établissement');
    await click(button(container, 'Supprimer le brouillon'));
    expect(outreach.discardDraft).toHaveBeenCalledWith('draft-1');
  });

  it('outreach: dates a sent state by the send, not by the last mailbox sync', () => {
    const thread = {
      threadId: 'thread-1',
      state: 'e1-sent',
      currentTouch: 1,
      stateEnteredAt: '2026-09-28T08:00:00.000Z',
      touches: [{ touch: 1, sentAt: '2026-09-24T15:12:00.000Z' }],
      updatedAt: '2026-09-28T09:30:00.000Z',
    };
    expect(threadStateDate(thread)).toBe('2026-09-24T15:12:00.000Z');
    expect(threadStateDate({ ...thread, state: 'e2-drafted' })).toBe('2026-09-28T08:00:00.000Z');
  });

  it('actions: publishes the preview and launches a quick check', async () => {
    const outreach = outreachActions();
    const scan = scanLauncher();
    const container = await renderPanel((shared) =>
      createElement(ActionsPanel, { shared, outreach, scan, lifecycle: lifecycleActions() }),
    );
    await click(button(container, 'Publier l’aperçu'));
    expect(outreach.publishPreview).toHaveBeenCalled();
    await click(button(container, 'Lancer un contrôle rapide'));
    expect(scan.launchScan).toHaveBeenCalledWith('quick-check', 'actions');
  });

  it('recent activity: shows the latest events', async () => {
    const container = await renderPanel((shared) => createElement(RecentActivityPanel, { shared }));
    expect(container.querySelectorAll('#recent-activity li')).toHaveLength(2);
  });

  it('history: detaches an audit and revokes a live preview', async () => {
    const outreach = outreachActions();
    const auditActions: AuditActions = { detachAudit: vi.fn(async () => undefined) };
    const container = await renderPanel((shared) =>
      createElement(HistoryPanel, { shared, outreach, auditActions }),
    );
    await click(button(container, 'Détacher'));
    expect(auditActions.detachAudit).toHaveBeenCalledWith('audit-1');
    await click(button(container, 'Retirer l’aperçu'));
    expect(outreach.revokePreview).toHaveBeenCalledWith('preview-1');
  });
});

function contactActions(overrides: Partial<ContactActions> = {}): ContactActions {
  return {
    website: '',
    setWebsite: vi.fn(),
    email: '',
    setEmail: vi.fn(),
    pendingRemoval: null,
    setPendingRemoval: vi.fn(),
    newStakeholder: { name: '', position: '' },
    setNewStakeholder: vi.fn(),
    stakeholderEdit: null,
    setStakeholderEdit: vi.fn(),
    pendingStakeholderRemoval: null,
    setPendingStakeholderRemoval: vi.fn(),
    saveWebsite: vi.fn(async () => undefined),
    removeContact: vi.fn(async () => undefined),
    choosePrimary: vi.fn(async () => undefined),
    saveEmail: vi.fn(async () => undefined),
    saveStakeholders: vi.fn(async () => true),
    addStakeholder: vi.fn(async () => undefined),
    saveStakeholderEdit: vi.fn(async () => undefined),
    ...overrides,
  };
}
