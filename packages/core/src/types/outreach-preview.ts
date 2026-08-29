/**
 * The input contract for a public-safe outreach preview, and the guard that
 * decides whether a string may appear in one.
 *
 * **Why this is a contract and not a projection of the report input.** The paid
 * report input carries finding IDs, CSS selectors, exact affected URLs, raw
 * evidence, model prose and reference statistics. A preview that started from
 * that object and removed things would be one careless spread away from
 * publishing all of it. This type starts from nothing and admits only what the
 * outreach rules permit, so the unsafe fields have nowhere to go: every object
 * here is `.strict()`, and that alone is what rejects an ID, a selector or a
 * URL, before any pattern matching is involved.
 *
 * **Why it lives in `core` and not in `report`.** `packages/report` has no
 * `zod` dependency, and adding one is a package-seam change. It is also not the
 * only consumer: plan 010's prose validator lives in `llm`, which depends on
 * `core` and nothing else in the workspace, so a contract held in `report`
 * would be unreachable there. Rendering stays in `report`; the decision about
 * what may be said lives here, beside its sibling `hotel-prescan-evidence.ts`.
 *
 * **PNG only, deliberately narrower than the plan text.** Plan 008 permitted
 * `data:image/webp`. The shipped evidence contract is PNG end to end - the
 * `ref` regex, the recorded `mimeType`, and the promotion step all say PNG -
 * so nothing in this repository can produce a webp. Accepting one would add a
 * code path with no producer and widen a contract trade-off 36 says not to
 * widen. Do not "fix" this back to a union.
 *
 * **The offer price is not a field.** It is
 * `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT`, injected by the renderer. Because these
 * objects are strict, a caller that tries to pass a price is rejected rather
 * than quietly quoting a different one, which is what "sourced from one
 * code-owned constant" actually has to mean to be worth stating.
 */

import { z } from 'zod';
import { REGIME_TABLE, getRegime } from '../compliance/regimes.js';
import { formatFullAuditPrice } from '../offer/pricing.js';
import {
  HOTEL_EVIDENCE_MAX_ASSET_BYTES,
  HOTEL_EVIDENCE_MAX_SUMMARIES,
  HOTEL_EVIDENCE_MAX_TOTAL_BYTES,
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  fixedObservationSchema,
} from './hotel-prescan-evidence.js';

/** Wide enough for a full-page capture on a large viewport, and no wider. A
 *  dimension far above this is not a screenshot of a web page. */
const MAX_IMAGE_DIMENSION_PX = 8000;
const MAX_URL_LENGTH = 300;
const MAX_BUSINESS_NAME_LENGTH = 120;

/** The only hosts a preview may link to. Everything else in the document is a
 *  `data:` URI, so this list is the whole of the document's contact with the
 *  network, and keeping it short is what makes "no third-party asset, no
 *  tracker" an enforced property rather than an intention. */
const ALLOWED_LINK_HOSTNAMES = new Set([
  'odysseusaudit.com',
  'www.odysseusaudit.com',
  'odysseusaudit.fr',
  'www.odysseusaudit.fr',
]);

export type OutreachPreviewLanguage = 'fr' | 'en';

export interface PublicFindingSummary {
  observation: { fr: string; en: string };
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagCriteria: string[];
  pageRole: 'homepage' | 'booking' | 'content';
}

export interface OutreachPreviewImage {
  kind: 'render-comparison' | 'specific-failure';
  base64: string;
  byteSize: number;
  width: number;
  height: number;
  altText: { fr: string; en: string };
}

export interface OutreachPreviewInput {
  language: OutreachPreviewLanguage;
  businessName: string;
  /** Where the reader goes next. All three are checked against the same host
   *  allowlist; there is no fourth link and no inline JavaScript to add one. */
  links: { offer: string; privacy: string; optOut: string };
  /** RGPD article 14 requires telling someone whose data we processed without
   *  asking them where it came from. Enumerated, not free text, so a preview
   *  cannot invent a provenance nobody can support. */
  dataOrigins: Array<'public-hotel-catalogue' | 'public-website' | 'public-business-registry'>;
  summaries: PublicFindingSummary[];
  images: OutreachPreviewImage[];
  /** Built by `buildOutreachFactsBlock`. Paragraph strings, already
   *  deterministic; the schema re-checks them so a hand-built input cannot
   *  smuggle prose in through this field. */
  facts: { state: 'omitted' } | { state: 'rendered'; heading: string; paragraphs: string[] };
  observedAt: Date;
}

