/**
 * Who a prospect is dealing with, stated once for every prospect-facing
 * document: the cold email and the v2 scorecard preview both interpolate this
 * rather than each spelling the address in its own sentence, so the two can
 * never name different people or different mailboxes.
 *
 * The address is the cold-outreach domain, not the one carrying invoices and
 * client correspondence (`docs/rules/outreach-rules.md` section 8): a spam
 * complaint attaches to the sending domain, and prospects should only ever be
 * told about the address they actually hear from. Paid clients keep the
 * report's own contact address.
 *
 * `packages/site` cannot import this (it imports no workspace package), so
 * the site's prospecting pages carry a hand-kept copy pinned by
 * `packages/site/lib/compliance-copy.test.ts`.
 */
export interface OutreachContact {
  name: string;
  organisation: string;
  address: string;
}

export const OUTREACH_CONTACT: Readonly<OutreachContact> = {
  name: 'Jules Fontaine',
  organisation: 'Odysseus',
  address: 'contact@odysseusaudit.fr',
};

/** How the sender appears in a mail client's From column. Parentheses rather
 *  than a dash: the charter bans em and en dashes in generated text. */
export const OUTREACH_SENDER_DISPLAY_NAME = `${OUTREACH_CONTACT.name} (${OUTREACH_CONTACT.organisation})`;
