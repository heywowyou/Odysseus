/**
 * Renders a public-safe outreach preview to a single self-contained HTML
 * document.
 *
 * Synchronous, by contract: the stylesheet is a TypeScript string and every
 * image arrives already base64-encoded, so there is nothing to await and a
 * publisher can render inside a loop without threading promises through it.
 *
 * The order of operations is the point. The input is validated first, so a
 * malformed input never reaches a template. The document is then linted as a
 * whole, so a template that composed two safe strings into an unsafe sentence
 * is caught before anybody can host it. Either failure throws.
 *
 * Nothing about the paid report is reachable from here. There is no shared
 * input object to spread from, no Chromium launch, and no PDF: a preview is a
 * different kind of document, not a lighter tier of the report.
 */

import {
  formatFullAuditPrice,
  outreachPreviewInputSchema,
  type OutreachPreviewImage,
  type OutreachPreviewInput,
} from '@odysseus/core';
import { escapeHtml, fillTemplate, formatDate } from '../template/html-utils.js';
import { OUTREACH_PREVIEW_STYLES } from './styles.js';
import { outreachPreviewStrings, type OutreachPreviewStrings } from './strings.js';
import { assertOutreachPreviewHtml } from './preview-lint.js';

function renderObservations(input: OutreachPreviewInput, strings: OutreachPreviewStrings): string {
  const items = input.summaries
    .map((summary) => {
      const criteria =
        summary.wcagCriteria.length === 0
          ? ''
          : `<p class="meta">${escapeHtml(strings.wcagLabel)} ${escapeHtml(
              summary.wcagCriteria.join(', '),
            )}</p>`;
      return [
        '<li>',
        `<h3>${escapeHtml(summary.observation[input.language])}</h3>`,
        `<p class="meta">${escapeHtml(strings.severity[summary.severity])} &middot; ${escapeHtml(
          strings.pageRole[summary.pageRole],
        )}</p>`,
        criteria,
        '</li>',
      ].join('');
    })
    .join('');

  return [
    '<section>',
    `<h2>${escapeHtml(strings.observationsHeading)}</h2>`,
    `<p>${escapeHtml(strings.observationsIntro)}</p>`,
    `<ul class="observations">${items}</ul>`,
    '</section>',
  ].join('');
}

function renderImage(image: OutreachPreviewImage, language: 'fr' | 'en', caption: string): string {
  return [
    '<figure>',
    `<img src="data:image/png;base64,${image.base64}" width="${image.width}" `,
    `height="${image.height}" alt="${escapeHtml(image.altText[language])}">`,
    `<figcaption>${escapeHtml(caption)}</figcaption>`,
    '</figure>',
  ].join('');
}

/** Absent entirely when there is no image, rather than an empty section under a
 *  live heading. Trade-off 36 v2 makes the composite-absent shape the majority
 *  case on real hotels, so this is the common branch, not the edge one. */
function renderEvidence(input: OutreachPreviewInput, strings: OutreachPreviewStrings): string {
  if (input.images.length === 0) return '';
  const figures = input.images
    .map((image) => renderImage(image, input.language, strings.evidenceCaption[image.kind]))
    .join('');
  return [
    '<section>',
    `<h2>${escapeHtml(strings.evidenceHeading)}</h2>`,
    `<p>${escapeHtml(strings.evidenceIntro)}</p>`,
    figures,
    '</section>',
  ].join('');
}

/** Already checked by the schema's own guard, and escaped here anyway: the
 *  paragraphs are code-generated today, and an escaping policy that depends on
 *  who generated a string is one refactor away from being wrong. */
function renderFacts(input: OutreachPreviewInput): string {
  if (input.facts.state === 'omitted') return '';
  const paragraphs = input.facts.paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
  return `<section><h2>${escapeHtml(input.facts.heading)}</h2>${paragraphs}</section>`;
}

function renderOffer(input: OutreachPreviewInput, strings: OutreachPreviewStrings): string {
  return [
    '<section>',
    `<h2>${escapeHtml(strings.offerHeading)}</h2>`,
    `<p>${escapeHtml(
      fillTemplate(strings.offerBody, { price: formatFullAuditPrice(input.language) }),
    )}</p>`,
    `<p class="actions"><a href="${escapeHtml(input.links.offer)}">${escapeHtml(
      strings.offerLink,
    )}</a></p>`,
    '</section>',
  ].join('');
}

function renderPrivacy(input: OutreachPreviewInput, strings: OutreachPreviewStrings): string {
  const origins = input.dataOrigins
    .map((origin) => `<li>${escapeHtml(strings.dataOrigin[origin])}</li>`)
    .join('');
  return [
    '<section class="disclosure">',
    `<h2>${escapeHtml(strings.privacyHeading)}</h2>`,
    `<p>${escapeHtml(strings.privacyController)}</p>`,
    `<p>${escapeHtml(strings.privacyData)}</p>`,
    `<p>${escapeHtml(strings.privacyOriginsIntro)}</p>`,
    `<ul>${origins}</ul>`,
    `<p>${escapeHtml(strings.privacyPurpose)}</p>`,
    `<p>${escapeHtml(strings.privacyBasis)}</p>`,
    `<p>${escapeHtml(strings.privacyRights)}</p>`,
    `<p class="actions"><a href="${escapeHtml(input.links.privacy)}">${escapeHtml(
      strings.privacyLink,
    )}</a><a href="${escapeHtml(input.links.optOut)}">${escapeHtml(strings.optOutLink)}</a></p>`,
    '</section>',
  ].join('');
}

export function generateOutreachPreviewHtml(input: OutreachPreviewInput): string {
  const validated = outreachPreviewInputSchema.parse(input);
  const strings = outreachPreviewStrings(validated.language);

  const html = [
    '<!doctype html>',
    `<html lang="${validated.language}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // A preview is addressed to one recipient and is not a page we want indexed.
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(strings.documentTitle)}</title>`,
    `<style>${OUTREACH_PREVIEW_STYLES}</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${escapeHtml(validated.businessName)}</h1>`,
    `<p class="lede">${escapeHtml(strings.heading)}</p>`,
    `<p class="lede">${escapeHtml(strings.lede)}</p>`,
    `<p class="meta">${escapeHtml(
      fillTemplate(strings.observedOn, {
        date: formatDate(new Date(validated.observedAt), validated.language),
      }),
    )}</p>`,
    renderObservations(validated, strings),
    renderEvidence(validated, strings),
    renderFacts(validated),
    renderOffer(validated, strings),
    renderPrivacy(validated, strings),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');

  assertOutreachPreviewHtml(html);
  return html;
}
