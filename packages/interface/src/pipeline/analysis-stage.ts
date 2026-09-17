/**
 * Groups, prioritizes, and writes a completed audit's findings via the
 * OpenAI API, exactly as the `odysseus analyze` CLI command does today -
 * extracted so `cli` and the queued pipeline share one implementation.
 * See audit-stage.ts's header for why this was extracted.
 *
 * Reads nothing off disk itself except a possible existing structure
 * file (the reuse-across-languages mechanism, unchanged from milestone
 * 6.1): manifest and findings are passed in by the caller, which for the
 * CLI means reading them off disk (an artifacts-dir argument) and for the
 * queued pipeline means the in-memory result audit-stage just produced.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Connection } from 'mongoose';
import type {
  AuditManifest,
  Finding,
  FindingsProvenance,
  ObligationAssessment,
  ReportLanguage,
  SiteSignalOverrides,
} from '@odysseus/core';
import {
  assertFindingsProvenance,
  buildFindingsProvenance,
  isAuditFallbackEligible,
} from '@odysseus/core';
import {
  analyzeReview,
  analyzeCorrectionReview,
  analyzeStructure,
  analyzeWriting,
  buildFallbackSiteContext,
  buildStructureInput,
  buildWritingInput,
  computeDominantPerformanceMetric,
  computeSiteStats,
  deriveTransactionalFlowStatus,
  filterFindingsForLlm,
  findUnreferencedStructureFindingIds,
  mergeAnalysisPasses,
  parseStructureDocument,
  partitionFindings,
  summarizeUnsupportedReviews,
  CORRECTION_REVIEW_PROMPT_VERSION,
  type AnalyzeWritingResult,
  type SiteContextInput,
  type StructureDocument,
  type WritingInput,
} from '@odysseus/llm';
import { persistAnalysis } from '@odysseus/store';
import { getStrings, type VerifiedStoredAnalysis } from '@odysseus/report';
import { runObligationStage } from './obligation-stage.js';
import { findReusableAnalysis } from './analysis-reuse.js';

export interface RunAnalysisStageOptions {
  language: ReportLanguage;
  /** Omitted means "use the fallback context" - the intake questionnaire
   *  this would otherwise come from doesn't exist yet (see
   *  docs/rules/llm-layer-rules.md section 4). */
  siteContext?: SiteContextInput;
  regenerateStructure?: boolean;
  /** Computed once per audit by runAuditStage and passed through by the
   *  queued pipeline (run-full-audit-job.ts), so both languages reuse the
   *  same, language-neutral determination rather than looking it up
   *  twice. Omitted means the standalone `odysseus analyze <dir>` CLI
   *  path, which never calls runAuditStage - runAnalysisStage computes it
   *  itself in that case (the Sirene cache absorbs the repeat lookup
   *  cost), so `analyze <dir>` stays independently runnable. */
  obligationAssessment?: ObligationAssessment;
  /** Only consulted when obligationAssessment above is not already
   *  supplied. Fixes a real gap found 2026-08-10 running the standalone
   *  `odysseus audit --siren ... --override-transactional-flow ...` then
   *  `odysseus analyze` two-step CLI workflow against haaitza.com: the
   *  manual SIREN and site-signal override given to `audit` never reached
   *  this stage's own fallback runObligationStage call (it only had
   *  manifest.siteSignals' extracted facts to work with), so a site that
   *  publishes no SIREN of its own silently produced an 'undetermined'
   *  legal-obligation report even though the operator had supplied
   *  exactly the fact needed to resolve it. `analyze <dir>` now accepts
   *  the same two flags `audit` does, for this exact case. */
  manualSiren?: string;
  siteSignalOverrides?: SiteSignalOverrides;
  /** Computed once per job by the queued pipeline over the same findings
   *  array both languages receive, so the canonicalize plus hash runs once
   *  instead of twice per job. Omitted means the standalone CLI path,
   *  which computes it here exactly as before. */
  findingsProvenance?: FindingsProvenance;
  /** Issue #410: force a fresh writing pass even when a compatible stored
   *  analysis exists for this language. Default (false) reuses it, the same
   *  way `regenerateStructure` defaults to reusing the newest compatible
   *  structure document one level up. The operator needs this because a
   *  reused analysis must never be silently stale. */
  regenerateWriting?: boolean;
}

