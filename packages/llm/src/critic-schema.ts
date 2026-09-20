import { z } from 'zod';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

/**
 * Plan 070 decision 6: the closed set of judgment defects the grounded critic
 * may raise. Everything a deterministic guard owns (counts, legal claims,
 * severity words, WCAG versions, provider naming, language), tone, length,
 * and the generic consequence of a real finding are deliberately absent: the
 * removed Plan 067 reviewer flagged that last one on every businessImpact.
 */
export const WRITING_CRITIC_CATEGORIES = [
  'contradicts-evidence',
  'unsupported-inference',
  'remedy-mismatch',
  'cross-theme-redundancy',
  'unexplained-jargon',
] as const;

export type WritingCriticCategory = (typeof WRITING_CRITIC_CATEGORIES)[number];

export const MAX_WRITING_CRITIC_ISSUES = 12;
const MAX_CRITIC_PROBLEM_CHARS = 400;

/** One issue as the orchestration accepts it: bound to a prose field path
 *  and to at least one finding ID. Operator-facing `problem` text is English
 *  whatever the report language, and never reaches a client document. */
export const writingCriticIssueSchema = z
  .object({
    field: z.string().min(1),
    category: z.enum(WRITING_CRITIC_CATEGORIES),
    findingIds: z.array(z.string().min(1)).min(1),
    problem: z.string().trim().min(1).max(MAX_CRITIC_PROBLEM_CHARS),
  })
  .strict();

export type WritingCriticIssue = z.infer<typeof writingCriticIssueSchema>;

/** The provider response. Issues stay unparsed here on purpose: one
 *  malformed issue is dropped and counted by `validateCriticIssues` rather
 *  than discarding every valid issue beside it. The cap is enforced on the
 *  whole list, so an over-long list is an invalid response, skipped like
 *  any other. */
export const writingCriticResponseSchema = z
  .object({
    issues: z.array(z.unknown()).max(MAX_WRITING_CRITIC_ISSUES),
  })
  .strict();

export type WritingCriticResponse = z.infer<typeof writingCriticResponseSchema>;

/** Plan 070 B6: the targeted repair's response, one replacement text per
 *  flagged field path and nothing else. An empty string removes a
 *  recommendedActions entry; the orchestration rejects it anywhere else. */
export function buildFieldRepairResponseSchema(fields: readonly string[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field, z.string()]))).strict();
}

export type FieldRepairResponse = Record<string, string>;

/** The critic sees exactly what the writer saw plus the sanitized prose the
 *  report would ship. No HTML, no findings outside the theme packets, no
 *  structure or ranking it could reopen. */
export interface WritingCriticInput {
  writingInput: WritingInput;
  written: WritingPassOutput;
}
