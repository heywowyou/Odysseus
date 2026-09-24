import { describe, expect, it } from 'vitest';
import { classifyMailboxThread, type MailboxClassifierMessage } from './classify-mailbox-thread.js';

const SENDER = 'contact@odysseusaudit.com';
const NOW = new Date('2026-08-30T09:00:00.000Z');

function draftMessage(overrides: Partial<MailboxClassifierMessage> = {}): MailboxClassifierMessage {
  return {
    providerMessageId: 'm1',
    at: NOW,
    fromAddress: SENDER,
    labelIds: ['DRAFT'],
    autoSubmitted: false,
    ...overrides,
  };
}

describe('classifyMailboxThread', () => {
  it('reports a confirmed send when the draft carries SENT and not DRAFT', () => {
    const result = classifyMailboxThread({
      messages: [draftMessage({ labelIds: ['SENT'] })],
      senderAddress: SENDER,
      outstandingDraft: { touch: 1, providerMessageId: 'm1' },
    });
    expect(result).toEqual({ kind: 'sent', touch: 1, providerMessageId: 'm1', sentAt: NOW });
  });

  it('does not report sent while the message still carries DRAFT', () => {
    const result = classifyMailboxThread({
      messages: [draftMessage({ labelIds: ['SENT', 'DRAFT'] })],
      senderAddress: SENDER,
      outstandingDraft: { touch: 1, providerMessageId: 'm1' },
    });
    expect(result).toEqual({ kind: 'unchanged' });
  });

  it('reports a reply from an external address after the last confirmed send', () => {
    const result = classifyMailboxThread({
      messages: [
        draftMessage({ providerMessageId: 'm1', labelIds: ['SENT'], at: NOW }),
        {
          providerMessageId: 'm2',
          at: new Date('2026-08-31T09:00:00.000Z'),
          fromAddress: 'direction@hotel-exemple.fr',
          labelIds: ['INBOX'],
          autoSubmitted: false,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result).toEqual({
      kind: 'reply',
      providerMessageId: 'm2',
      at: new Date('2026-08-31T09:00:00.000Z'),
    });
  });

  it('never reports a self-sent message as a reply', () => {
    const result = classifyMailboxThread({
      messages: [
        draftMessage({ providerMessageId: 'm1', labelIds: ['SENT'], at: NOW }),
        {
          providerMessageId: 'm2',
          at: new Date('2026-08-31T09:00:00.000Z'),
          fromAddress: SENDER,
          labelIds: ['SENT'],
          autoSubmitted: false,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result).toEqual({ kind: 'unchanged' });
  });

  it('reports a bounce from a mail-system local part, case-insensitively', () => {
    const result = classifyMailboxThread({
      messages: [
        {
          providerMessageId: 'm2',
          at: new Date('2026-08-31T09:00:00.000Z'),
          fromAddress: 'Mailer-Daemon@googlemail.com',
          labelIds: ['INBOX'],
          autoSubmitted: false,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result).toEqual({
      kind: 'bounce',
      providerMessageId: 'm2',
      at: new Date('2026-08-31T09:00:00.000Z'),
    });
  });

  it('reports an automated reply even from a mail-system-shaped address, never as a bounce', () => {
    const result = classifyMailboxThread({
      messages: [
        {
          providerMessageId: 'm2',
          at: new Date('2026-08-31T09:00:00.000Z'),
          fromAddress: 'postmaster@hotel-exemple.fr',
          labelIds: ['INBOX'],
          autoSubmitted: true,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result).toEqual({
      kind: 'automated',
      providerMessageId: 'm2',
      at: new Date('2026-08-31T09:00:00.000Z'),
    });
  });

  it('reports an automated vacation reply from an ordinary address as automated, not a reply', () => {
    const result = classifyMailboxThread({
      messages: [
        {
          providerMessageId: 'm2',
          at: new Date('2026-08-31T09:00:00.000Z'),
          fromAddress: 'direction@hotel-exemple.fr',
          labelIds: ['INBOX'],
          autoSubmitted: true,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result.kind).toBe('automated');
  });

  it('ignores inbound activity before the last confirmed send', () => {
    const result = classifyMailboxThread({
      messages: [
        {
          providerMessageId: 'stale',
          at: new Date('2026-08-01T09:00:00.000Z'),
          fromAddress: 'direction@hotel-exemple.fr',
          labelIds: ['INBOX'],
          autoSubmitted: false,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result).toEqual({ kind: 'unchanged' });
  });

  it('flags a vanished outstanding draft with no explaining activity for review', () => {
    const result = classifyMailboxThread({
      messages: [],
      senderAddress: SENDER,
      outstandingDraft: { touch: 1, providerMessageId: 'm1' },
    });
    expect(result).toEqual({
      kind: 'needs-review',
      reason: 'draft-disappeared-with-no-matching-send',
    });
  });

  it('reports a send when the interface replaced the draft with a new sent message', () => {
    const sentAt = new Date(NOW.getTime() + 60_000);
    const result = classifyMailboxThread({
      messages: [draftMessage({ providerMessageId: 'm2', labelIds: ['SENT'], at: sentAt })],
      senderAddress: SENDER,
      outstandingDraft: { touch: 1, providerMessageId: 'm1', draftedAt: NOW },
    });
    expect(result).toEqual({ kind: 'sent', touch: 1, providerMessageId: 'm2', sentAt });
  });

  it('does not take a sent message from before the draft, or from someone else, as its send', () => {
    const before = new Date(NOW.getTime() - 60_000);
    const after = new Date(NOW.getTime() + 60_000);
    for (const message of [
      draftMessage({ providerMessageId: 'old', labelIds: ['SENT'], at: before }),
      draftMessage({
        providerMessageId: 'theirs',
        labelIds: ['SENT'],
        at: after,
        fromAddress: 'someone@else.example',
      }),
    ]) {
      const result = classifyMailboxThread({
        messages: [message],
        senderAddress: SENDER,
        outstandingDraft: { touch: 1, providerMessageId: 'm1', draftedAt: NOW },
      });
      expect(result.kind).not.toBe('sent');
    }
  });

  it('reports unchanged when the outstanding draft is still present and nothing else happened', () => {
    const result = classifyMailboxThread({
      messages: [draftMessage()],
      senderAddress: SENDER,
      outstandingDraft: { touch: 1, providerMessageId: 'm1' },
    });
    expect(result).toEqual({ kind: 'unchanged' });
  });

  it('reports unchanged with no outstanding draft and no inbound activity', () => {
    expect(classifyMailboxThread({ messages: [], senderAddress: SENDER })).toEqual({
      kind: 'unchanged',
    });
  });

  it('prefers the earliest qualifying inbound message when several arrived', () => {
    const result = classifyMailboxThread({
      messages: [
        {
          providerMessageId: 'later',
          at: new Date('2026-09-01T09:00:00.000Z'),
          fromAddress: 'direction@hotel-exemple.fr',
          labelIds: ['INBOX'],
          autoSubmitted: false,
        },
        {
          providerMessageId: 'earlier',
          at: new Date('2026-08-31T09:00:00.000Z'),
          fromAddress: 'direction@hotel-exemple.fr',
          labelIds: ['INBOX'],
          autoSubmitted: false,
        },
      ],
      senderAddress: SENDER,
      lastConfirmedSentAt: NOW,
    });
    expect(result).toMatchObject({ kind: 'reply', providerMessageId: 'earlier' });
  });
});
