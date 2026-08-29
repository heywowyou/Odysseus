import { describe, expect, it } from 'vitest';
import { outreachDraftCopy } from './outreach-draft-copy.js';

// Copied by hand from packages/report/src/outreach-preview/strings.ts's
// `privacyController` (fr line 96-97, en line 158) rather than imported - the
// plan deliberately keeps this a parity test, not a cross-package import, so
// an unrelated preview-only refactor cannot silently change what a draft says
// about who is writing it.
const PREVIEW_CONTROLLER_LINE = {
  fr: 'Le responsable de traitement est Odysseus Audit, Jules Fontaine, contact@odysseusaudit.com.',
  en: 'The data controller is Odysseus Audit, Jules Fontaine, contact@odysseusaudit.com.',
};

describe('outreachDraftCopy - sender identity parity', () => {
  it('is byte-identical to the preview document controller line, fr', () => {
    expect(outreachDraftCopy('fr').senderIdentity).toBe(PREVIEW_CONTROLLER_LINE.fr);
  });

  it('is byte-identical to the preview document controller line, en', () => {
    expect(outreachDraftCopy('en').senderIdentity).toBe(PREVIEW_CONTROLLER_LINE.en);
  });
});

describe('outreachDraftCopy - both languages complete', () => {
  it.each(['fr', 'en'] as const)('%s has no empty string in any field', (language) => {
    const copy = outreachDraftCopy(language);
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === 'string') {
        expect(value, key).not.toBe('');
      } else {
        for (const [originKey, originValue] of Object.entries(value)) {
          expect(originValue, `${key}.${originKey}`).not.toBe('');
        }
      }
    }
  });
});
