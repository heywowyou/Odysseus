/**
 * C6 (2026-08-24): violation judgment for the NAP consistency check.
 *
 * Per-page, unlike the other checks added this session: contact details
 * on a contact page and on a room page can legitimately differ (a group
 * with several properties), so this is a fact about one page's own
 * internal consistency, not about the site.
 *
 * Category is 'geo' rather than 'seo', per CLAUDE.md trade-off 14's own
 * reasoning: this is about whether an AI assistant can state the
 * business's contact details with confidence, which is the audience 'geo'
 * exists for. 'moderate': a contradiction genuinely suppresses an answer,
 * but nothing here is unreachable or unindexable.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const NAP_PHONE_MISMATCH_RULE_ID = 'nap-phone-mismatch';
export const NAP_POSTAL_CODE_MISMATCH_RULE_ID = 'nap-postal-code-mismatch';

export interface NapConsistencyCheckInput {
  structuredPhones: string[];
  visiblePhones: string[];
  structuredPostalCodes: string[];
  visiblePostalCodes: string[];
  phoneMismatch: boolean;
  postalCodeMismatch: boolean;
}

function candidate(
  ruleId: string,
  title: string,
  description: string,
  pageUrl: string,
  rawEvidence: Record<string, unknown>,
): FindingCandidate {
  return {
    source: 'custom',
    ruleId,
    category: 'geo',
    severity: severityFromCustom(ruleId),
    wcagCriteria: [],
    title,
    description,
    pageUrl,
    // Page-scoped: the contradiction is between two parts of the page,
    // not located at one element, and naming only the JSON-LD block
    // would point a developer at half the problem.
    element: null,
    rawEvidenceForPage: rawEvidence,
  };
}

export function normalizeNapConsistency(
  input: NapConsistencyCheckInput,
  pageUrl: string,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  if (input.phoneMismatch) {
    candidates.push(
      candidate(
        NAP_PHONE_MISMATCH_RULE_ID,
        'The phone number in the structured data does not appear on the page',
        `This page declares ${input.structuredPhones.join(', ')} to search engines and AI assistants, but the number a visitor reads is ${input.visiblePhones.join(', ')}. When the machine-readable and human-readable versions disagree, an assistant asked for this business's number generally declines to answer rather than choosing one.`,
        pageUrl,
        { structuredPhones: input.structuredPhones, visiblePhones: input.visiblePhones },
      ),
    );
  }

  if (input.postalCodeMismatch) {
    candidates.push(
      candidate(
        NAP_POSTAL_CODE_MISMATCH_RULE_ID,
        'The postal code in the structured data does not appear on the page',
        `This page declares postal code ${input.structuredPostalCodes.join(', ')} to search engines and AI assistants, but the code a visitor reads is ${input.visiblePostalCodes.join(', ')}.`,
        pageUrl,
        {
          structuredPostalCodes: input.structuredPostalCodes,
          visiblePostalCodes: input.visiblePostalCodes,
        },
      ),
    );
  }

  return candidates;
}
