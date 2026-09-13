/**
 * Every code-owned sentence a draft can contain, in both languages, with no
 * English fallback. Same discipline as `report/src/outreach-preview/strings-v2.ts`
 * (and the same reason: a cold email that silently renders an English line to
 * a French hotel is worse than one that fails to build).
 *
 * Written in French first, as a French professional would write it, and
 * translated to English from there, never the reverse: the first version of
 * this file read as English carried into French ("une prestation d'audit, une
 * fois"), which is exactly the impression a cold email cannot afford. The
 * voice is the firm's ("nous"), matching the model's prose.
 *
 * Who is writing comes from `OUTREACH_CONTACT`, the constant the v2 preview
 * also interpolates, so the email and the preview it links to can never name
 * different people or mailboxes.
 *
 * `optOutLabel` (a link, first contact only) and `optOutByReply` (text only,
 * every later touch) are deliberately two different sentences, not one
 * templated on whether a link is present - `docs/rules/outreach-rules.md` section 6
 * forbids a new link on touch 2 or 3, and the objection mechanism on those
 * touches has to exist without introducing one.
 *
 * French lines put U+00A0 before a colon, as French typography requires (an
 * ordinary space there lets a mail client wrap the colon onto its own line);
 * U+00A0 rather than U+202F for the glyph-coverage reason in trade-off 29.
 *
 * `purpose` states the whole sequence honestly: a first message and at most two
 * reminders, the ceiling `outreach-thread-state.ts` enforces (no fourth touch
 * exists). A purpose line promising a single contact would be contradicted by
 * the reminder the recipient receives four days later.
 */

import {
  OUTREACH_CONTACT,
  OUTREACH_SENDER_DISPLAY_NAME,
  type ReportLanguage,
} from '@odysseus/core';

export type OutreachDraftDataOrigin =
  | 'public-hotel-catalogue'
  | 'public-website'
  | 'public-business-registry'
  | 'other-public-source'
  | 'provided-directly';

export interface OutreachDraftCopy {
  salutation: string;
  signOff: string;
  /** Plain text lines, never links: touches 2 and 3 may carry no link, and a
   *  signature is identical on every touch. */
  signature: string[];
  /** The visible text of touch 1's one body link, to the published preview. */
  previewLinkLabel: string;
  /** Separator between a label and its URL in the plain-text rendering. */
  linkSeparator: string;
  purpose: string;
  originIntro: string;
  dataOrigin: Record<OutreachDraftDataOrigin, string>;
  /** Article 14 identity line; checked verbatim by the disclosure guard. */
  senderIdentity: string;
  replyInvite: string;
  optOutLabel: string;
  privacyLinkLabel: string;
  optOutByReply: string;
  deletionOffer: string;
}

const WEBSITE = 'odysseusaudit.com';

const FR: OutreachDraftCopy = {
  salutation: 'Bonjour,',
  signOff: 'Bien cordialement,',
  signature: [
    OUTREACH_CONTACT.name,
    `Fondateur, ${OUTREACH_CONTACT.organisation}`,
    'Audit de sites web',
    `${WEBSITE} · ${OUTREACH_CONTACT.address}`,
  ],
  previewLinkLabel: "Consulter l'aperçu de votre site",
  linkSeparator: '\u00a0: ',
  purpose:
    'Pourquoi ce message\u00a0: nous proposons aux hôtels un audit de leur site internet. ' +
    'Sans réponse de votre part, ce message sera suivi de deux relances au plus.',
  originIntro: 'Informations utilisées\u00a0:',
  dataOrigin: {
    'public-hotel-catalogue': 'le classement public des hébergements touristiques (Atout France)',
    'public-website': 'votre site internet',
    'public-business-registry': 'la base Sirene (INSEE)',
    'other-public-source': 'un annuaire professionnel ou une plateforme de réservation en ligne',
    'provided-directly': 'les coordonnées que vous nous avez communiquées',
  },
  senderIdentity: `Responsable du traitement\u00a0: ${OUTREACH_SENDER_DISPLAY_NAME}, ${OUTREACH_CONTACT.address}.`,
  replyInvite: 'Vous pouvez répondre directement à ce message.',
  optOutLabel: 'Ne plus être contacté',
  privacyLinkLabel: 'Prospection et données personnelles',
  optOutByReply: 'Pour ne plus recevoir de message de notre part, répondez simplement à celui-ci.',
  deletionOffer:
    'Si vous souhaitez que nous effacions ces données de registre, répondez simplement à ' +
    'ce message\u00a0: nous les supprimerons.',
};

const EN: OutreachDraftCopy = {
  salutation: 'Hello,',
  signOff: 'Kind regards,',
  signature: [
    OUTREACH_CONTACT.name,
    `Founder, ${OUTREACH_CONTACT.organisation}`,
    'Website audits',
    `${WEBSITE} · ${OUTREACH_CONTACT.address}`,
  ],
  previewLinkLabel: 'View the preview of your website',
  linkSeparator: ': ',
  purpose:
    'Why this message: we offer hotels an audit of their website. If you do not reply, ' +
    'it will be followed by two reminders at most.',
  originIntro: 'Information used:',
  dataOrigin: {
    'public-hotel-catalogue': 'the public classification of tourist accommodation (Atout France)',
    'public-website': 'your website',
    'public-business-registry': 'the Sirene register (INSEE)',
    'other-public-source': 'a professional directory or an online booking platform',
    'provided-directly': 'the contact details you provided to us',
  },
  senderIdentity: `Data controller: ${OUTREACH_SENDER_DISPLAY_NAME}, ${OUTREACH_CONTACT.address}.`,
  replyInvite: 'You can reply directly to this message.',
  optOutLabel: 'Stop being contacted',
  privacyLinkLabel: 'Prospecting and personal data',
  optOutByReply: 'To stop hearing from us, simply reply to this message.',
  deletionOffer:
    'If you would like us to erase this registry data, simply reply to this message and we ' +
    'will delete it.',
};

export function outreachDraftCopy(language: ReportLanguage): OutreachDraftCopy {
  return language === 'fr' ? FR : EN;
}
