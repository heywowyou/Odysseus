/**
 * Assemble one send-ready outreach draft entirely from code-owned content.
 * The operator-approved wording lives in `outreach-email-template.ts`; this
 * module adds the shared frame, disclosures and deterministic legal facts.
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
  type OutreachScanSummary,
} from './outreach-email-template.js';
import {
  renderOutreachDraft,
  type DraftBodyBlock,
  type DraftFooterLine,
} from './render-outreach-draft.js';

export type OutreachDataOrigin =
  | 'public-hotel-catalogue'
  | 'public-website'
  | 'public-business-registry'
  | 'other-public-source'
  | 'provided-directly';

export type AssembleOutreachDraftRefusal =
  | 'missing-preview-url'
  | 'reference-audit-unavailable'
  | 'missing-scan-summary'
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
  hotelName?: string;
  variantSeed: string;
  /** Safe aggregate facts from the already-published full-scan preview. */
  scanSummary?: OutreachScanSummary;
  previewUrl?: string;
  referenceAuditUrl?: string;
  referenceAuditVersion?: string;
  previousSubject?: string;
  dataOrigins?: OutreachDataOrigin[];
  privacyUrl?: string;
  optOutUrl?: string;
  assessment?: ObligationAssessment;
  expectedFacts?: OutreachFactsBlock;
}

export interface AssembledOutreachDraft {
  assembled: true;
  subject: string;
  body: string;
  htmlBody: string;
}

export type AssembleOutreachDraftResult =
  AssembledOutreachDraft | { assembled: false; refusal: AssembleOutreachDraftRefusal };

function refuse(refusal: AssembleOutreachDraftRefusal): AssembleOutreachDraftResult {
  return { assembled: false, refusal };
}

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
  if (touch === 1 && options.referenceAuditUrl === undefined) {
    return refuse('reference-audit-unavailable');
  }
  if (touch === 1 && options.scanSummary === undefined) return refuse('missing-scan-summary');
  if (touch === 1 && options.scanSummary?.proofCardCategories.length === 0) {
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
    const rebuilt = buildOutreachFactsBlock({
      assessment: options.assessment,
      language,
      capabilities: { argumentB: true },
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(options.expectedFacts)) {
      return refuse('facts-block-mismatch');
    }
    if (rebuilt.state !== 'rendered') return refuse('facts-block-omitted');
    factsHeading = rebuilt.heading;
    factsParagraphs = [rebuilt.heading, ...rebuilt.paragraphs];
    factsText = factsParagraphs.join('\n\n');
  }

  const subject =
    touch === 1
      ? composeOutreachSubject({
          language,
          hotelName: options.hotelName,
          categories: (options.scanSummary as OutreachScanSummary).proofCardCategories,
        })
      : replySubject(options.previousSubject as string);

  let bodyBlocks: DraftBodyBlock[];
  if (touch === 1) {
    bodyBlocks = composeTouchOneBody({
      language,
      hotelName: options.hotelName,
      scanSummary: options.scanSummary as OutreachScanSummary,
      variants,
      previewLink: { label: copy.previewLinkLabel, url: options.previewUrl as string },
      referenceLink: {
        // Shown in full rather than behind a label: a cold-email recipient
        // can read exactly where the link goes before clicking it.
        label: options.referenceAuditUrl as string,
        url: options.referenceAuditUrl as string,
      },
    });
  } else if (touch === 2) {
    bodyBlocks = composeTouchTwoBody({ language, hotelName: options.hotelName, variants });
  } else {
    const frame = composeTouchThreeFrame({ language, hotelName: options.hotelName });
    bodyBlocks = [
      ...frame.intro.map((text): DraftBodyBlock => ({ kind: 'paragraph', text })),
      ...(factsParagraphs as string[]).map((text): DraftBodyBlock => ({ kind: 'paragraph', text })),
      ...frame.closing.map((text): DraftBodyBlock => ({ kind: 'paragraph', text })),
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
      { kind: 'text', text: copy.senderIdentity },
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
    if (body.split(factsText as string).length !== 2) return refuse('facts-block-splice-failed');
  }

  const allowedUrls = [
    options.previewUrl,
    options.referenceAuditUrl,
    options.privacyUrl,
    options.optOutUrl,
  ].filter((url): url is string => url !== undefined);
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