export interface AnalysisStageResult {
  analysis: VerifiedStoredAnalysis;
  analysisPath: string;
  structurePath: string;
  structureReused: boolean;
  /** Issue #410: true when this language's analysis was taken from disk
   *  rather than generated, so the caller can report that no model call was
   *  made for it. */
  writingReused: boolean;
  unreferencedFindingCount: number;
  usedFallbackContext: boolean;
  /** The two advisory passes (correction review, shadow reviewer), started
   *  but not awaited so the stage resolves before they do. Each promise
   *  contains its own try/catch and can never reject; callers that must
   *  not exit or complete while advisory writes are pending await them
   *  (Promise.allSettled) at their own boundary. Empty on the static
   *  fallback path (issue #162), which makes zero model calls. */
  advisoryPasses: readonly Promise<void>[];
}

function timestampForFilename(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
}

/** The static fallback branch's overallRisk, computed from every finding
 *  the audit actually has - not only the ones that reached the model. A
 *  diverted finding (docs/archive/report-v2-refactor.md Part 4.1: a legal
 *  notice missing, or a WCAG defect confined to a wrapper/legal page) can
 *  be 'serious' or worse and still never reach forModel, so this must not
 *  reuse isAuditFallbackEligible's own severity read as a proxy for "the
 *  site is clean" - that predicate only tells us the LLM was skipped, not
 *  what severity the skipped findings were. See the forModel.length === 0
 *  branch below. */
function fallbackOverallRisk(findings: readonly Finding[]): 'low' | 'medium' | 'high' {
  if (findings.some((finding) => finding.severity === 'critical')) return 'high';
  if (findings.some((finding) => finding.severity === 'serious')) return 'medium';
  return 'low';
}

/** Newest existing analyses/<timestamp>-structure.json for this audit, by
 *  lexicographic sort - ISO-8601 filenames sort chronologically. */
async function findLatestStructureFile(analysesDir: string): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await fs.readdir(analysesDir);
  } catch {
    return undefined;
  }
  const matching = entries.filter((name) => name.endsWith('-structure.json')).sort();
  const latest = matching.at(-1);
  return latest ? path.join(analysesDir, latest) : undefined;
}

/** The one thing that decides findingIds/category/effort/impact/
 *  priorityRank/quickWins/overallRisk for this audit, shared across every
 *  language. Reused by default (newest existing *-structure.json);
 *  regenerateStructure forces a fresh run. A reused file is defensively
 *  re-checked against the current filtered findings: a stale structure
 *  file (written before findings.json was re-normalized) fails loudly
 *  rather than silently regenerating or silently proceeding with a
 *  finding that may no longer exist. See docs/rules/llm-layer-rules.md
 *  sections 2 and 9. */