const bilingualSchema = z.object({ fr: z.string().min(1), en: z.string().min(1) }).strict();

const linkSchema = z
  .string()
  .max(MAX_URL_LENGTH)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'link must be an absolute URL' });
      return;
    }
    if (url.protocol !== 'https:') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'link must be https' });
    }
    if (!ALLOWED_LINK_HOSTNAMES.has(url.hostname)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'link host is not allowlisted' });
    }
    // Credentials in a link are a phishing shape, and a port is a tell that the
    // link was built by hand rather than from the published site.
    if (url.username !== '' || url.password !== '' || url.port !== '') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'link must carry no credentials and no port',
      });
    }
  });

const PNG_MAGIC = 'iVBORw0KGgo';

const imageSchema = z
  .object({
    kind: z.enum(['render-comparison', 'specific-failure']),
    base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
    byteSize: z.number().int().positive().max(HOTEL_EVIDENCE_MAX_ASSET_BYTES),
    width: z.number().int().positive().max(MAX_IMAGE_DIMENSION_PX),
    height: z.number().int().positive().max(MAX_IMAGE_DIMENSION_PX),
    altText: bilingualSchema,
  })
  .strict()
  .superRefine((image, context) => {
    // A declared size that disagrees with the payload means one of the two was
    // computed somewhere else, and the caps are enforced on the declared one.
    const decodedLength = Buffer.from(image.base64, 'base64').byteLength;
    if (decodedLength !== image.byteSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'byteSize must equal the decoded payload length',
      });
    }
    if (!image.base64.startsWith(PNG_MAGIC)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'payload must be a PNG' });
    }
  });

const summarySchema = z
  .object({
    observation: fixedObservationSchema,
    severity: z.enum(['critical', 'serious', 'moderate', 'minor']),
    wcagCriteria: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)),
    pageRole: z.enum(['homepage', 'booking', 'content']),
  })
  .strict();

const factsSchema = z.union([
  z.object({ state: z.literal('omitted') }).strict(),
  z
    .object({
      state: z.literal('rendered'),
      heading: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).min(1),
    })
    .strict(),
]);

export const outreachPreviewInputSchema: z.ZodType<OutreachPreviewInput> = z
  .object({
    language: z.enum(['fr', 'en']),
    businessName: z.string().min(1).max(MAX_BUSINESS_NAME_LENGTH),
    links: z.object({ offer: linkSchema, privacy: linkSchema, optOut: linkSchema }).strict(),
    dataOrigins: z
      .array(z.enum(['public-hotel-catalogue', 'public-website', 'public-business-registry']))
      .min(1),
    summaries: z
      .array(summarySchema)
      .min(HOTEL_EVIDENCE_MIN_SUMMARIES)
      .max(HOTEL_EVIDENCE_MAX_SUMMARIES),
    images: z.array(imageSchema).max(2),
    facts: factsSchema,
    observedAt: z.date(),
  })
  .strict()
  .superRefine((input, context) => {
    // One of each at most: the two kinds are two logical assets, not a gallery.
    const kinds = input.images.map((image) => image.kind);
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'one image per kind at most' });
    }
    const bytes = input.images.reduce((total, image) => total + image.byteSize, 0);
    if (bytes > HOTEL_EVIDENCE_MAX_TOTAL_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'images exceed the evidence contract total byte cap',
      });
    }
    if (input.facts.state === 'rendered') {
      for (const paragraph of [input.facts.heading, ...input.facts.paragraphs]) {
        const hit = containsProhibitedPreviewContent(paragraph);
        if (hit !== null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `facts paragraph contains prohibited content: ${hit}`,
          });
        }
      }
    }
    if (containsProhibitedPreviewContent(input.businessName) !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'businessName contains prohibited content',
      });
    }
    // Alt text is free text that ends up inside an HTML attribute. Escaping
    // makes it inert, but an escaped `onerror=` still reads as an event handler
    // to anyone scanning the document, and to the document lint. Rejecting it
    // here keeps that lint strict enough to be worth having.
    for (const image of input.images) {
      for (const language of ['fr', 'en'] as const) {
        if (containsProhibitedPreviewContent(image.altText[language]) !== null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'image altText contains prohibited content',
          });
        }
      }
    }
  });

