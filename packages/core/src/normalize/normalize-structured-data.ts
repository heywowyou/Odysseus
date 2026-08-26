/**
 * Milestone 8.6: violation judgment for the structured-data-testing-tool
 * check. One finding per page (not per failed field), same aggregation
 * choice as mixed-content.ts: every failed test path is recorded in
 * rawEvidence, so a page missing five required Article fields becomes
 * one finding with five listed gaps, not five findings.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const STRUCTURED_DATA_INVALID_RULE_ID = 'structured-data-invalid';

export interface StructuredDataCheckInput {
  pageUrl: string;
  schemasFound: string[];
  failedTests: { test: string; schema?: string; type?: string }[];
}

export function extractStructuredDataCandidates(
  input: StructuredDataCheckInput,
): FindingCandidate[] {
  if (input.failedTests.length === 0) return [];

  const schemasInvolved = [
    ...new Set(
      input.failedTests
        .map((test) => test.schema)
        .filter((schema): schema is string => Boolean(schema)),
    ),
  ];

  return [
    {
      source: 'custom',
      ruleId: STRUCTURED_DATA_INVALID_RULE_ID,
      category: 'geo',
      severity: severityFromCustom(STRUCTURED_DATA_INVALID_RULE_ID),
      wcagCriteria: [],
      title: 'Structured data is missing fields Google reads',
      description:
        schemasInvolved.length > 0
          ? `This page declares ${schemasInvolved.join(', ')} structured data, but is missing ${input.failedTests.length} field(s) Google's own rich-results pipeline expects for that schema. Missing fields are not necessarily wrong content, just absent markup - search engines and AI answer engines that rely on this markup to extract facts about the page get an incomplete picture.`
          : `This page's structured data is missing ${input.failedTests.length} field(s) expected for the schema type(s) it declares.`,
      pageUrl: input.pageUrl,
      element: null,
      rawEvidenceForPage: { schemasFound: input.schemasFound, failedTests: input.failedTests },
    },
  ];
}
