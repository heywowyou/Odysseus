/**
 * Milestone 9c plan 010, reworked by trade-off 83: assembling one send-ready
 * draft entirely from code-owned content. No model writes any part of it; the
 * body is the operator-approved wording in `outreach-email-template.ts`, filled
 * with the hotel's formatted name and its own proof-card categories, and the
 * frame (greeting, sign-off, signature, disclosures) is `outreach-draft-copy.ts`.
 * This module's job is to put them in the order `docs/rules/outreach-rules.md`
 * sections 6 and 7 require, and to refuse rather than send if a required input
 * is missing or a splice does not check out.
 *
 * **Why the facts block is rebuilt rather than trusted.** The real threat
 * is a *caller* that rebuilt or mutated `expectedFacts` between whenever it
 * was first produced (typically alongside this hotel's published preview) and
 * the moment it hands it to this function. So the check is rebuild-and-compare
 * against `buildOutreachFactsBlock`'s own current output, not a diff of two
 * strings the caller controls both sides of, and the bytes actually spliced
 * are always the freshly rebuilt object, never the one that was passed in.
 *
 * Like `publish-preview.ts`'s `publishPreview`, this never calls
 * `assessObligations` - a real scope determination computes a legal
 * conclusion this document may not state (trade-off 42) - and it returns a
 * typed discard rather than throwing, because the caller is a batch and one
 * bad draft must not abort the run.
 */

import {
  buildOutreachFactsBlock,
  type ObligationAssessment,
  type OutreachFactsBlock,
  type ReportLanguage,
} from '@odysseus/core';
import { assertOutreachDraftBody, assertOutreachDraftHtml } from './draft-body-lint.js';
import { findMissingDraftDisclosures } from './draft-disclosure-guard.js';
import { outreachDraftCopy } from './outreach-draft-copy.js';
import {
  composeOutreachSubject,
  composeTouchOneBody,
  composeTouchThreeFrame,
  composeTouchTwoBody,
  pickOutreachVariants,
  type OutreachCategory,
} from './outreach-email-template.js';
import {
  renderOutreachDraft,
  type DraftBodyBlock,
  type DraftFooterLine,
} from './render-outreach-draft.js';

export type OutreachDataOrigin =
  'public-hotel-catalogue' | 'public-website' | 'public-business-registry';

export type AssembleOutreachDraftRefusal =
  | 'missing-preview-url'
  | 'missing-categories'
  | 'missing-previous-subject'
  | 'missing-data-origins'
  | 'missing-privacy-url'
  | 'missing-opt-out-url'
  | 'missing-facts-inputs'
  | 'facts-block-mismatch'
  | 'facts-block-omitted'
  | 'facts-block-splice-failed'
  | 'missing-disclosure';

export interface AssembleOutreachDraftOptions {
  touch: 1 | 2 | 3;
  language: ReportLanguage;
  /** Already formatted for a letter (`formatHotelName`); absent or blank falls
   *  back to "votre établissement". */
  hotelName?: string;
  /** Picks the approved wording variants; the candidate id, so one hotel
   *  always receives the same combination. */
  variantSeed: string;
  /** Touch 1 only: the categories of the published preview's proof cards,
   *  the only problems the email may name. */
  categories?: readonly OutreachCategory[];
  /** Touch 1 only: the link to this hotel's already-published preview. */
  previewUrl?: string;
  /** Touch 2 and 3 only: the exact subject line touch 1 was sent with -
   *  composed here into `Re: <that>`, idempotently. */
  previousSubject?: string;
  /** Touch 1 only. Never a fixed list: a hotel with no Sirene match discloses
   *  fewer origins than one with a registry hit (docs/rules/outreach-rules.md
   *  section 7). */
  dataOrigins?: OutreachDataOrigin[];
  privacyUrl?: string;
  optOutUrl?: string;
  /** Touch 3 only: what `assessObligations`'s stored output resolved to for
   *  this hotel. Read only for the registry facts `buildOutreachFactsBlock`
   *  may quote, never for a verdict. */
  assessment?: ObligationAssessment;
  /** Touch 3 only: the facts block already produced elsewhere (typically
   *  alongside this hotel's preview) that this draft is expected to carry.
   *  Never spliced as-is - see the module comment. */
  expectedFacts?: OutreachFactsBlock;
}

export interface AssembledOutreachDraft {
  assembled: true;
  subject: string;
  /** The plain-text part, and the canonical content the drafts collection
   *  hashes. */
  body: string;
  /** The HTML part, rendered from the same blocks as `body`. */
  htmlBody: string;
}

export type AssembleOutreachDraftResult =
  AssembledOutreachDraft | { assembled: false; refusal: AssembleOutreachDraftRefusal };

function refuse(refusal: AssembleOutreachDraftRefusal): AssembleOutreachDraftResult {
  return { assembled: false, refusal };
}

/** `Re: <subject>`, never doubled - a touch 2 built on a touch 3's own subject
 *  (or re-run against an already-prefixed value) must not produce `Re: Re:`. */
function replySubject(previousSubject: string): string {
  return previousSubject.startsWith('Re: ') ? previousSubject : `Re: ${previousSubject}`;
}

