/**
 * Shared code-owned frame for every outreach draft.
 *
 * French is the approved source language. Touch 1 carries the complete Article
 * 14 disclosure block and URL-based opt-out/privacy links. Follow-ups keep the
 * lighter reply-based opt-out and introduce no new URL.
 */

import { OUTREACH_CONTACT, type ReportLanguage } from '@odysseus/core';

export type OutreachDraftDataOrigin =
  | 'public-hotel-catalogue'
  | 'public-website'
  | 'public-business-registry'
  | 'other-public-source'
  | 'provided-directly';

export interface OutreachDraftCopy {
  salutation: string;
  signOff: string;
  signature: string[];
  previewLinkLabel: string;
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
  signOff: 'Cordialement,',
  signature: [
    OUTREACH_CONTACT.name,
    `Fondateur — ${OUTREACH_CONTACT.organisation}`,
    'Audits techniques de sites web : SEO, GEO, performance, accessibilité et sécurité',
    `${WEBSITE} · ${OUTREACH_CONTACT.address}`,
  ],
  previewLinkLabel: "Consulter l'aperçu de votre site",
  linkSeparator: '\u00a0: ',
  purpose:
    'Pourquoi vous recevez ce message\u00a0: nous proposons aux hôtels des audits de leur site internet. ' +
    'Sans réponse de votre part, ce message pourra être suivi de deux relances au maximum.',
  originIntro: 'Sources utilisées\u00a0:',
  dataOrigin: {
    'public-hotel-catalogue': 'classement public des hébergements touristiques (Atout France)',
    'public-website': 'votre site internet',
    'public-business-registry': 'base Sirene (INSEE)',
    'other-public-source': 'un annuaire professionnel ou une plateforme de réservation en ligne',
    'provided-directly': 'les coordonnées que vous nous avez communiquées',
  },
  senderIdentity:
    `Responsable du traitement\u00a0: ${OUTREACH_CONTACT.name} — ` +
    `${OUTREACH_CONTACT.organisation} · ${OUTREACH_CONTACT.address}.`,
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
    `Founder — ${OUTREACH_CONTACT.organisation}`,
    'Technical website audits: SEO, GEO, performance, accessibility and security',
    `${WEBSITE} · ${OUTREACH_CONTACT.address}`,
  ],
  previewLinkLabel: 'View the preview of your website',
  linkSeparator: ': ',
  purpose:
    'Why you are receiving this message: we offer hotels website audits. If you do not reply, ' +
    'this message may be followed by at most two reminders.',
  originIntro: 'Sources used:',
  dataOrigin: {
    'public-hotel-catalogue': 'public tourist-accommodation classification (Atout France)',
    'public-website': 'your website',
    'public-business-registry': 'Sirene register (INSEE)',
    'other-public-source': 'a professional directory or an online booking platform',
    'provided-directly': 'the contact details you provided to us',
  },
  senderIdentity:
    `Data controller: ${OUTREACH_CONTACT.name} — ${OUTREACH_CONTACT.organisation} · ` +
    `${OUTREACH_CONTACT.address}.`,
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
