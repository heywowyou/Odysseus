/**
 * Every code-owned sentence a draft can contain, in both languages, with no
 * English fallback. Same discipline as `report/src/outreach-preview/strings.ts`
 * (and the same reason: a cold email that silently renders an English line to
 * a French hotel is worse than one that fails to build).
 *
 * `senderIdentity` is not merely similar to that file's `privacyController` -
 * it must be byte-identical, because both documents describe the same legal
 * fact to the same reader across the same campaign, and a parity test
 * (`outreach-draft-copy.test.ts`) asserts the two never diverge. It is a
 * hand-kept duplicate, not an import: `interface` already depends on `report`
 * for other things, but reaching into `report/src/outreach-preview` for one
 * string would make an unrelated preview-only refactor a silent break here.
 *
 * `optOutLink` (a URL, first contact only) and `optOutByReply` (text only, every
 * later touch) are deliberately two different sentences, not one templated on
 * whether a link is present - `docs/outreach-rules.md` section 6 forbids a new
 * link on touch 2 or 3, and the objection mechanism on those touches has to
 * exist without introducing one.
 */

import type { ReportLanguage } from '@odysseus/core';

export interface OutreachDraftCopy {
  salutation: string;
  /** Byte-identical to `strings.ts`'s `privacyController` (fr line 96-97, en
   *  line 158). Checked by a parity test, not by importing across the seam. */
  senderIdentity: string;
  replyInvite: string;
  originIntro: string;
  dataOrigin: Record<
    'public-hotel-catalogue' | 'public-website' | 'public-business-registry',
    string
  >;
  purpose: string;
  privacyLinkLabel: string;
  optOutLabel: string;
  optOutByReply: string;
  deletionOffer: string;
}

const FR: OutreachDraftCopy = {
  salutation: 'Bonjour,',
  senderIdentity:
    'Le responsable de traitement est Odysseus Audit, Jules Fontaine, ' +
    'contact@odysseusaudit.com.',
  replyInvite: 'Vous pouvez répondre directement à ce message.',
  originIntro: 'Ces informations proviennent de :',
  dataOrigin: {
    'public-hotel-catalogue': 'le classement public des hébergements touristiques',
    'public-website': 'votre site web accessible publiquement',
    'public-business-registry': 'le registre public des entreprises',
  },
  purpose:
    "La finalité est de vous proposer une prestation d'audit, une fois, et de vous laisser " +
    'y mettre fin.',
  privacyLinkLabel: 'Notre politique de confidentialité complète',
  optOutLabel: 'Ne plus être contacté',
  optOutByReply: "Vous pouvez répondre à ce message pour ne plus recevoir d'e-mail de notre part.",
  deletionOffer:
    'Si vous préférez que nous supprimions cette donnée de registre, répondez à ce message ' +
    'et nous la supprimerons.',
};

const EN: OutreachDraftCopy = {
  salutation: 'Hello,',
  senderIdentity:
    'The data controller is Odysseus Audit, Jules Fontaine, contact@odysseusaudit.com.',
  replyInvite: 'You can reply directly to this message.',
  originIntro: 'This information came from:',
  dataOrigin: {
    'public-hotel-catalogue': 'the public tourist accommodation classification',
    'public-website': 'your publicly available website',
    'public-business-registry': 'the public business registry',
  },
  purpose: 'The purpose is to offer you an audit, once, and to let you stop it.',
  privacyLinkLabel: 'Our full privacy policy',
  optOutLabel: 'Stop hearing from us',
  optOutByReply: 'You can reply to this message to stop hearing from us.',
  deletionOffer:
    'If you would rather we deleted this registry data, reply to this message and we will ' +
    'delete it.',
};

export function outreachDraftCopy(language: ReportLanguage): OutreachDraftCopy {
  return language === 'fr' ? FR : EN;
}
