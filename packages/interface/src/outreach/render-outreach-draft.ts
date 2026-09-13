/** One draft, two matching renderings: plain text and light HTML. */

import type { ReportLanguage } from '@odysseus/core';
import { outreachDraftCopy } from './outreach-draft-copy.js';

export interface DraftLink {
  label: string;
  url: string;
}

export type DraftBodyBlock =
  { kind: 'paragraph'; text: string } | { kind: 'link'; link: DraftLink; lead?: string };

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

function renderTextFooter(lines: DraftFooterLine[], separator: string): string[] {
  const rendered: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    if (line?.kind === 'link' && next?.kind === 'link') {
      rendered.push(`${textLink(line.link, separator)} · ${textLink(next.link, separator)}`);
      index += 1;
    } else if (line?.kind === 'link') {
      rendered.push(textLink(line.link, separator));
    } else if (line !== undefined) {
      rendered.push(line.text);
    }
  }
  return rendered;
}

function renderHtmlFooter(lines: DraftFooterLine[]): string[] {
  const rendered: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    if (line?.kind === 'link' && next?.kind === 'link') {
      rendered.push(
        `<div>${htmlLink(line.link, FOOTER_LINK_STYLE)} · ${htmlLink(next.link, FOOTER_LINK_STYLE)}</div>`,
      );
      index += 1;
    } else if (line?.kind === 'link') {
      rendered.push(`<div>${htmlLink(line.link, FOOTER_LINK_STYLE)}</div>`);
    } else if (line !== undefined) {
      rendered.push(`<div>${escapeDraftHtml(line.text)}</div>`);
    }
  }
  return rendered;
}

export function renderOutreachDraft(document: OutreachDraftDocument): RenderedOutreachDraft {
  const copy = outreachDraftCopy(document.language);

  const textBody = document.body.map((block) => {
    if (block.kind === 'paragraph') return block.text;
    return block.lead === undefined
      ? textLink(block.link, copy.linkSeparator)
      : `${block.lead}\n${block.link.url}`;
  });
  const textFooter = renderTextFooter(document.footer, copy.linkSeparator);
  const text = [
    copy.salutation,
    ...textBody,
    copy.signOff,
    copy.signature.join('\n'),
    textFooter.join('\n'),
  ].join('\n\n');

  const spacer = '<div><br></div>';
  const htmlBody = document.body.map((block) => {
    if (block.kind === 'paragraph') return `<div>${escapeDraftHtml(block.text)}</div>`;
    const lead = block.lead === undefined ? '' : `${escapeDraftHtml(block.lead)}<br>`;
    return `<div>${lead}${htmlLink(block.link)}</div>`;
  });
  const htmlFooter = renderHtmlFooter(document.footer);
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
