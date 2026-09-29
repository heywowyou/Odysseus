import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  findingsProvenanceMatches,
  llmOutputSchema,
  themeSchema,
  type FindingsProvenance,
  type ReportLanguage,
} from '@odysseus/core';
import { z } from 'zod';
import type { StoredAnalysis, VerifiedStoredAnalysis } from '@odysseus/report';

const storedThemeSchema = themeSchema.extend({
  // Stored categories come from deterministic finding grouping and therefore
  // include geo, even though the model-facing llmOutputSchema excludes it.
  category: z.enum(['accessibility', 'seo', 'geo', 'performance', 'rendering', 'privacy']),
});

const reusableAnalysisSchema = llmOutputSchema
  .extend({
    themes: z.array(storedThemeSchema).min(1).max(20),
    analysisId: z.string().min(1),
    auditId: z.string().min(1),
    findingsProvenance: z.object({
      findingsSchemaVersion: z.number().int().positive(),
      normalizationFingerprint: z.string().min(1),
      findingsDigest: z.string().min(1),
    }),
    language: z.enum(['fr', 'en']),
    model: z.string().min(1),
    temperature: z.number().finite(),
    generatedAt: z.string().datetime(),
    structureGeneratedAt: z.string().datetime(),
    generationMode: z.literal('static-fallback').optional(),
    writingCritic: z
      .object({
        ran: z.boolean(),
        issuesRaised: z.number().int().nonnegative(),
        issuesAccepted: z.number().int().nonnegative(),
        repairApplied: z.boolean(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Whether two provenances describe the same findings.
 *
 * Reuse is a decision, not an assertion: a mismatch means "generate it
 * again", not "abort". `assertFindingsProvenance` (core) stays the entry
 * point wherever a mismatch is a failure, because it names which of the three
 * parts differs and what to run; this answers the same question without
 * throwing, and a test below holds the two against each other so they cannot
 * drift.
 *
 * The comparison itself is core's findingsProvenanceMatches, the one every
 * currency check shares (issue #567).
 *
 * A missing provenance is never the same as any provenance, so a legacy
 * artifact fails closed here too.
 */
export function isSameFindingsProvenance(
  actual: FindingsProvenance | undefined,
  expected: FindingsProvenance,
): boolean {
  return findingsProvenanceMatches(actual, expected);
}

/** What a stored analysis has to match to be reused instead of regenerated. */
export interface AnalysisReuseCriteria {
  auditId: string;
  findingsProvenance: FindingsProvenance;
  /** The `generatedAt` of the structure document the pass about to run will
   *  use, which identifies that document uniquely. */
  structureGeneratedAt: string;
  /** Issue #559: the business facts the writing pass would be given, or
   *  undefined when it would get none. Prose written with other facts (or
   *  none) is not what a fresh run would write. */
  siteContext: object | undefined;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) =>
    typeof child === 'object' && child !== null && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  );
}

/**
 * Whether a stored analysis is one a fresh run would reproduce.
 *
 * Issue #410: the deliverable is the bilingual pair, and the callers run
 * French then English in sequence. When the English writing pass exhausted its
 * retries, the French pass that had already succeeded was left without a pair,
 * and the operator's only route forward was to run the writing again -
 * regenerating French from scratch. Measured 2026-09-17 on a 378-page audit:
 * that French generation was paid for and discarded, and because a re-roll is
 * not the prose that was already produced, any review done on it was void too.
 *
 * This is the mechanism the structure pass already has (newest compatible
 * `*-structure.json`, reused by default, forced fresh by `regenerateStructure`)
 * applied one level down. Every condition below is required, and an absent one
 * refuses rather than assumes - the standing provenance guardrail is fail
 * closed, so "I cannot tell" and "it does not match" have the same answer.
 */
export function isReusableAnalysis(
  stored: Partial<StoredAnalysis> | undefined,
  criteria: AnalysisReuseCriteria,
): boolean {
  if (stored === undefined) return false;
  // Never across audits, whatever the file is called.
  if (stored.auditId !== criteria.auditId) return false;
  // A legacy analysis with no id cannot be referenced as half of a pair.
  if (stored.analysisId === undefined) return false;
  // The static fallback made no model call, so there is nothing to save by
  // reusing it and nothing to trust in pairing it with generated prose.
  if (stored.generationMode === 'static-fallback') return false;
  // Written against a different structure document: reusing it would merge
  // the pair onto two different sets of themes.
  if (
    stored.structureGeneratedAt === undefined ||
    stored.structureGeneratedAt !== criteria.structureGeneratedAt
  ) {
    return false;
  }
  if (stableJson(stored.siteContext) !== stableJson(criteria.siteContext)) return false;
  // A re-normalized findings.json regenerates rather than pairing new
  // findings with old prose. `isSameFindingsProvenance` already refuses an
  // absent provenance.
  return isSameFindingsProvenance(stored.findingsProvenance, criteria.findingsProvenance);
}

/** The newest reusable stored analysis for this language, or nothing. */
export async function findReusableAnalysis(
  analysesDir: string,
  language: ReportLanguage,
  criteria: AnalysisReuseCriteria,
): Promise<{ analysis: VerifiedStoredAnalysis; analysisPath: string } | undefined> {
  let entries: string[];
  try {
    entries = await fs.readdir(analysesDir);
  } catch {
    return undefined;
  }
  // ISO-8601 filenames sort chronologically, same as the structure lookup.
  const candidates = entries.filter((name) => name.endsWith(`-${language}.json`)).sort();
  for (const name of candidates.reverse()) {
    const candidatePath = path.join(analysesDir, name);
    let stored: Omit<StoredAnalysis, 'generatedAt'> & { generatedAt: string };
    try {
      const raw: unknown = JSON.parse(await fs.readFile(candidatePath, 'utf-8'));
      const parsed = reusableAnalysisSchema.safeParse(raw);
      if (!parsed.success) continue;
      stored = parsed.data as unknown as Omit<StoredAnalysis, 'generatedAt'> & {
        generatedAt: string;
      };
    } catch {
      // A half-written or hand-edited file is not evidence of anything; the
      // next candidate, or a fresh generation, is the safe answer.
      continue;
    }
    const storedInMemory = { ...stored, generatedAt: new Date(stored.generatedAt) };
    if (!isReusableAnalysis(storedInMemory, criteria)) continue;
    return {
      analysis: {
        ...stored,
        analysisId: stored.analysisId!,
        findingsProvenance: stored.findingsProvenance!,
        // Stored as an ISO string on disk, a Date in memory - the same
        // convention Finding.firstSeenAt/lastSeenAt uses.
        generatedAt: new Date(stored.generatedAt),
      },
      analysisPath: candidatePath,
    };
  }
  return undefined;
}
