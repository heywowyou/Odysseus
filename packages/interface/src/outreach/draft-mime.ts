/**
 * RFC 5322 message construction, milestone 9c plan 011; a
 * `multipart/alternative` pair (plain text, then light HTML) since trade-off
 * 82, because that is the shape a hand-typed Gmail message leaves in.
 *
 * One function, used by every adapter, so the message the in-memory double
 * validates is byte-for-byte the message the Gmail adapter uploads. If the
 * production adapter built its own, the contract tests would be checking a
 * message shape that never reaches a provider.
 *
 * **Why base64 rather than sending the text as-is.** Outreach copy is French
 * first, so a body routinely carries accented characters, which are multi-byte
 * in UTF-8 and therefore not legal in a plain 7-bit message. RFC 5322 also
 * caps a line at 998 octets, and nothing upstream constrains paragraph length
 * to that. Base64 with wrapped lines settles both at once and removes any
 * question of a mail transfer agent rewriting the body in transit, which for a
 * message whose exact wording has been through four guards is worth the small
 * loss of readability on the wire.
 *
 * The subject gets RFC 2047 encoded-word treatment for the same reason, but
 * only when it actually needs it: an unencoded ASCII subject is easier for the
 * operator to recognise in a mailbox listing, and most of the value of
 * encoding is in not corrupting the ones with accents.
 *
 * **Header injection is refused, not sanitized.** A carriage return or newline
 * inside an address or subject is how a single header becomes two, and the
 * second one could be anything. Every value that lands in a header position is
 * checked, and a bad one throws rather than being silently stripped: these
 * strings come from a role-address allowlist and a validated model output, so
 * a control character in one means something upstream is wrong in a way that
 * should stop the run rather than be quietly repaired.
 */

import { createHash } from 'node:crypto';

export interface BuildDraftMimeInput {
  to: string;
  from: string;
  /** Shown in the recipient's From column beside the address. */
  fromName: string;
  subject: string;
  /** The plain-text part. */
  body: string;
  /** The HTML part, rendered from the same blocks as `body`. */
  htmlBody: string;
}

const CRLF = '\r\n';

/** The blank line that separates headers from body. Named so the template at
 *  the end reads as "headers, separator, body" rather than as four escapes in
 *  a row. */
const HEADER_BODY_SEPARATOR = `${CRLF}${CRLF}`;

/** RFC 2045 caps an encoded line at 76 characters. */
const BASE64_LINE_LENGTH = 76;

function assertHeaderSafe(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Draft ${field} contains a line break and cannot be a header value`);
  }
  if (value.trim() === '') {
    throw new Error(`Draft ${field} is empty`);
  }
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

function wrap(encoded: string): string {
  const lines: string[] = [];
  for (let index = 0; index < encoded.length; index += BASE64_LINE_LENGTH) {
    lines.push(encoded.slice(index, index + BASE64_LINE_LENGTH));
  }
  return lines.join(CRLF);
}

/** RFC 2047 encoded word, base64 variant. Applied whole rather than per word:
 *  a subject is one short run of text, and splitting it to stay under the
 *  75-octet-per-word limit would buy nothing a mail client renders
 *  differently. */
function encodeSubject(subject: string): string {
  if (isAscii(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

/** A display name as an RFC 5322 phrase: quoted when plain ASCII (the
 *  parentheses in "Jules Fontaine (Odysseus)" would otherwise read as a
 *  comment), an encoded word when not. */
function encodeDisplayName(name: string): string {
  if (!isAscii(name)) return encodeSubject(name);
  return `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function base64Part(contentType: string, content: string): string {
  return [
    `Content-Type: ${contentType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(content, 'utf8').toString('base64')),
  ].join(CRLF);
}

/** Derived from the content so the same draft always produces the same bytes
 *  (the in-memory double and the Gmail adapter must agree), and so it cannot
 *  occur inside either base64 part: base64 has no underscore. */
function boundaryFor(input: BuildDraftMimeInput): string {
  const digest = createHash('sha256')
    .update(input.subject)
    .update('\0')
    .update(input.body)
    .update('\0')
    .update(input.htmlBody)
    .digest('hex')
    .slice(0, 24);
  return `odysseus_alt_${digest}`;
}

export function buildDraftMime(input: BuildDraftMimeInput): string {
  assertHeaderSafe(input.to, 'recipient');
  assertHeaderSafe(input.from, 'sender');
  assertHeaderSafe(input.fromName, 'sender name');
  assertHeaderSafe(input.subject, 'subject');
  if (input.body.trim() === '') throw new Error('Draft body is empty');
  if (input.htmlBody.trim() === '') throw new Error('Draft HTML body is empty');

  const boundary = boundaryFor(input);
  const headers = [
    `From: ${encodeDisplayName(input.fromName)} <${input.from}>`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  // Plain text first: RFC 2046 orders alternatives from least to most
  // faithful, and a client shows the last one it can render.
  const body = [
    `--${boundary}`,
    base64Part('text/plain', input.body),
    `--${boundary}`,
    base64Part('text/html', input.htmlBody),
    `--${boundary}--`,
  ].join(CRLF);

  return `${headers.join(CRLF)}${HEADER_BODY_SEPARATOR}${body}${CRLF}`;
}

/**
 * Gmail's `raw` field is base64url with padding retained. Kept next to the
 * builder because the two are only ever used together, and a caller that
 * base64url-encodes something other than a `buildDraftMime` result is doing
 * something this module should not make convenient.
 */
export function encodeDraftMimeForTransport(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64url');
}
