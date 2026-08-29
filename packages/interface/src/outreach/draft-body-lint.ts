/**
 * The last check before an assembled draft is allowed to exist, mirroring
 * `packages/report/src/outreach-preview/preview-lint.ts` for the same reason:
 * the schemas and guards upstream do the substantive work, but a template can
 * still compose two safe strings into an unsafe sentence, and this runs over
 * the *assembled body*, not its ingredients.
 *
 * Two stages, in the same order as the preview's: raw-body structural rules
 * over the untouched string, then `containsProhibitedPreviewContent` over the
 * string with its own allowlisted URLs stripped first. The strip is load
 * bearing there and here for the same reason - a URL path can trip the
 * `css-selector` rule, and a rejection that looks like a safety win over our
 * own link is a bug, not a catch.
 *
 * Throws rather than returning a flag, like the preview's lint: the caller is
 * a batch run by a person who can read a message and fix the cause, and a bad
 * draft handed back with a warning attached is a bad draft that gets sent.
 */

import { containsProhibitedPreviewContent } from '@odysseus/core';

const RAW_BODY_RULES: Array<[string, RegExp]> = [
  ['markdown-emphasis', /(\*\*|__)[^*_]+\1/u],
  ['markdown-link', /\[[^\]]+\]\([^)]+\)/u],
  ['markup', /<\s*[a-z][^>]*>/iu],
  ['tracking-param', /[?&](?:utm_[a-z]+|ref|fbclid|gclid)=/iu],
  // Trade-off 16: the outreach path must never quote a reference-stat
  // provider. A name here means one got into the draft another way.
  ['reference-stat-source', /\b(?:W3C|WebAIM|Forrester|Deloitte|Nielsen)\b/u],
  ['insecure-url', /http:\/\//iu],
  ['off-domain-link', /https:\/\/(?!(?:www\.)?odysseusaudit\.)\S+/iu],
];

export class OutreachDraftLintError extends Error {
  constructor(readonly rule: string) {
    super(
      `outreach draft rejected by rule "${rule}": the draft would have been created with ` +
        'content the outreach rules forbid',
    );
    this.name = 'OutreachDraftLintError';
  }
}

/** Returns the name of the first rule that fired, or null for a clean body.
 *  `allowedUrls` are stripped before the text-content check runs, exactly as
 *  `preview-lint.ts`'s `readableText` strips markup before its own. */
export function lintOutreachDraftBody(body: string, allowedUrls: string[]): string | null {
  for (const [name, pattern] of RAW_BODY_RULES) {
    if (pattern.test(body)) return name;
  }

  let stripped = body;
  for (const url of allowedUrls) stripped = stripped.split(url).join(' ');

  return containsProhibitedPreviewContent(stripped);
}

export function assertOutreachDraftBody(body: string, allowedUrls: string[]): void {
  const rule = lintOutreachDraftBody(body, allowedUrls);
  if (rule !== null) throw new OutreachDraftLintError(rule);
}
