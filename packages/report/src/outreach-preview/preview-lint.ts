/**
 * The last check before a preview is allowed to exist.
 *
 * The input schema in `@odysseus/core` does the substantive work: strict
 * objects with closed vocabularies mean a finding ID, a selector or an exact
 * URL has nowhere to be put. This module runs the same content guard over the
 * *rendered document*, which is a different question - a template can compose
 * two safe strings into an unsafe sentence, and a future edit to the copy is
 * not covered by any input assertion.
 *
 * It throws rather than returning a flag. A publisher that received a bad
 * document and a warning would publish it; a bad public document is worse than
 * no document, and the caller is a person running a batch who can read a
 * message and fix the cause.
 */

import { containsProhibitedPreviewContent } from '@odysseus/core';

/** Structural properties no rendered preview may have, checked over the whole
 *  document rather than over one string at a time. */
const DOCUMENT_RULES: Array<[string, RegExp]> = [
  ['script-element', /<\s*script\b/iu],
  ['iframe', /<\s*iframe\b/iu],
  ['inline-event-handler', /\son[a-z]+\s*=/iu],
  ['insecure-url', /http:\/\//iu],
  ['remote-asset', /\b(?:src|href)\s*=\s*["']https?:\/\/(?!(?:www\.)?odysseusaudit\.)/iu],
  ['form', /<\s*form\b/iu],
  // Reference-stat providers. Trade-off 16 forbids the outreach path importing
  // the statistics table at all, so a provider name in the output means one got
  // in by another route.
  ['reference-stat-source', /\b(?:W3C|WebAIM|Forrester|Deloitte|Nielsen)\b/u],
];

/** Strips the parts of the document that are legitimately not prose, so the
 *  text guard is applied to what a reader reads.
 *
 *  Without this the CSS would fail the selector rule on its own stylesheet and
 *  the base64 image payloads would match almost anything - both true positives
 *  about the wrong text. The structural rules above still see the untouched
 *  document, which is where markup problems actually have to be caught. */
function readableText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/\sdata-[a-z-]+="[^"]*"/giu, ' ')
    .replace(/\ssrc="data:[^"]*"/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, ' ');
}

export class OutreachPreviewLintError extends Error {
  constructor(readonly rule: string) {
    super(
      `outreach preview rejected by rule "${rule}": the document would have been published ` +
        'with content the outreach rules forbid',
    );
    this.name = 'OutreachPreviewLintError';
  }
}

/** Returns the name of the first rule that fired, or null for a clean
 *  document. Exported separately from the throwing form so the tests can assert
 *  which rule caught what. */
export function lintOutreachPreviewHtml(html: string): string | null {
  for (const [name, pattern] of DOCUMENT_RULES) {
    if (pattern.test(html)) return name;
  }
  return containsProhibitedPreviewContent(readableText(html));
}

export function assertOutreachPreviewHtml(html: string): void {
  const rule = lintOutreachPreviewHtml(html);
  if (rule !== null) throw new OutreachPreviewLintError(rule);
}
