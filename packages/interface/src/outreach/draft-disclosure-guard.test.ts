import { describe, expect, it } from 'vitest';
import { findMissingDraftDisclosures } from './draft-disclosure-guard.js';
import { outreachDraftCopy } from './outreach-draft-copy.js';

const copy = outreachDraftCopy('fr');
const privacyUrl = 'https://www.odysseusaudit.com/confidentialite-prospection';
const optOutUrl = 'https://www.odysseusaudit.com/desinscription';

function touch1Body(): string {
  return [
    copy.salutation,
    'Un texte quelconque.',
    'https://www.odysseusaudit.com/apercu/abc',
    copy.senderIdentity,
    copy.replyInvite,
    `${copy.originIntro} le classement public.`,
    copy.purpose,
    `${copy.privacyLinkLabel} : ${privacyUrl}`,
    `${copy.optOutLabel} : ${optOutUrl}`,
  ].join('\n\n');
}

describe('findMissingDraftDisclosures - touch 1', () => {
  it('finds nothing missing in a complete body', () => {
    const missing = findMissingDraftDisclosures({
      body: touch1Body(),
      touch: 1,
      copy,
      privacyUrl,
      optOutUrl,
    });
    expect(missing).toEqual([]);
  });

  it('flags a missing sender identity', () => {
    const body = touch1Body().replace(copy.senderIdentity, '');
    const missing = findMissingDraftDisclosures({ body, touch: 1, copy, privacyUrl, optOutUrl });
    expect(missing).toContain('sender-identity');
  });

  it('flags a missing origin disclosure', () => {
    const body = touch1Body().replace(copy.originIntro, '');
    const missing = findMissingDraftDisclosures({ body, touch: 1, copy, privacyUrl, optOutUrl });
    expect(missing).toContain('origin');
  });

  it('flags a missing purpose disclosure', () => {
    const body = touch1Body().replace(copy.purpose, '');
    const missing = findMissingDraftDisclosures({ body, touch: 1, copy, privacyUrl, optOutUrl });
    expect(missing).toContain('purpose');
  });

  it('flags a missing privacy link', () => {
    const missing = findMissingDraftDisclosures({ body: touch1Body(), touch: 1, copy, optOutUrl });
    expect(missing).toContain('privacy-link');
  });

  it('flags a missing opt-out link', () => {
    const missing = findMissingDraftDisclosures({ body: touch1Body(), touch: 1, copy, privacyUrl });
    expect(missing).toContain('opt-out');
  });

  it('does not accept the label alone as satisfying the privacy-link disclosure', () => {
    const body = touch1Body().replace(privacyUrl, '');
    const missing = findMissingDraftDisclosures({ body, touch: 1, copy, privacyUrl, optOutUrl });
    expect(missing).toContain('privacy-link');
  });
});

describe('findMissingDraftDisclosures - touch 2', () => {
  it('requires sender identity and the reply-based opt-out, nothing else', () => {
    const body = [
      copy.salutation,
      'Un texte.',
      copy.senderIdentity,
      copy.replyInvite,
      copy.optOutByReply,
    ].join('\n\n');
    expect(findMissingDraftDisclosures({ body, touch: 2, copy })).toEqual([]);
  });

  it('flags a missing reply-based opt-out', () => {
    const body = [copy.salutation, 'Un texte.', copy.senderIdentity].join('\n\n');
    expect(findMissingDraftDisclosures({ body, touch: 2, copy })).toContain('opt-out');
  });
});

describe('findMissingDraftDisclosures - touch 3', () => {
  const factsHeading = 'Le cadre applicable, et ce que nous pouvons en dire';

  function touch3Body(): string {
    return [
      copy.salutation,
      'Un dernier mot.',
      factsHeading,
      'paragraphe.',
      copy.senderIdentity,
      copy.replyInvite,
      copy.optOutByReply,
      copy.deletionOffer,
    ].join('\n\n');
  }

  it('finds nothing missing in a complete body', () => {
    expect(
      findMissingDraftDisclosures({ body: touch3Body(), touch: 3, copy, factsHeading }),
    ).toEqual([]);
  });

  it('flags a missing deletion offer', () => {
    const body = touch3Body().replace(copy.deletionOffer, '');
    expect(findMissingDraftDisclosures({ body, touch: 3, copy, factsHeading })).toContain(
      'deletion-offer',
    );
  });

  it('flags a missing facts block heading', () => {
    const missing = findMissingDraftDisclosures({ body: touch3Body(), touch: 3, copy });
    expect(missing).toContain('facts-block');
  });
});
