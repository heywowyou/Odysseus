/**
 * One draft, two renderings: the plain-text part and the light HTML part of a
 * `multipart/alternative` message, both produced from the same ordered blocks
 * so they can never say different things.
 *
 * **Why HTML at all.** A message typed by hand in Gmail leaves as exactly this
 * pair: a short HTML part with a plain-text alternative. A bare `text/plain`
 * cold email is the less usual shape, and it shows every link as a raw URL.
 * The HTML here is deliberately what a person would produce by typing: `div`
 * paragraphs, real link text, a signature, and a small grey footer. No image,
 * no remote asset, no tracking pixel, no stylesheet, because each of those is
 * a spam signal in a cold message and the first two are blocked by most
 * clients anyway.
 *
 * Every string is escaped here and every anchor is written here, from blocks
 * whose URLs the assembler validated; `lintOutreachDraftHtml` then checks the
 * result rather than trusting this function (trade-off 82).
 */

import type { ReportLanguage } from '@odysseus/core';
import { outreachDraftCopy } from './outreach-draft-copy.js';

export interface DraftLink {
  label: string;
  url: string;
}

/** Body blocks, in reading order, above the sign-off. A link may carry a
 *  `lead` line printed directly above it in the same paragraph ("Vous
 *  trouverez un résumé de notre analyse ici :"). */
export type DraftBodyBlock =
  { kind: 'paragraph'; text: string } | { kind: 'link'; link: DraftLink; lead?: string };

/** Footer lines, below the signature: disclosures, then links. */
export type DraftFooterLine = { kind: 'text'; text: string } | { kind: 'link'; link: DraftLink };

export interface OutreachDraftDocument {
  language: ReportLanguage;
  body: DraftBodyBlock[];
  footer: DraftFooterLine[];
}

export interface RenderedOutreachDraft {
  text: string;
  html: string;
}

/** Deliberately neutral greys, not brand colours: the footer should read as
 *  the small print of a personal message, not as a template. */
const FOOTER_STYLE =
  'margin-top:24px;padding-top:12px;border-top:1px solid #dddddd;' +
  'color:#6b6b6b;font-size:12px;line-height:1.5';
const FOOTER_LINK_STYLE = 'color:#6b6b6b';

function escapeDraftHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function textLink(link: DraftLink, separator: string): string {
  return `${link.label}${separator}${link.url}`;
}

function htmlLink(link: DraftLink, style?: string): string {
  const styleAttribute = style === undefined ? '' : ` style="${style}"`;
  return `<a href="${escapeDraftHtml(link.url)}"${styleAttribute}>${escapeDraftHtml(link.label)}</a>`;
}

export function renderOutreachDraft(document: OutreachDraftDocument): RenderedOutreachDraft {
  const copy = outreachDraftCopy(document.language);

  // Under a lead line the plain-text part shows the bare URL: the lead already
  // says what it is, and "label : url" below "ici :" would say it twice.
  const textBody = document.body.map((block) => {
    if (block.kind === 'paragraph') return block.text;
    return block.lead === undefined
      ? textLink(block.link, copy.linkSeparator)
      : `${block.lead}\n${block.link.url}`;
  });
  const textFooter = document.footer.map((line) =>
    line.kind === 'text' ? line.text : textLink(line.link, copy.linkSeparator),
  );
  const text = [
    copy.salutation,
    ...textBody,
    copy.signOff,
    copy.signature.join('\n'),
    textFooter.join('\n'),
  ].join('\n\n');

  // Gmail's own composer separates paragraphs with an empty div rather than
  // margins, which is why this looks like a hand-typed message in every client.
  const spacer = '<div><br></div>';
  const htmlBody = document.body.map((block) => {
    if (block.kind === 'paragraph') return `<div>${escapeDraftHtml(block.text)}</div>`;
    const lead = block.lead === undefined ? '' : `${escapeDraftHtml(block.lead)}<br>`;
    return `<div>${lead}${htmlLink(block.link)}</div>`;
  });
  const htmlFooter = document.footer.map((line) =>
    line.kind === 'text'
      ? `<div>${escapeDraftHtml(line.text)}</div>`
      : `<div>${htmlLink(line.link, FOOTER_LINK_STYLE)}</div>`,
  );
  const html = [
    `<div dir="ltr" lang="${document.language}">`,
    [
      `<div>${escapeDraftHtml(copy.salutation)}</div>`,
      ...htmlBody,
      `<div>${escapeDraftHtml(copy.signOff)}</div>`,
      `<div>${copy.signature.map(escapeDraftHtml).join('<br>')}</div>`,
    ].join(spacer),
    `<div style="${FOOTER_STYLE}">${htmlFooter.join('')}</div>`,
    '</div>',
  ].join('');

  return { text, html };
}
