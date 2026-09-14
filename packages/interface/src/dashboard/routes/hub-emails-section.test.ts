// @vitest-environment jsdom

import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/provider';
import { HubEmailsSection } from './hub-emails-section';
import type { ProspectDetailResponse, ProspectHubActionability } from './prospects-model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function thread(state = 'open', withDraft = false): NonNullable<ProspectDetailResponse['thread']> {
  return {
    threadId: 'thread-1',
    candidateId: 'candidate-1',
    domain: 'example.fr',
    language: 'fr',
    languageSource: 'default',
    currentTouch: 0,
    state,
    stateEnteredAt: '2026-09-01T00:00:00.000Z',
    stateReason: null,
    touches: [],
    lastSyncedAt: null,
    needsReview: null,
    currentOutcome: null,
    drafts: withDraft
      ? [
          {
            draftId: 'draft-1',
            touch: 1,
            language: 'fr',
            status: 'created',
            touch1EvidenceSlot: null,
            failureReason: null,
            hasProviderDraft: false,
            createdAt: '2026-09-01T00:00:00.000Z',
            deletedAt: null,
            reviewOutcome: null,
            reviewedAt: null,
          },
        ]
      : [],
  };
}

describe('HubEmailsSection action gating', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderSection(options: {
    thread?: ProspectDetailResponse['thread'];
    firstEmailAction?: ProspectHubActionability;
    firstEmailBlockedReason?: string | null;
    followUpAction?: ProspectHubActionability;
    onFirstEmail?: () => void;
    onFollowUp?: () => void;
  }): Promise<void> {
    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(HubEmailsSection, {
            thread: options.thread ?? null,
            isBusy: false,
            onFirstEmail: options.onFirstEmail ?? vi.fn(),
            onFollowUp: options.onFollowUp ?? vi.fn(),
            refresh: vi.fn(),
            firstEmailAction: options.firstEmailAction,
            firstEmailBlockedReason: options.firstEmailBlockedReason,
            followUpAction: options.followUpAction,
          }),
        ),
      );
    });
  }

  function button(label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find((value) =>
      value.textContent?.includes(label),
    );
  }

  it('lets server state block a first email that the local fallback would allow', async () => {
    const onFirstEmail = vi.fn();
    await renderSection({
      firstEmailAction: { state: 'blocked', reason: 'audit-required' },
      firstEmailBlockedReason: 'Un audit de prospection terminé est requis.',
      onFirstEmail,
    });

    expect(button('Générer le premier email')?.disabled).toBe(true);
    expect(container.textContent).toContain('Un audit de prospection terminé est requis.');
    button('Générer le premier email')?.click();
    expect(onFirstEmail).not.toHaveBeenCalled();
  });

  it('lets server state allow a first email despite a locally pending draft', async () => {
    await renderSection({
      thread: thread('open', true),
      firstEmailAction: { state: 'available' },
    });

    expect(button('Générer le premier email')?.disabled).toBe(false);
  });

  it('lets server state expose follow-up independently of local thread state', async () => {
    await renderSection({ followUpAction: { state: 'available' } });

    expect(button('Générer une relance')).toBeDefined();
  });

  it('shows the server refusal instead of a locally inferred reason', async () => {
    await renderSection({
      thread: thread('e1-sent', false),
      firstEmailAction: { state: 'blocked', reason: 'reply-needs-review' },
      firstEmailBlockedReason: 'Une réponse doit être relue avant de continuer.',
    });

    expect(container.textContent).toContain('Une réponse doit être relue avant de continuer.');
    expect(container.textContent).not.toContain('Le fil a déjà dépassé son premier contact.');
  });
});