async function loadOrGenerateStructure(
  analysesDir: string,
  auditId: string,
  forModel: readonly Finding[],
  siteContext: SiteContextInput,
  usedFallback: boolean,
  regenerate: boolean,
  manifest: AuditManifest,
  findingsProvenance: ReturnType<typeof buildFindingsProvenance>,
): Promise<{ structureDoc: StructureDocument; reused: boolean; structurePath: string }> {
  if (!regenerate) {
    const existingPath = await findLatestStructureFile(analysesDir);
    if (existingPath) {
      const raw = JSON.parse(await fs.readFile(existingPath, 'utf-8'));
      const structureDoc = parseStructureDocument(raw);
      assertFindingsProvenance(
        structureDoc.findingsProvenance,
        findingsProvenance,
        'structure document',
      );

      const knownIds = new Set(forModel.map((f) => f.findingId));
      const referenced = new Set<string>();
      for (const theme of structureDoc.themes)
        for (const id of theme.findingIds) referenced.add(id);
      for (const id of structureDoc.quickWins) referenced.add(id);
      const stale = [...referenced].filter((id) => !knownIds.has(id));
      if (stale.length > 0) {
        throw new Error(
          `odysseus analyze: existing structure file ${existingPath} references finding ID(s) no longer ` +
            `present in the current findings.json: ${stale.join(', ')}. It is stale relative to a re-normalized ` +
            'findings.json. Re-run with --regenerate-structure.',
        );
      }

      return { structureDoc, reused: true, structurePath: existingPath };
    }
  }

  const structureInput = buildStructureInput(forModel, siteContext);
  const structureResult = await analyzeStructure(structureInput, forModel, usedFallback, manifest);

  const generatedAt = new Date();
  const structureDoc: StructureDocument = {
    auditId,
    themes: structureResult.themes,
    quickWins: structureResult.quickWins,
    overallRisk: structureResult.overallRisk,
    model: structureResult.model,
    temperature: structureResult.temperature,
    generatedAt: generatedAt.toISOString(),
    findingsProvenance,
  };

  await fs.mkdir(analysesDir, { recursive: true });
  const outputPath = path.join(analysesDir, `${timestampForFilename(generatedAt)}-structure.json`);
  await fs.writeFile(outputPath, JSON.stringify(structureDoc, null, 2));

  return { structureDoc, reused: false, structurePath: outputPath };
}

