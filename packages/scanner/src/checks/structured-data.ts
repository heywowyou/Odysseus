/**
 * Milestone 8.6: validates the JSON-LD/microdata/RDFa already present in
 * the rendered page against structured-data-testing-tool's built-in
 * Google preset - the properties Google's own rich-results pipeline
 * expects for the schema types it recognizes (Article, Organization,
 * WebPage, and their variants). Runs inside scan-page.ts's existing
 * onRenderedPage hook against page.content(), no extra page load.
 *
 * structuredDataTest() only makes a network request when its input is a
 * URL string (confirmed by reading the library's source: it checks
 * validator.isURL() before deciding whether to fetch). Passed the full
 * page HTML string here, it never leaves the process - purely offline,
 * same posture as every other custom check in this codebase.
 *
 * The Google preset's own tests are conditional per schema: a test for
 * Article's required fields only runs when this page actually declares
 * an Article-shaped schema, so a page with no matching schema at all
 * produces zero failures, not false positives. "Auto-detected" property
 * enumeration (the library's default behavior when no explicit
 * presets/schemas are given) is deliberately not used here - those tests
 * are all marked optional by the library itself and only report presence,
 * not correctness, so relying on them would be reporting nothing more
 * than what head-metadata.ts's JSON-LD presence check already does.
 */

import type { Page } from 'playwright';
import { structuredDataTest } from 'structured-data-testing-tool';
import presets from 'structured-data-testing-tool/presets.js';

// presets.js has no named exports (confirmed against the installed
// package: `Object.keys(await import('structured-data-testing-tool/presets.js'))`
// returns only `['default']`), unlike the test-fixture-driven assumption
// this originally shipped with - only caught by a real-site scan
// throwing a SyntaxError at import time, since a Vitest unit test mocking
// this module never exercises the real package's export shape.
const { Google } = presets;

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

interface StructuredDataTestObject {
  test: string;
  schema?: string;
  type?: string;
}

interface StructuredDataTestResponse {
  schemas?: string[];
  failed?: StructuredDataTestObject[];
}

function isValidationFailedError(error: unknown): error is { type: string; res: StructuredDataTestResponse } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type: unknown }).type === 'VALIDATION_FAILED'
  );
}

function toFailedTests(tests: StructuredDataTestObject[] | undefined): StructuredDataFailedTest[] {
  return (tests ?? []).map((test) => ({
    test: test.test,
    ...(test.schema !== undefined ? { schema: test.schema } : {}),
    ...(test.type !== undefined ? { type: test.type } : {}),
  }));
}

/** Pure: runs the Google preset against an already-fetched HTML string.
 *  Exported separately from checkStructuredData so this part is
 *  unit-testable without a browser, matching the rest of this
 *  codebase's "pure logic, thin Playwright glue" split (see
 *  head-metadata.ts's parseJsonLdBlocks for the same pattern). */
export async function evaluateStructuredData(html: string): Promise<StructuredDataEvaluation> {
  try {
    const result = (await structuredDataTest(html, { presets: [Google] })) as StructuredDataTestResponse;
    return { schemasFound: result.schemas ?? [], failedTests: [] };
  } catch (error) {
    if (isValidationFailedError(error)) {
      return {
        schemasFound: error.res.schemas ?? [],
        failedTests: toFailedTests(error.res.failed),
      };
    }
    throw error;
  }
}

export async function checkStructuredData(page: Page, pageUrl: string): Promise<StructuredDataCheckResult> {
  const html = await page.content();
  const evaluation = await evaluateStructuredData(html);
  return { pageUrl, ...evaluation };
}
