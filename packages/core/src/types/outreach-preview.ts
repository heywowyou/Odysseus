/**
 * The contract for a public-safe outreach preview, and the guard that
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
 * what may be said lives here.
 *
 * **The offer price is not a field.** It is
 * `ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT`, injected by the renderer. Because these
 * objects are strict, a caller that tries to pass a price is rejected rather
 * than quietly quoting a different one, which is what "sourced from one
 * code-owned constant" actually has to mean to be worth stating.
 *
 * **v3 only.** `OutreachPreviewSummaryV3` is the one contract (plan 069):
 * measured aggregates stay deterministic, the three cards follow the selected
 * report priority order using only reviewed public copy, and scoped client
 * limitations are admitted explicitly. Issue #530 removed the v1 prescan
 * input and the v2 scorecard; an older published row keeps its page in the
 * bucket, and drafting from it is refused until it is republished. V3 has no
 * image, model-prose, selector, exact-URL, finding-ID, remediation or
 * raw-evidence field: unsafe report data has nowhere to go.
 */

import { z } from 'zod';
import type { FindingCategory } from './findings.js';
import { REGIME_TABLE, getRegime } from '../compliance/regimes.js';
import { formatFullAuditPrice } from '../offer/pricing.js';
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
    // Superseded offer copy. Every spelling here shipped in earlier
    // positioning and must never reappear beside the current price. The
    // EUR 1,600 HT figure held from 2026-08-16 to 2026-09-17 (trade-off 96);
    // it is named explicitly so a stale document is rejected as stale offer
    // copy rather than as an anonymous currency amount.
    [
      'stale-offer',
      /sur devis|EUR ?300|EUR ?290|1 ?200 ?(?:à|to) ?1 ?900|1[\s,\u00a0\u202f]?600/iu,
    ],
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

export type OutreachDataOrigin =
  'public-hotel-catalogue' | 'public-website' | 'public-business-registry';

export type OutreachPreviewSeverity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface OutreachProofCard {
  /** Selected deterministic copy from the reviewed proof-card catalog, kept
   *  bilingual so the document language stays a rendering decision. */
  title: { fr: string; en: string };
  category: 'accessibility' | 'seo' | 'geo' | 'performance' | 'rendering' | 'privacy';
  severity: OutreachPreviewSeverity;
  /** Unique pages this rule was detected on. Never an occurrence count: one
   *  problem affecting many elements on one page is still 1 here. */
  affectedPageCount: number;
}

export interface OutreachCoverageFacts {
  /** Pages the crawl inventoried: navigated, or recorded with a failure or
   *  planned-skip reason. Continuation-omitted URLs are never folded in. */
  inventoriedPageCount: number;
  /** Pages that received the content-sensitive passes (render diff, axe,
   *  extended accessibility). Completed plus partial: both were checked. */
  contentCheckedPageCount: number;
  /** Pages actually measured by Lighthouse, the disclosed performance
   *  sample. Never presented as equal to the two counts above. */
  performanceMeasuredPageCount: number;
}

export interface OutreachPreviewRecipientFacts {
  businessName: string;
  dataOrigins: OutreachDataOrigin[];
}

const countSchema = (max: number) => z.number().int().min(0).max(max);

const MAX_TOTAL_PAGES = 100_000;

const severityTotalsSchema = z
  .object({
    critical: countSchema(MAX_TOTAL_PAGES),
    serious: countSchema(MAX_TOTAL_PAGES),
    moderate: countSchema(MAX_TOTAL_PAGES),
    minor: countSchema(MAX_TOTAL_PAGES),
  })
  .strict();

// ---------------------------------------------------------------------------
// v3: grounded report-aligned preview (plan 069)
// ---------------------------------------------------------------------------

/** The one published content version (issue #530). */
export const OUTREACH_PREVIEW_CONTENT_VERSION_V3 = 'v3' as const;

export interface OutreachPriorityCard {
  rank: 1 | 2 | 3;
  title: { fr: string; en: string };
  category: OutreachProofCard['category'];
  severity: OutreachPreviewSeverity;
  /** Zero is valid for a site-level priority that has no page-local URL. */
  affectedPageCount: number;
}

/** Carries no scan date and no data-quality section: neither helps a
 *  prospect decide, and the paid report keeps both (amended 2026-09-24,
 *  trade-off 42). */