export async function runAnalysisStage(
  auditDir: string,
  manifest: AuditManifest,
  allFindings: Finding[],
  options: RunAnalysisStageOptions,
  connection: Connection,
): Promise<AnalysisStageResult> {
  const findingsProvenance = options.findingsProvenance ?? buildFindingsProvenance(allFindings);
  assertFindingsProvenance(manifest.findingsProvenance, findingsProvenance, 'legacy manifest');
  const usedFallbackContext = options.siteContext === undefined;
  const siteContext = options.siteContext ?? buildFallbackSiteContext();
  const writingSiteContext = siteContext;
  const persistsSiteContext = options.siteContext !== undefined;
  // Diversion (docs/archive/report-v2-refactor.md 4.1) runs after the severity
  // floor, on the same set: forModel must be exactly what reaches the
  // structure and writing passes and their guards, never allFindings.
  const severityFiltered = filterFindingsForLlm(allFindings);
  const { forModel } = partitionFindings(severityFiltered, manifest);
  // Audit fallback gate (docs/rules/llm-layer-rules.md section 10, trade-off
  // 23, wired explicitly by issue #162). Evaluated on allFindings, the
  // audit's own findings, exactly as the rule reads: forModel is a
  // presentation concern (severity floor plus diversion) and must not move
  // the gate. When this holds, no model pass runs at all and the analysis
  // below is built statically.
  //
  // `|| forModel.length === 0` is a second, independent reason to fall
  // back, found reproducing "the report could not be generated" against
  // the odysseus site's own dogfood scan: isAuditFallbackEligible can read
  // false (a serious/critical finding exists in allFindings) while every
  // one of those findings is diverted (partitionFindings above), leaving
  // forModel empty. The structure pass was then still called with zero
  // findings, correctly returned zero themes, and zod's `.min(1)` on
  // `themes` rejected that response on every retry - `themes` must never
  // be empty when the model is called, so this must stop the call from
  // happening at all rather than adjust the schema to accept it. Reused
  // here for the true isAuditFallbackEligible case too (an empty
  // allFindings already implies forModel.length === 0), not just added
  // alongside it.
  const fallbackEligible = isAuditFallbackEligible(allFindings) || forModel.length === 0;
  const analysesDir = path.join(auditDir, 'analyses');

  let structurePath = '';
  let structureReused = false;
  let structureDoc: StructureDocument | undefined;
  if (!fallbackEligible) {
    const structure = await loadOrGenerateStructure(
      analysesDir,
      manifest.auditId,
      forModel,
      siteContext,
      usedFallbackContext,
      options.regenerateStructure ?? false,
      manifest,
      findingsProvenance,
    );
    structureDoc = structure.structureDoc;
    structurePath = structure.structurePath;
    structureReused = structure.reused;
  }

  // Not present in the queued pipeline (run-full-audit-job.ts passes it
  // through, computed once by runAuditStage), but the standalone
  // `odysseus analyze <dir>` CLI path calls this stage directly - computed
  // lazily here so that path stays independently runnable. The Sirene
  // cache absorbs the cost of a repeat lookup for the same SIREN.
  // Deterministic (Sirene-backed) and needed by the report's legal
  // sections, so the fallback gate never skips it.
  const obligationAssessment =
    options.obligationAssessment ??
    (await runObligationStage(
      manifest,
      connection,
      options.manualSiren,
      options.siteSignalOverrides,
    ));

  // Issue #410: before spending a generation, see whether this language
  // already has one that a fresh run would reproduce. Only on the model path -
  // the static fallback makes no model call to save.
  if (structureDoc !== undefined && !(options.regenerateWriting ?? false)) {
    const reusable = await findReusableAnalysis(analysesDir, options.language, {
      auditId: manifest.auditId,
      findingsProvenance,
      structureGeneratedAt: structureDoc.generatedAt,
    });
    if (reusable) {
      console.log(
        `odysseus analyze (writing pass, language=${options.language}): reusing ${path.basename(reusable.analysisPath)}, generated against the same structure document and the same findings`,
      );
      return {
        analysis: reusable.analysis,
        analysisPath: reusable.analysisPath,
        structurePath,
        structureReused,
        writingReused: true,
        unreferencedFindingCount: findUnreferencedStructureFindingIds(structureDoc, forModel)
          .length,
        usedFallbackContext,
        // Nothing was generated, so there is nothing new to review: the
        // advisory passes already ran for this analysis when it was written.
        advisoryPasses: [],
      };
    }
  }

  const analysisId = randomUUID();
  let analysis: VerifiedStoredAnalysis;
  let unreferencedFindingCount = 0;
  // Only the model-generated path produces writer artifacts; the static
  // fallback leaves this undefined so the advisory passes below have
  // nothing to review and make zero provider calls.
  let modelPasses:
    | { writingInput: WritingInput; writingResult: AnalyzeWritingResult; generatedAt: Date }
    | undefined;

  if (fallbackEligible) {
    // Static fallback analysis (issue #162): no structure pass, no writing
    // pass, no advisory pass. The bilingual sentences come from the report
    // strings module so the stored artifact and the rendered note share one
    // source of truth. overallRisk is computed from allFindings
    // (fallbackOverallRisk), not hardcoded 'low': the
    // forModel.length === 0 branch above can reach this path with a
    // serious or critical finding still in allFindings (diverted away from
    // the model, not resolved), and reporting 'low' risk next to that
    // finding's own entry in the report's deterministic Observations
    // section would misstate the audit rather than merely omit an LLM
    // opinion. No structure file is written, so nothing downstream can
    // later claim to reuse one.
    const generatedAt = new Date();
    const strings = getStrings(options.language);
    analysis = {
      analysisId,
      auditId: manifest.auditId,
      findingsProvenance,
      language: options.language,
      model: 'static-fallback',
      temperature: 0,
      generatedAt,
      overallRisk: fallbackOverallRisk(allFindings),
      themes: [],
      quickWins: [],
      executiveSummary: strings.fallbackAnalysis.summarySentence,
      notes: strings.fallbackAnalysis.summarySentence,
      obligationAssessment,
      ...(persistsSiteContext ? { siteContext: writingSiteContext } : {}),
      generationMode: 'static-fallback',
    };
  } else {
    // Always assigned on this path: only the not-eligible branch reads it,
    // and the structure stage above runs exactly there.
    const doc = structureDoc!;
    // siteStats is computed from allFindings (unfiltered), not forModel, so
    // the executive summary cites the audit's true scope rather than only
    // what the model was shown. See docs/archive/report-v2-refactor.md B10.
    const siteStats = computeSiteStats(allFindings, manifest);
    const dominantPerformanceMetric = computeDominantPerformanceMetric(manifest);
    const writingInput = buildWritingInput(
      doc.themes,
      forModel,
      writingSiteContext,
      options.language,
      siteStats,
      dominantPerformanceMetric,
      deriveTransactionalFlowStatus(obligationAssessment),
      // Seeds the provider-phrase choice. The auditId is stable across a
      // re-run and across both languages, so regenerating a report never
      // renames the client's provider and the FR/EN pair stays consistent.
      manifest.auditId,
    );
    const generatedAt = new Date();
    const writingResult = await analyzeWriting(
      writingInput,
      doc.themes.map((t) => t.themeKey),
      usedFallbackContext,
    );
    const merged = mergeAnalysisPasses(doc, writingResult.output, forModel, options.language);
    unreferencedFindingCount = findUnreferencedStructureFindingIds(doc, forModel).length;

    modelPasses = { writingInput, writingResult, generatedAt };
    analysis = {
      ...merged,
      analysisId,
      auditId: manifest.auditId,
      findingsProvenance,
      language: options.language,
      model: writingResult.model,
      temperature: writingResult.temperature,
      generatedAt,
      obligationAssessment,
      // Issue #410: what a later run checks before reusing this analysis
      // instead of generating it again.
      structureGeneratedAt: doc.generatedAt,
      ...(persistsSiteContext ? { siteContext: writingSiteContext } : {}),
    };
  }

  await fs.mkdir(analysesDir, { recursive: true });
  const analysisPath = path.join(
    analysesDir,
    `${timestampForFilename(analysis.generatedAt)}-${options.language}.json`,
  );
  await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2));

  await persistAnalysis(connection, {
    analysisId: analysis.analysisId,
    auditId: analysis.auditId,
    findingsProvenance: analysis.findingsProvenance,
    language: analysis.language,
    model: analysis.model,
    temperature: analysis.temperature,
    generatedAt: analysis.generatedAt,
    executiveSummary: analysis.executiveSummary,
    overallRisk: analysis.overallRisk,
    themes: analysis.themes,
    quickWins: analysis.quickWins,
    notes: analysis.notes,
    ...(analysis.siteContext !== undefined ? { siteContext: analysis.siteContext } : {}),
    ...(analysis.obligationAssessment
      ? { obligationAssessment: analysis.obligationAssessment }
      : {}),
    ...(analysis.generationMode !== undefined ? { generationMode: analysis.generationMode } : {}),
    ...(analysis.structureGeneratedAt !== undefined
      ? { structureGeneratedAt: analysis.structureGeneratedAt }
      : {}),
  });

  // Both advisory passes live inside the not-eligible path (modelPasses is
  // set exactly there): a static fallback analysis has no writer output to
  // review, and zero provider calls is the point of the gate (issue #162).
  // Each body keeps its own try/catch inside an async IIFE, so the promise
  // can never reject; the stage starts both passes without awaiting them
  // (issue #145) and callers settle the returned promises at their own
  // boundary, so the two provider round trips overlap the report stage
  // instead of serializing ahead of it.
  let advisoryPasses: readonly Promise<void>[] = [];
  if (modelPasses !== undefined) {
    const { writingInput, writingResult, generatedAt } = modelPasses;
    // Plan 033: a distinct advisory correction pass. It gets the exact writer
    // input/output, never the merged analysis, HTML, PDF, screenshots, or a
    // fetched page. The artifact is insert-only and intentionally has no path
    // back into analysis selection or report rendering.
    const correctionReviewPromise: Promise<void> = (async () => {
      try {
        const correctionReview = await analyzeCorrectionReview({
          writingInput,
          written: writingResult.output,
        });
        const correctionReviewPath = path.join(
          analysesDir,
          `${timestampForFilename(generatedAt)}-${analysisId}-correction-review.json`,
        );
        await fs.writeFile(
          correctionReviewPath,
          JSON.stringify(
            {
              auditId: manifest.auditId,
              analysisId,
              language: options.language,
              generatedAt,
              sourceAnalysisFilename: path.basename(analysisPath),
              reviewSchemaVersion: '033-v1',
              promptVersion: CORRECTION_REVIEW_PROMPT_VERSION,
              model: correctionReview.model,
              temperature: correctionReview.temperature,
              outcome: correctionReview.status,
              ...(correctionReview.status === 'ok'
                ? { proposals: correctionReview.output.proposals }
                : { skipReason: correctionReview.reason }),
            },
            null,
            2,
          ),
          { flag: 'wx' },
        );
        console.warn(
          correctionReview.status === 'ok'
            ? `odysseus analyze (correction review, language=${options.language}): ${correctionReview.output.proposals.filter((proposal) => proposal.verdict === 'propose-change').length} proposal(s) recorded`
            : `odysseus analyze (correction review, language=${options.language}): skipped`,
        );
      } catch {
        // An advisory-artifact filesystem failure is no more allowed to alter a
        // delivered analysis than a provider failure. Deliberately no reason is
        // printed: this channel is summary-only and must not expose client prose.
        console.warn(`odysseus analyze (correction review, language=${options.language}): skipped`);
      }
    })();

    // Shadow reviewer (docs/rules/llm-layer-rules.md section 12): runs after the
    // analysis is fully written and persisted, and its whole body is
    // wrapped so a reviewer failure of any kind can never block, fail, or
    // delay the analysis it reviews. One extra provider call per analysis
    // by operator decision, always on; verdicts are data for a later
    // promotion decision, not a gate.
    const reviewPromise: Promise<void> = (async () => {
      try {
        const review = await analyzeReview({ writingInput, written: writingResult.output });
        if (review.status === 'skipped') {
          console.warn(
            `odysseus analyze (review pass, language=${options.language}): skipped - ${review.reason}`,
          );
        } else {
          // One line only. The validation campaign (2026-08-29) measured the
          // medium-tier reviewer flagging every businessImpact field for
          // stating the generic commercial consequences the writing prompt
          // itself requires, so per-field console output would be a wall of
          // misleading warnings; the per-field reasons live in the review
          // file, where a human reads them with that bias in mind.
          const unsupportedCount = summarizeUnsupportedReviews(review.output).length;
          if (unsupportedCount > 0) {
            console.warn(
              `odysseus analyze (review pass, language=${options.language}): ${unsupportedCount} prose field(s) reviewed unsupported - see the -review.json file for the reasons`,
            );
          }
          const reviewPath = path.join(
            analysesDir,
            `${timestampForFilename(generatedAt)}-review.json`,
          );
          await fs.writeFile(
            reviewPath,
            JSON.stringify(
              {
                auditId: manifest.auditId,
                analysisId,
                language: options.language,
                model: review.model,
                temperature: review.temperature,
                generatedAt,
                reviews: review.output,
              },
              null,
              2,
            ),
          );
        }
      } catch (error) {
        console.warn(
          `odysseus analyze (review pass, language=${options.language}): skipped - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();

    // Same start order as before the deferral (correction review first), but
    // the two starts now overlap: the reviewer's provider call no longer
    // waits for the correction pass to finish. Neither pass reads the
    // other's output and their artifact names never collide, so the
    // overlap changes only when the stage waits, not what the passes do.
    advisoryPasses = [correctionReviewPromise, reviewPromise];
  }

  return {
    analysis,
    analysisPath,
    structurePath,
    structureReused,
    writingReused: false,
    unreferencedFindingCount,
    usedFallbackContext,
    advisoryPasses,
  };
}
