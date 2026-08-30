/**
 * Milestone 9c plan 010: assembling one send-ready draft out of already
 * validated prose plus everything that must never come from a model.
 *
 * The prose (`options.prose`) has already been generated and passed every
 * guard in `generateOutreachProse` before it reaches here - this module
 * never calls the model and never repairs anything. Its own job is narrower
 * and entirely deterministic: splice the touch's fixed content around that
 * prose in the order `docs/rules/outreach-rules.md` sections 6 and 7 require, and
 * refuse rather than send if a required input is missing or a splice does not
 * check out.
 *
 * **Why the facts block is rebuilt rather than trusted.** The plan's stated
 * reason for a byte-identity check ("a model that altered the block once will
 * do it again") does not hold here - the model never sees the facts block, it
 * is not part of `OutreachProseInput`, so it cannot alter it. The real threat
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
import type { OutreachProseOutput } from '@odysseus/llm';
import { assertOutreachDraftBody } from './draft-body-lint.js';
import { findMissingDraftDisclosures } from './draft-disclosure-guard.js';
import { outreachDraftCopy } from './outreach-draft-copy.js';

export type OutreachDataOrigin =
  'public-hotel-catalogue' | 'public-website' | 'public-business-registry';

export type AssembleOutreachDraftRefusal =
  | 'missing-preview-url'
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
  prose: OutreachProseOutput;
  language: ReportLanguage;
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
  body: string;
}

export type AssembleOutreachDraftResult =
  AssembledOutreachDraft | { assembled: false; refusal: AssembleOutreachDraftRefusal };

function refuse(refusal: AssembleOutreachDraftRefusal): AssembleOutreachDraftResult {
  return { assembled: false, refusal };
}

function proseBodyText(prose: OutreachProseOutput): string {
  switch (prose.touch) {
    case 1:
      return [prose.opening, prose.evidenceSentence, prose.question].join(' ');
    case 2:
      return prose.sentences.join(' ');
    case 3:
      return prose.closing;
  }
}

/** `Re: <subject>`, never doubled - a touch 2 built on a touch 3's own subject
 *  (or re-run against an already-prefixed value) must not produce `Re: Re:`. */
function replySubject(previousSubject: string): string {
  return previousSubject.startsWith('Re: ') ? previousSubject : `Re: ${previousSubject}`;
}

export function assembleOutreachDraft(
  options: AssembleOutreachDraftOptions,
): AssembleOutreachDraftResult {
  const { prose, language } = options;
  const touch = prose.touch;
  const copy = outreachDraftCopy(language);

  if ((touch === 2 || touch === 3) && options.previousSubject === undefined) {
    return refuse('missing-previous-subject');
  }
  if (touch === 1 && options.previewUrl === undefined) return refuse('missing-preview-url');
  if (touch === 1 && (options.dataOrigins === undefined || options.dataOrigins.length === 0)) {
    return refuse('missing-data-origins');
  }
  if (touch === 1 && options.privacyUrl === undefined) return refuse('missing-privacy-url');
  if (touch === 1 && options.optOutUrl === undefined) return refuse('missing-opt-out-url');
  if (touch === 3 && options.expectedFacts === undefined) return refuse('missing-facts-inputs');

  let factsText: string | undefined;
  let factsHeading: string | undefined;

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
    factsText = [rebuilt.heading, ...rebuilt.paragraphs].join('\n\n');
  }

  const subject =
    touch === 1
      ? prose.subject
      : replySubject(
          // Validated non-undefined above; narrowed here for TypeScript.
          options.previousSubject as string,
        );

  const paragraphs: string[] = [copy.salutation, proseBodyText(prose)];

  if (touch === 1) paragraphs.push(options.previewUrl as string);
  if (touch === 3) paragraphs.push(factsText as string);

  paragraphs.push(copy.senderIdentity, copy.replyInvite);

  if (touch === 1) {
    const origins = options.dataOrigins as OutreachDataOrigin[];
    paragraphs.push(
      `${copy.originIntro} ${origins.map((origin) => copy.dataOrigin[origin]).join(', ')}.`,
      copy.purpose,
      `${copy.privacyLinkLabel} : ${options.privacyUrl as string}`,
    );
  }

  paragraphs.push(
    touch === 1 ? `${copy.optOutLabel} : ${options.optOutUrl as string}` : copy.optOutByReply,
  );

  if (touch === 3) paragraphs.push(copy.deletionOffer);

  const body = paragraphs.join('\n\n');

  if (touch === 3) {
    // The rebuild-and-compare above confirms the *content* is fresh; this
    // confirms the *splice* put exactly one unaltered copy of it into the
    // body, rather than trusting the join above never dropped or duplicated
    // it.
    if (body.split(factsText as string).length !== 2) return refuse('facts-block-splice-failed');
  }

  const allowedUrls = [options.previewUrl, options.privacyUrl, options.optOutUrl].filter(
    (url): url is string => url !== undefined,
  );
  assertOutreachDraftBody(body, allowedUrls);

  const missing = findMissingDraftDisclosures({
    body,
    touch,
    copy,
    ...(options.privacyUrl !== undefined ? { privacyUrl: options.privacyUrl } : {}),
    ...(options.optOutUrl !== undefined ? { optOutUrl: options.optOutUrl } : {}),
    ...(factsHeading !== undefined ? { factsHeading } : {}),
  });
  if (missing.length > 0) return refuse('missing-disclosure');

  return { assembled: true, subject, body };
}
