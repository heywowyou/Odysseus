import { OUTREACH_CONTACT } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { outreachDraftCopy } from './outreach-draft-copy.js';

const LANGUAGES = ['fr', 'en'] as const;

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

describe('outreachDraftCopy - locked French frame', () => {
  it('keeps the approved signature wording', () => {
    expect(outreachDraftCopy('fr').signature).toEqual([
      OUTREACH_CONTACT.name,
      `Fondateur, ${OUTREACH_CONTACT.organisation}`,
      'Audits techniques de sites web : SEO, GEO, performance, accessibilité et sécurité',
      `odysseusaudit.com · ${OUTREACH_CONTACT.address}`,
    ]);
  });

  it('states that the sequence can contain at most two reminders', () => {
    expect(outreachDraftCopy('fr').purpose).toContain('deux relances au maximum');
    expect(outreachDraftCopy('en').purpose).toContain('at most two reminders');
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
});
