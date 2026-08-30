/**
 * Milestone 8.6: validates the JSON-LD/microdata/RDFa already present in the
 * rendered page against the fields Google's own rich-results pipeline expects
 * for the schema types it recognizes. Runs inside scan-page.ts's existing
 * onRenderedPage hook against page.content(), no extra page load, no network.
 *
 * **Why the required-field table is here rather than in a library.** This
 * used to call `structured-data-testing-tool`'s Google preset. That preset
 * turns out to be small once read: of everything it declares, only the
 * Article family, BlogPosting and ClaimReview carry required fields at all.
 * WebPage and Organization mark every field optional, and the "simple
 * article" types (TechArticle, Report, SocialMediaPosting and the rest) test
 * only that the type is present, so none of them can ever produce a failure.
 * The table below is that reduction, written out. Reading it is now possible;
 * it used to mean reading fourteen files inside a dependency.
 *
 * The dependency was replaced rather than pinned because its extraction half
 * (`web-auto-extractor` on `cheerio@0.22.0` and the lodash micro-package long
 * tail) is unmaintained upstream, so no fix for anything found there is
 * coming. Extraction now lives in structured-data-extract.ts.
 *
 * **What changed in the output.** The old library resolved each test against
 * whichever markup form happened to answer it first, so one page could report
 * the same missing field twice under two different markup types and count it
 * twice in the client-facing "missing N fields" sentence. Each markup form a
 * schema is declared in is now validated in its own right, so a field is
 * reported once per form that is genuinely missing it. Stored audits are
 * untouched: this changes what a new scan produces, not how a stored scan is
 * re-normalized.
 */

import type { Page } from 'playwright';
import { extractSchemaItems, type SchemaItem } from './structured-data-extract.js';

/** Google expects these on an Article-shaped item. Read off
 *  structured-data-testing-tool's own Google preset before it was removed;
 *  fields it marked `warning` (dateModified, mainEntityOfPage) are not
 *  required and are deliberately absent. */
const ARTICLE_REQUIRED_FIELDS: readonly string[][] = [
  ['author'],
  ['datePublished'],
  ['headline'],
  ['image'],
  ['publisher', '@type'],
  ['publisher', 'name'],
  ['publisher', 'logo'],
  ['publisher', 'logo', 'url'],
];

const CLAIM_REVIEW_REQUIRED_FIELDS: readonly string[][] = [
  ['url'],
  ['reviewRating'],
  ['claimReviewed'],
];

/** Only the types with required fields appear here. A type Google recognizes
 *  but asks nothing mandatory of (WebPage, Organization, TechArticle and the
 *  rest) is still reported in schemasFound and simply cannot fail. */
const REQUIRED_FIELDS_BY_SCHEMA: Record<string, readonly string[][]> = {
  Article: ARTICLE_REQUIRED_FIELDS,
  NewsArticle: ARTICLE_REQUIRED_FIELDS,
  AnalysisNewsArticle: ARTICLE_REQUIRED_FIELDS,
  AskPublicNewsArticle: ARTICLE_REQUIRED_FIELDS,
  BackgroundNewsArticle: ARTICLE_REQUIRED_FIELDS,
  OpinionNewsArticle: ARTICLE_REQUIRED_FIELDS,
  ReportageNewsArticle: ARTICLE_REQUIRED_FIELDS,
  ReviewNewsArticle: ARTICLE_REQUIRED_FIELDS,
  BlogPosting: ARTICLE_REQUIRED_FIELDS,
  ClaimReview: CLAIM_REVIEW_REQUIRED_FIELDS,
};

export interface StructuredDataFailedTest {
  test: string;
  schema?: string;
  type?: string;
}

export interface StructuredDataCheckResult {
  pageUrl: string;
  schemasFound: string[];
  failedTests: StructuredDataFailedTest[];
}

export interface StructuredDataEvaluation {
  schemasFound: string[];
  failedTests: StructuredDataFailedTest[];
}

/** `Article[0].publisher."@type"` - the path notation the stored evidence of
 *  earlier audits already uses, kept so a reader comparing an old finding to
 *  a new one is looking at the same language. A segment is quoted when it is
 *  not a plain property name, which is what puts the quotes around `@type`. */
function formatTestPath(schema: string, index: number, path: readonly string[]): string {
  const rendered = path
    .map((segment) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment) ? `.${segment}` : `."${segment}"`))
    .join('');
  return `${schema}[${index}]${rendered}`;
}

/** Present means "there is something there a consumer could read": an empty
 *  string, an empty array and a null are all markup that declares the field
 *  and says nothing, which is the same gap to a search engine as no field. */
function hasValueAt(properties: Record<string, unknown>, path: readonly string[]): boolean {
  let current: unknown = properties;

  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return false;
    // A repeated property became an array; the requirement is about the
    // property existing, so the first entry answers for the set.
    if (Array.isArray(current)) current = current[0];
    if (typeof current !== 'object' || current === null) return false;
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === undefined || current === null) return false;
  if (typeof current === 'string') return current.trim() !== '';
  if (Array.isArray(current)) return current.length > 0;
  return true;
}

/** Pure: judges an already-fetched HTML string. Exported separately from
 *  checkStructuredData so this part is unit-testable without a browser,
 *  matching the rest of this codebase's "pure logic, thin Playwright glue"
 *  split (see head-metadata.ts's parseJsonLdBlocks for the same pattern). */
export async function evaluateStructuredData(html: string): Promise<StructuredDataEvaluation> {
  const items = await extractSchemaItems(html);

  // One entry per (markup form, schema) pair, matching what earlier audits
  // recorded: a type declared in both JSON-LD and microdata is listed twice,
  // because that is two declarations a consumer has to reconcile.
  const schemasFound: string[] = [];
  const seenDeclarations = new Set<string>();
  for (const item of items) {
    const key = `${item.markup}:${item.schema}`;
    if (seenDeclarations.has(key)) continue;
    seenDeclarations.add(key);
    schemasFound.push(item.schema);
  }

  const failedTests: StructuredDataFailedTest[] = [];
  const indexByDeclaration = new Map<string, number>();

  const ordered: SchemaItem[] = [
    ...items.filter((item) => item.markup === 'jsonld'),
    ...items.filter((item) => item.markup === 'microdata'),
    ...items.filter((item) => item.markup === 'rdfa'),
  ];

  for (const item of ordered) {
    const key = `${item.markup}:${item.schema}`;
    const index = indexByDeclaration.get(key) ?? 0;
    indexByDeclaration.set(key, index + 1);

    const required = REQUIRED_FIELDS_BY_SCHEMA[item.schema];
    if (required === undefined) continue;

    for (const path of required) {
      if (hasValueAt(item.properties, path)) continue;
      failedTests.push({
        test: formatTestPath(item.schema, index, path),
        schema: item.schema,
        type: item.markup,
      });
    }
  }

  return { schemasFound, failedTests };
}

export async function checkStructuredData(
  page: Page,
  pageUrl: string,
): Promise<StructuredDataCheckResult> {
  const html = await page.content();
  return { pageUrl, ...(await evaluateStructuredData(html)) };
}