/** Currency amounts this document is allowed to contain: the offer price, and
 *  the thresholds written into the regime table's own criteria. Anything else
 *  is either a sanction figure, a statistic, or a number nobody approved.
 *
 *  Derived from `REGIME_TABLE` rather than listed, so adding a regime cannot
 *  make its own quoted criterion illegal in the document that quotes it. */
const ALLOWED_MONEY_STRINGS: readonly string[] = [
  ...(['fr', 'en'] as const).map(formatFullAuditPrice),
  // Both languages, not `REGIME_TABLE` directly: the table is French, and the
  // English criterion writes the same threshold as "EUR 2,000,000". Reading one
  // language would make the other document's own quoted criterion illegal.
  ...Object.keys(REGIME_TABLE).flatMap((regimeId) =>
    (['fr', 'en'] as const).flatMap((language) => {
      const description = getRegime(regimeId, language)?.thresholdDescription ?? '';
      return (
        [...description.matchAll(/(?:EUR\s)?\d[\d\s,.]*(?:\s?€)?/gu)]
          .map((match) => match[0].trim().replace(/[.,]$/u, ''))
          // A bare digit is not an amount, and stripping "2" everywhere would
          // blind the check that follows.
          .filter((candidate) => candidate.length > 3)
      );
    }),
  ),
];

/** Patterns whose presence means the document must not be published.
 *
 *  This is the last of five layers, not the first. The schema's strictness and
 *  its closed vocabularies do the real work; this catches what free text can
 *  still carry, and it runs over the renderer's own output as well as its
 *  input, because the failure it guards against - a bad public document - is
 *  worse than no document. Returns the name of the rule that fired, so a
 *  rejection says which rule and not merely that something matched. */
export function containsProhibitedPreviewContent(text: string): string | null {
  const rules: Array<[string, RegExp]> = [
    ['markup', /<\s*\/?\s*[a-z][^>]*>/iu],
    ['event-handler', /\bon(?:click|load|error|mouseover|focus|submit)\s*=/iu],
    ['script-url', /javascript:|data:text\/html/iu],
    ['insecure-url', /http:\/\//iu],
    // A finding id, a rule id, or a bare axe rule name.
    ['finding-id', /\bf-\d+\b|\bfinding[-_ ]?id\b|\brule[-_ ]?id\b/iu],
    // A combinator on either side of a class or id, an attribute selector, or
    // a pseudo-class. Prose does not put "> .something" in a sentence, and a
    // selector is exactly the report-only detail outreach must not carry.
    [
      'css-selector',
      /nth-child|::?[a-z-]+\(|[#.][a-z][\w-]*\s*[>+~]|[>+~]\s*[#.][a-z]|\[[a-z-]+[~^$*|]?=/iu,
    ],
    ['percentage', /\d+(?:[.,]\d+)?\s?%/u],
    [
      'legal-conclusion',
      /vous devez|vous êtes tenu|you must|you are required|obligatoire pour vous/iu,
    ],
    ['deadline', /avant le \d|by \d{1,2} [A-Za-z]+ \d{4}|d'ici (?:le )?\d/iu],
    ['sanction', /amende|sanction|penalt(?:y|ies)|mise en demeure/iu],
    // Superseded offer copy. Both spellings shipped in earlier positioning and
    // must never reappear beside the current price.
    ['stale-offer', /sur devis|EUR ?300|EUR ?290|1 ?200 ?(?:à|to) ?1 ?900/iu],
  ];

  for (const [name, pattern] of rules) {
    if (pattern.test(text)) return name;
  }

  // Currency is checked last and by subtraction: strip every amount this
  // document is entitled to name, then see whether any money is left.
  //
  // Both sides are whitespace-normalized first. The French price and the
  // regime thresholds carry no-break spaces, and any renderer that collapses
  // whitespace turns them into ordinary ones - so an un-normalized comparison
  // fails to recognise the very amounts it approved, which is a rejection that
  // looks like a safety win and is actually a bug.
  const normalize = (value: string): string => value.replace(/\s+/gu, ' ');
  let remaining = normalize(text);
  for (const allowed of ALLOWED_MONEY_STRINGS) {
    remaining = remaining.split(normalize(allowed)).join('');
  }
  if (/(?:EUR|€|\$|£)\s?[\d]|[\d][\d\s,.]*\s?(?:EUR|€)/u.test(remaining)) {
    return 'currency-amount';
  }

  return null;
}