export function assembleOutreachDraft(
  options: AssembleOutreachDraftOptions,
): AssembleOutreachDraftResult {
  const { touch, language } = options;
  const copy = outreachDraftCopy(language);
  const variants = pickOutreachVariants(options.variantSeed);

  if ((touch === 2 || touch === 3) && options.previousSubject === undefined) {
    return refuse('missing-previous-subject');
  }
  if (touch === 1 && options.previewUrl === undefined) return refuse('missing-preview-url');
  if (touch === 1 && (options.categories === undefined || options.categories.length === 0)) {
    return refuse('missing-categories');
  }
  if (touch === 1 && (options.dataOrigins === undefined || options.dataOrigins.length === 0)) {
    return refuse('missing-data-origins');
  }
  if (touch === 1 && options.privacyUrl === undefined) return refuse('missing-privacy-url');
  if (touch === 1 && options.optOutUrl === undefined) return refuse('missing-opt-out-url');
  if (touch === 3 && options.expectedFacts === undefined) return refuse('missing-facts-inputs');

  let factsText: string | undefined;
  let factsHeading: string | undefined;
  let factsParagraphs: string[] | undefined;

  if (touch === 3) {
    // Rebuilt from the same inputs a caller would have used originally, never
    // read off the passed object - see the module comment.
    const rebuilt = buildOutreachFactsBlock({
      assessment: options.assessment,
      language,
      capabilities: { argumentB: true },
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(options.expectedFacts)) {
      return refuse('facts-block-mismatch');
    }
    // Only reachable if the regime table lost an entry another module still
    // names (see buildOutreachFactsBlock's own comment) - a touch 3 draft with
    // no facts to carry has nothing left to send.
    if (rebuilt.state !== 'rendered') return refuse('facts-block-omitted');
    factsHeading = rebuilt.heading;
    factsParagraphs = [rebuilt.heading, ...rebuilt.paragraphs];
    // Blocks render joined by a blank line, so this is the exact run of text
    // the splice check below looks for.
    factsText = factsParagraphs.join('\n\n');
  }

  const subject =
    touch === 1
      ? composeOutreachSubject({
          language,
          hotelName: options.hotelName,
          categories: options.categories as readonly OutreachCategory[],
        })
      : replySubject(
          // Validated non-undefined above; narrowed here for TypeScript.
          options.previousSubject as string,
        );

  let bodyBlocks: DraftBodyBlock[];
  if (touch === 1) {
    bodyBlocks = composeTouchOneBody({
      language,
      hotelName: options.hotelName,
      categories: options.categories as readonly OutreachCategory[],
      variants,
      previewLink: { label: copy.previewLinkLabel, url: options.previewUrl as string },
    });
  } else if (touch === 2) {
    bodyBlocks = composeTouchTwoBody({ language, hotelName: options.hotelName, variants });
  } else {
    const frame = composeTouchThreeFrame({ language, hotelName: options.hotelName });
    bodyBlocks = [
      { kind: 'paragraph', text: frame.intro },
      ...(factsParagraphs as string[]).map((text): DraftBodyBlock => ({ kind: 'paragraph', text })),
      { kind: 'paragraph', text: frame.closing },
    ];
  }

  const footer: DraftFooterLine[] = [];
  if (touch === 1) {
    const origins = options.dataOrigins as OutreachDataOrigin[];
    footer.push(
      { kind: 'text', text: copy.purpose },
      {
        kind: 'text',
        text: `${copy.originIntro} ${origins.map((origin) => copy.dataOrigin[origin]).join(', ')}.`,
      },
      { kind: 'text', text: `${copy.senderIdentity} ${copy.replyInvite}` },
      { kind: 'link', link: { label: copy.optOutLabel, url: options.optOutUrl as string } },
      { kind: 'link', link: { label: copy.privacyLinkLabel, url: options.privacyUrl as string } },
    );
  } else {
    footer.push(
      { kind: 'text', text: copy.senderIdentity },
      { kind: 'text', text: copy.optOutByReply },
    );
    if (touch === 3) footer.push({ kind: 'text', text: copy.deletionOffer });
  }

  const rendered = renderOutreachDraft({ language, body: bodyBlocks, footer });
  const body = rendered.text;

  if (touch === 3) {
    // The rebuild-and-compare above confirms the *content* is fresh; this
    // confirms the *splice* put exactly one unaltered copy of it into the
    // body, rather than trusting the render never dropped or duplicated it.
    if (body.split(factsText as string).length !== 2) return refuse('facts-block-splice-failed');
  }

  const allowedUrls = [options.previewUrl, options.privacyUrl, options.optOutUrl].filter(
    (url): url is string => url !== undefined,
  );
  assertOutreachDraftBody(body, allowedUrls);
  assertOutreachDraftHtml(rendered.html, allowedUrls);

  const missing = findMissingDraftDisclosures({
    body,
    touch,
    copy,
    ...(options.privacyUrl !== undefined ? { privacyUrl: options.privacyUrl } : {}),
    ...(options.optOutUrl !== undefined ? { optOutUrl: options.optOutUrl } : {}),
    ...(factsHeading !== undefined ? { factsHeading } : {}),
  });
  if (missing.length > 0) return refuse('missing-disclosure');

  return { assembled: true, subject, body, htmlBody: rendered.html };
}
