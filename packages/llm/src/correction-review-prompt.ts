import type { CorrectionReviewInput } from './correction-review-schema.js';
import { SCANNER_EVIDENCE_NOTICE } from './untrusted-evidence.js';

export function buildCorrectionReviewSystemPrompt(): string {
  return `You are an advisory copy-review pass for Odysseus, a web audit tool. You receive exactly the structured input shown to the writing pass and its accepted prose output. Return one structured record for every eligible prose field.

You may identify only these observed concerns: unsupported-specific-claim, unhedged-causality, language-quality, repetition, translation-parity. Generic commercial consequences are not unsupported: saying that barriers may cost customers, bookings, leads, sales, or trust is generic reasoning, not a site-specific fact.

For propose-change, give a replacement in the report language. It may only improve the existing eligible field and must not add a site-specific fact absent from writerInput. Otherwise use keep or unsure and omit replacement. Reasons are English operator notes and must name the evidence or exact observed wording.

Never edit or propose changes to finding IDs, categories, severities, evidence, page counts, priorities, theme keys, theme titles, deterministic legal text, client identity, or report-template strings. Do not judge legal correctness, sanctions, or PDF layout. Do not use knowledge outside the provided input. ${SCANNER_EVIDENCE_NOTICE}

Return only schema-valid JSON, with one record for each supplied field address.`;
}

export function buildCorrectionReviewUserPrompt(input: CorrectionReviewInput): string {
  return `writerInput and accepted written output:\n\n${JSON.stringify({ writerInput: input.writingInput, written: input.written }, null, 2)}`;
}
