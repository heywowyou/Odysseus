import { OUTREACH_CONTACT } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { outreachPreviewStringsV3 } from './strings-v3.js';

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix === '' ? key : `${prefix}.${key}`));
  }
  return out;
}

const FR = flatten(outreachPreviewStringsV3('fr'));
const EN = flatten(outreachPreviewStringsV3('en'));

describe('the v3 preview strings', () => {
  it('define the same non-empty keys in both languages', () => {
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort());
    for (const [key, value] of Object.entries({ ...FR, ...EN })) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('carry no em/en dash or narrow no-break space', () => {
    for (const [key, value] of Object.entries({ ...FR, ...EN })) {
      expect(value, key).not.toMatch(/[\u2013\u2014]/u);
      expect(value, key).not.toContain('\u202f');
    }
  });

  it('keeps the same sender identity as outreach mail', () => {
    for (const language of ['fr', 'en'] as const) {
      const strings = outreachPreviewStringsV3(language);
      expect(strings.privacyController).toContain(OUTREACH_CONTACT.name);
      expect(strings.privacyController).toContain(OUTREACH_CONTACT.address);
      expect(strings.privacyRights).toContain(OUTREACH_CONTACT.address);
    }
  });
});
