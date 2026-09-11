import { OUTREACH_CONTACT } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { outreachDraftCopy } from './outreach-draft-copy.js';

const LANGUAGES = ['fr', 'en'] as const;

// The v2 preview interpolates the same OUTREACH_CONTACT; its own test
// (strings-v2-parity.test.ts) pins that side.
describe('outreachDraftCopy - one sender across the email and its preview', () => {
  it.each(LANGUAGES)('%s identity line names the outreach contact and address', (language) => {
    const identity = outreachDraftCopy(language).senderIdentity;
    expect(identity).toContain(OUTREACH_CONTACT.name);
    expect(identity).toContain(OUTREACH_CONTACT.address);
  });

  it.each(LANGUAGES)('%s signature carries the outreach address and no other', (language) => {
    const signature = outreachDraftCopy(language).signature.join('\n');
    expect(signature).toContain(OUTREACH_CONTACT.address);
    expect(signature).not.toMatch(/@odysseusaudit\.com/u);
  });
});

describe('outreachDraftCopy - written as the firm', () => {
  it('uses no first person singular in French', () => {
    const text = JSON.stringify(outreachDraftCopy('fr'));
    expect(text).not.toMatch(/(?:^|[^\p{L}])(?:je|j'|moi|mon|ma|mes)(?=[^\p{L}]|$)/iu);
  });

  it('tells the truth about the sequence: one message and at most two reminders', () => {
    expect(outreachDraftCopy('fr').purpose).toContain('deux relances au plus');
    expect(outreachDraftCopy('en').purpose).toContain('two reminders at most');
    expect(outreachDraftCopy('fr').purpose).not.toContain('une fois');
  });
});

describe('outreachDraftCopy - both languages complete', () => {
  it.each(LANGUAGES)('%s has no empty string in any field', (language) => {
    const copy = outreachDraftCopy(language);
    for (const [key, value] of Object.entries(copy)) {
      const values: string[] =
        typeof value === 'string'
          ? [value]
          : Array.isArray(value)
            ? value
            : Object.values(value as Record<string, string>);
      for (const entry of values) expect(entry, key).not.toBe('');
    }
  });

  it.each(LANGUAGES)('%s uses no em or en dash', (language) => {
    expect(JSON.stringify(outreachDraftCopy(language))).not.toMatch(/[–—]/u);
  });
});
