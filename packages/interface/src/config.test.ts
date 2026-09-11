import { OUTREACH_CONTACT } from '@odysseus/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMailboxSenderAddress } from './config.js';

describe('getMailboxSenderAddress', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the outreach contact address when the setting matches it', () => {
    vi.stubEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS', OUTREACH_CONTACT.address);
    expect(getMailboxSenderAddress()).toBe(OUTREACH_CONTACT.address);
  });

  it('accepts a difference in case or surrounding space only', () => {
    vi.stubEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS', ` ${OUTREACH_CONTACT.address.toUpperCase()} `);
    expect(getMailboxSenderAddress()).toBe(OUTREACH_CONTACT.address);
  });

  it('refuses any other address, naming the expected one and never the configured one', () => {
    vi.stubEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS', 'someone-else@example.test');
    expect(() => getMailboxSenderAddress()).toThrow(OUTREACH_CONTACT.address);
    expect(() => getMailboxSenderAddress()).not.toThrow('someone-else');
  });
});