export interface OutreachPreviewSummaryV3 {
  contentVersion: typeof OUTREACH_PREVIEW_CONTENT_VERSION_V3;
  language: OutreachPreviewLanguage;
  recipient: OutreachPreviewRecipientFacts;
  links: { offer: string; privacy: string; optOut: string };
  coverage: OutreachCoverageFacts;
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  /** The same distinct findings as `severityTotals`, split by category, so
   *  the reader sees which areas the findings fall in, not only how severe
   *  they are. Sums to `distinctFindingCount`. */
  categoryTotals: Record<FindingCategory, number>;
  priorityCards: [OutreachPriorityCard, OutreachPriorityCard, OutreachPriorityCard];
  facts: { state: 'omitted' } | { state: 'rendered'; heading: string; paragraphs: string[] };
}

const categoryTotalsSchema = z
  .object({
    accessibility: countSchema(MAX_TOTAL_PAGES),
    seo: countSchema(MAX_TOTAL_PAGES),
    geo: countSchema(MAX_TOTAL_PAGES),
    performance: countSchema(MAX_TOTAL_PAGES),
    rendering: countSchema(MAX_TOTAL_PAGES),
    privacy: countSchema(MAX_TOTAL_PAGES),
  })
  .strict();

const outreachPriorityCardV3Schema = z
  .object({
    rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    title: bilingualSchema,
    category: z.enum(['accessibility', 'seo', 'geo', 'performance', 'rendering', 'privacy']),
    severity: z.enum(['critical', 'serious', 'moderate', 'minor']),
    affectedPageCount: countSchema(MAX_TOTAL_PAGES),
  })
  .strict();

export const outreachPreviewSummaryV3Schema: z.ZodType<OutreachPreviewSummaryV3> = z
  .object({
    contentVersion: z.literal(OUTREACH_PREVIEW_CONTENT_VERSION_V3),
    language: z.enum(['fr', 'en']),
    recipient: z
      .object({
        businessName: z.string().min(1).max(MAX_BUSINESS_NAME_LENGTH),
        dataOrigins: z
          .array(z.enum(['public-hotel-catalogue', 'public-website', 'public-business-registry']))
          .min(1),
      })
      .strict(),
    links: z.object({ offer: linkSchema, privacy: linkSchema, optOut: linkSchema }).strict(),
    coverage: z
      .object({
        inventoriedPageCount: countSchema(MAX_TOTAL_PAGES),
        contentCheckedPageCount: countSchema(MAX_TOTAL_PAGES),
        performanceMeasuredPageCount: countSchema(MAX_TOTAL_PAGES),
      })
      .strict(),
    distinctFindingCount: countSchema(MAX_TOTAL_PAGES),
    affectedPageCount: countSchema(MAX_TOTAL_PAGES),
    severityTotals: severityTotalsSchema,
    categoryTotals: categoryTotalsSchema,
    priorityCards: z.tuple([
      outreachPriorityCardV3Schema,
      outreachPriorityCardV3Schema,
      outreachPriorityCardV3Schema,
    ]),
    facts: factsSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const { coverage } = input;
    if (
      coverage.contentCheckedPageCount > coverage.inventoriedPageCount ||
      coverage.performanceMeasuredPageCount > coverage.inventoriedPageCount
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'coverage subsets cannot exceed the inventoried page count',
      });
    }
    if (input.affectedPageCount > coverage.inventoriedPageCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'affected page count cannot exceed the inventoried page count',
      });
    }
    const severityTotal = Object.values(input.severityTotals).reduce(
      (total, count) => total + count,
      0,
    );
    if (severityTotal !== input.distinctFindingCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'severity totals must equal the distinct finding count',
      });
    }
    const categoryTotal = Object.values(input.categoryTotals).reduce(
      (total, count) => total + count,
      0,
    );
    if (categoryTotal !== input.distinctFindingCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'category totals must equal the distinct finding count',
      });
    }
    if (input.distinctFindingCount < input.priorityCards.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priority cards cannot exceed distinct findings',
      });
    }
    if (input.priorityCards.some((card, index) => card.rank !== index + 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priority card ranks must be exactly 1, 2, 3',
      });
    }
    if (input.priorityCards.some((card) => card.affectedPageCount > input.affectedPageCount)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priority card page count cannot exceed the affected page count',
      });
    }

    const publicStrings: string[] = [input.recipient.businessName];
    for (const card of input.priorityCards) {
      publicStrings.push(card.title.fr, card.title.en);
    }
    if (input.facts.state === 'rendered') {
      publicStrings.push(input.facts.heading, ...input.facts.paragraphs);
    }
    for (const value of publicStrings) {
      const hit = containsProhibitedPreviewContent(value);
      if (hit !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `public preview content contains prohibited content: ${hit}`,
        });
      }
    }
  });
