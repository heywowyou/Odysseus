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

/** Hosts an outreach draft body may link to, exact match, no subdomain
 *  wildcards: preview links are minted by the publisher, so any host not
 *  listed here is a bug or an injection. Edit deliberately; see
 *  `docs/product/first-100-rollout-runbook.md`, carry-forward 4 and gate I. */
const APPROVED_OUTREACH_LINK_HOSTS: readonly string[] = [
  'odysseusaudit.com',
  'www.odysseusaudit.com',
];

const RAW_BODY_RULES: Array<[string, RegExp]> = [
  ['markdown-emphasis', /(\*\*|__)[^*_]+\1/u],
  ['markdown-link', /\[[^\]]+\]\([^)]+\)/u],
  ['markup', /<\s*[a-z][^>]*>/iu],
  ['tracking-param', /[?&](?:utm_[a-z]+|ref|fbclid|gclid)=/iu],
  // Trade-off 16: the outreach path must never quote a reference-stat
  // provider. A name here means one got into the draft another way.
  ['reference-stat-source', /\b(?:W3C|WebAIM|Forrester|Deloitte|Nielsen)\b/u],
  ['insecure-url', /http:\/\//iu],
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

/** Off-domain link check over the raw body, replacing the old wildcard
 *  lookahead: every `https://` token must parse and name a host on
 *  `APPROVED_OUTREACH_LINK_HOSTS` exactly, so a subdomain of an approved host
 *  is foreign here. Unparsable tokens fail closed. A trailing dot is stripped
 *  before comparing, so the root-qualified spelling of an approved host
 *  compares equal to it. */
function hasOffDomainLink(body: string): boolean {
  for (const match of body.matchAll(/https:\/\/\S+/giu)) {
    let host: string;
    try {
      host = new URL(match[0]).hostname.toLowerCase();
    } catch {
      return true;
    }
    if (host.endsWith('.')) host = host.slice(0, -1);
    if (!APPROVED_OUTREACH_LINK_HOSTS.includes(host)) return true;
  }
  return false;
}

/** Returns the name of the first rule that fired, or null for a clean body.
 *  `allowedUrls` are stripped before the text-content check runs, exactly as
 *  `preview-lint.ts`'s `readableText` strips markup before its own. */
export function lintOutreachDraftBody(body: string, allowedUrls: string[]): string | null {
  for (const [name, pattern] of RAW_BODY_RULES) {
    if (pattern.test(body)) return name;
  }

  if (hasOffDomainLink(body)) return 'off-domain-link';

  let stripped = body;
  for (const url of allowedUrls) stripped = stripped.split(url).join(' ');

  return containsProhibitedPreviewContent(stripped);
}

export function assertOutreachDraftBody(body: string, allowedUrls: string[]): void {
  const rule = lintOutreachDraftBody(body, allowedUrls);
  if (rule !== null) throw new OutreachDraftLintError(rule);
}

/** Tags the HTML part may contain: what a hand-typed message is made of, and
 *  nothing that loads, runs, or restyles. */
const ALLOWED_HTML_TAGS = new Set(['div', 'br', 'a', 'span', 'hr']);

/** Attributes the HTML part may carry. `style` is allowed because the footer
 *  is grey, and is separately checked for anything that fetches. */
const ALLOWED_HTML_ATTRIBUTES = new Set(['dir', 'lang', 'href', 'style']);

/**
 * The HTML counterpart of `lintOutreachDraftBody`, run over the rendered HTML
 * part. The text part carries the substantive checks (the two parts come from
 * the same blocks); this one guards what only HTML can do wrong: load a
 * remote resource, run script, or link anywhere but the draft's own URLs.
 * Returns the first rule that fired, or null.
 */
export function lintOutreachDraftHtml(html: string, allowedUrls: string[]): string | null {
  for (const match of html.matchAll(/<\/?\s*([a-z0-9]+)([^>]*)>/giu)) {
    const tag = (match[1] ?? '').toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) return 'html-tag';
    const attributes = match[2] ?? '';
    // Only double-quoted attributes are ever rendered; anything else left
    // over (an unquoted or single-quoted value) is rejected rather than parsed.
    if (attributes.replaceAll(/\s*[a-z-]+\s*=\s*"[^"]*"/giu, '').trim() !== '') {
      return 'html-attribute';
    }
    for (const attribute of attributes.matchAll(/([a-z-]+)\s*=\s*"([^"]*)"/giu)) {
      const name = (attribute[1] ?? '').toLowerCase();
      const value = attribute[2] ?? '';
      if (!ALLOWED_HTML_ATTRIBUTES.has(name)) return 'html-attribute';
      if (name === 'style' && /url\s*\(|expression\s*\(|@import/iu.test(value)) {
        return 'html-remote-style';
      }
      if (name === 'href' && !allowedUrls.includes(value.replaceAll('&amp;', '&'))) {
        return 'html-href';
      }
    }
  }
  return null;
}

export function assertOutreachDraftHtml(html: string, allowedUrls: string[]): void {
  const rule = lintOutreachDraftHtml(html, allowedUrls);
  if (rule !== null) throw new OutreachDraftLintError(rule);
}
