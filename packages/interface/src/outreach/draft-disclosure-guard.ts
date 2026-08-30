/**
 * The last check that every required disclosure actually made it into the
 * composed body, run over the finished string rather than trusted from the
 * composition steps that were supposed to add it.
 *
 * Same posture as `strings.ts`'s own comment on `privacyController` and
 * friends: "the render test asserts each one is present rather than trusting
 * the template." A future edit to `assemble-outreach-draft.ts` that drops a
 * line by accident should fail loudly here rather than ship a draft missing a
 * legally required disclosure.
 *
 * Presence is checked against exact substrings of the code-owned copy, never
 * a regex - a regex passes on a paraphrase, which is the failure this exists
 * to catch (`docs/rules/outreach-rules.md` section 7).
 */

import type { OutreachDraftCopy } from './outreach-draft-copy.js';

export type DraftDisclosure =
  | 'sender-identity'
  | 'origin'
  | 'purpose'
  | 'privacy-link'
  | 'opt-out'
  | 'deletion-offer'
  | 'facts-block';

export function findMissingDraftDisclosures(options: {
  body: string;
  touch: 1 | 2 | 3;
  copy: OutreachDraftCopy;
  /** Present only when touch 1 actually links to the privacy policy - the
   *  guard checks for the URL rather than the label alone, since the label
   *  text on its own is not a disclosure. */
  privacyUrl?: string;
  optOutUrl?: string;
  factsHeading?: string;
}): DraftDisclosure[] {
  const missing: DraftDisclosure[] = [];

  if (!options.body.includes(options.copy.senderIdentity)) missing.push('sender-identity');

  if (options.touch === 1) {
    if (!options.body.includes(options.copy.originIntro)) missing.push('origin');
    if (!options.body.includes(options.copy.purpose)) missing.push('purpose');
    if (options.privacyUrl === undefined || !options.body.includes(options.privacyUrl)) {
      missing.push('privacy-link');
    }
    if (options.optOutUrl === undefined || !options.body.includes(options.optOutUrl)) {
      missing.push('opt-out');
    }
  } else {
    if (!options.body.includes(options.copy.optOutByReply)) missing.push('opt-out');
  }

  if (options.touch === 3) {
    if (!options.body.includes(options.copy.deletionOffer)) missing.push('deletion-offer');
    if (options.factsHeading === undefined || !options.body.includes(options.factsHeading)) {
      missing.push('facts-block');
    }
  }

  return missing;
}
