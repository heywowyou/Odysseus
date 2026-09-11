/**
 * Dev measurement tool for plan 033 step 6, not library code: re-runs the
 * advisory correction-review pass over explicitly named stored analyses and
 * prints a per-field proposal register plus campaign totals, so an operator
 * can adjudicate every propose-change and unsure verdict before any
 * promotion decision. Read-only by construction: nothing is persisted, no
 * analysis, report, database, or selected-pair state is written, and no
 * production call site reads this script. It never rejects anything and
 * always exits 0 once arguments parse: the promotion decision is made by a
 * human reading this output, per the same "measure before promoting"
 * doctrine as trade-off 55.
 *
 * Unlike lint-stored-analyses.ts there is NO default directory and no tree
 * walk: the operator names every analysis file, and plan 033 step 6 requires
 * current, audit-specific operator authorization for the named stored data
 * before this calls the provider at all. Each named file gets exactly ONE
 * analyzeCorrectionReview call (no retry, same as production) against a
 * WritingInput rebuilt to mirror packages/interface's analysis stage
 * exactly, and a WritingPassOutput projected verbatim from the stored
 * analysis. A file whose input cannot be rebuilt faithfully is skipped with
 * a printed reason, never guessed.
 *
 * Run from the workspace root:
 *   set -a; . ./.env; set +a
 *   pnpm exec tsx packages/llm/src/measure-correction-review.ts \
 *     --language <fr|en> <analyses/<ts>-<lang>.json> [...]
 */
import { stat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  AuditManifest,
  Finding,
  FindingsProvenance,
  ObligationAssessment,
  ReportLanguage,
} from '@odysseus/core';
import { assertFindingsProvenance, buildFindingsProvenance } from '@odysseus/core';
import {
  analyzeCorrectionReview,
  type CorrectionReviewOutcome,
} from './analyze-correction-review.js';
import {
  buildFallbackSiteContext,
  buildWritingInput,
  computeSiteStats,
  filterFindingsForLlm,
} from './build-input.js';
import type { CorrectionCheck, CorrectionProposal } from './correction-review-schema.js';
import { computeDominantPerformanceMetric } from './dominant-metric.js';
import { partitionFindings } from './diversion.js';
import { parseStructureDocument, type StructureDocument } from './structure-schema.js';
import { deriveTransactionalFlowStatus } from './transactional-flow-guard.js';
import {
  writingPassOutputSchema,
  type WritingInput,
  type WritingPassOutput,
  type WritingSiteContext,
} from './writing-schema.js';

const ANALYSIS_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d-]+Z-(fr|en)\.json$/;

/** The stored analysis fields this tool reads. Structural: the prose is
 *  re-validated by writingPassOutputSchema during projection, and every
 *  other read is wrapped by the per-file skip handling in main(). */
export interface StoredAnalysisArtifact {
  analysisId: string;
  auditId: string;
  findingsProvenance: unknown;
  language: string;
  generatedAt: string;
  executiveSummary: string;
  notes: string;
  themes: Array<{
    title: string;
    businessImpact: string;
    recommendedActions: string[];
  }>;
  siteContext?: unknown;
  obligationAssessment?: unknown;
}

export interface MeasureArgs {
  language: ReportLanguage;
  paths: string[];
}

export interface ReconstructedInput {
  writingInput: WritingInput;
  written: WritingPassOutput;
  structureFilename: string;
}

/** One named analysis file's campaign result. A file-level skip means no
 *  provider call happened; a pass-level skip still consumed the one call. */
export interface CampaignRun {
  file: string;
  relativeFile: string;
  language: ReportLanguage;
  stage: 'file-skip' | 'measured';
  fileSkipReason?: string;
  reconstructed?: ReconstructedInput;
  outcome?: CorrectionReviewOutcome;
  wallMs?: number;
}

export interface CampaignTotals {
  named: number;
  fileSkips: number;
  providerCalls: number;
  passOk: number;
  passSkipped: number;
  fieldsReviewed: number;
  keep: number;
  proposeChange: number;
  unsure: number;
  byCheck: Record<CorrectionCheck, number>;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMinMs: number | null;
  latencyMaxMs: number | null;
}

const CORRECTION_CHECKS: CorrectionCheck[] = [
  'unsupported-specific-claim',
  'unhedged-causality',
  'language-quality',
  'repetition',
  'translation-parity',
];

/** Usage errors throw; per-file problems skip with a reason and exit 0,
 *  matching the measurement-tool precedent. */
export function parseMeasureArgs(argv: readonly string[]): MeasureArgs {
  let language: ReportLanguage | undefined;
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--language') {
      if (language !== undefined) throw new Error('--language given more than once');
      const value = argv[++i];
      if (value !== 'fr' && value !== 'en') {
        throw new Error(`--language must be fr or en, got "${value ?? ''}"`);
      }
      language = value;
    } else {
      paths.push(path.resolve(argv[i]!));
    }
  }
  if (language === undefined) {
    throw new Error('usage: --language <fr|en> is required');
  }
  if (paths.length === 0) {
    throw new Error(
      'usage: name at least one stored analysis file; this tool never walks a directory tree',
    );
  }
  return { language, paths };
}

/** Projects the stored analysis back to the exact WritingPassOutput the
 *  writer produced: mergeAnalysisPasses copies executiveSummary, notes,
 *  title, businessImpact, and recommendedActions verbatim, and maps the
 *  structure themes in order, so the themeKey comes from the same index of
 *  the structure document. Throws on a theme-count mismatch, which is a
 *  faithfulness failure the caller must surface as a skip. */
export function projectWrittenFromStoredAnalysis(
  stored: StoredAnalysisArtifact,
  structureDoc: StructureDocument,
): WritingPassOutput {
  if (stored.themes.length !== structureDoc.themes.length) {
    throw new Error(
      `stored analysis has ${stored.themes.length} themes but structure document has ${structureDoc.themes.length}; ` +
        'the structure grouping changed after this analysis was written',
    );
  }
  return writingPassOutputSchema.parse({
    executiveSummary: stored.executiveSummary,
    notes: stored.notes,
    themes: stored.themes.map((theme, index) => ({
      themeKey: structureDoc.themes[index]!.themeKey,
      title: theme.title,
      businessImpact: theme.businessImpact,
      recommendedActions: theme.recommendedActions,
    })),
  });
}

/** Returns a skip reason when the stored artifacts cannot faithfully
 *  reproduce the input the correction pass would have seen at analysis
 *  time, or undefined when reconstruction may proceed. Every check here is
 *  one the analysis stage itself enforces (provenance assertions, latest
 *  structure reuse), so a pass means the rebuild is exact, not approximate. */
export function faithfulnessIssue(args: {
  structureFilename: string | undefined;
  manifest: AuditManifest;
  allFindings: readonly Finding[];
  structureDoc: StructureDocument | undefined;
  stored: StoredAnalysisArtifact;
}): string | undefined {
  const { structureFilename, manifest, allFindings, structureDoc, stored } = args;
  if (!structureFilename || !structureDoc) {
    return 'no stored structure document for this audit';
  }
  // The analysis stage reuses the LATEST structure file at run time, so a
  // structure generated after this analysis cannot be proven to be the one
  // it used. ISO-8601 strings compare chronologically.
  if (structureDoc.generatedAt > stored.generatedAt) {
    return `latest structure document (${structureFilename}) was generated after this analysis`;
  }
  if (manifest.auditId !== stored.auditId) {
    return `auditId mismatch: manifest ${manifest.auditId}, analysis ${stored.auditId}`;
  }
  if (structureDoc.auditId !== stored.auditId) {
    return `auditId mismatch: structure ${structureDoc.auditId}, analysis ${stored.auditId}`;
  }
  try {
    const provenance = buildFindingsProvenance(allFindings);
    assertFindingsProvenance(manifest.findingsProvenance, provenance, 'manifest');
    assertFindingsProvenance(
      stored.findingsProvenance as FindingsProvenance | undefined,
      provenance,
      'stored analysis',
    );
    assertFindingsProvenance(structureDoc.findingsProvenance, provenance, 'structure document');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

/** Mirrors analysis-stage's writing input construction line for line:
 *  severity floor, diversion partition, unfiltered site stats, dominant
 *  metric, transactional-flow status from the stored obligation
 *  assessment, and the persisted site context when the analysis kept one
 *  (fallback context is deterministic, so its absence is reproducible). */
export function assembleWritingInput(args: {
  manifest: AuditManifest;
  allFindings: readonly Finding[];
  structureDoc: StructureDocument;
  stored: StoredAnalysisArtifact;
  language: ReportLanguage;
}): WritingInput {
  const { manifest, allFindings, structureDoc, stored, language } = args;
  const severityFiltered = filterFindingsForLlm(allFindings);
  const { forModel } = partitionFindings(severityFiltered, manifest);
  const siteStats = computeSiteStats(allFindings, manifest);
  const dominantPerformanceMetric = computeDominantPerformanceMetric(manifest);
  const transactionalFlowStatus =
    stored.obligationAssessment === undefined
      ? 'unknown'
      : deriveTransactionalFlowStatus(stored.obligationAssessment as ObligationAssessment);
  return buildWritingInput(
    structureDoc.themes,
    forModel,
    (stored.siteContext ?? buildFallbackSiteContext()) as WritingSiteContext,
    language,
    siteStats,
    dominantPerformanceMetric,
    transactionalFlowStatus,
    manifest.auditId,
  );
}

/** Resolves a correlated field address to the current prose, for the
 *  operator's side-by-side adjudication. The correlation guard guarantees
 *  every address exists; the fallback text is unreachable in practice. */
export function currentProseText(written: WritingPassOutput, field: string): string {
  if (field === 'executiveSummary') return written.executiveSummary;
  if (field === 'notes') return written.notes;
  const match = /^themes\(([^)]+)\)\.(businessImpact|recommendedActions\[(\d+)\])$/.exec(field);
  const theme = match ? written.themes.find((entry) => entry.themeKey === match[1]) : undefined;
  if (!match || !theme) return '(field address did not resolve)';
  if (match[2] === 'businessImpact') return theme.businessImpact;
  const action = theme.recommendedActions[Number(match[3])];
  return action ?? '(field address did not resolve)';
}

export function aggregateRuns(runs: readonly CampaignRun[]): CampaignTotals {
  const totals: CampaignTotals = {
    named: runs.length,
    fileSkips: 0,
    providerCalls: 0,
    passOk: 0,
    passSkipped: 0,
    fieldsReviewed: 0,
    keep: 0,
    proposeChange: 0,
    unsure: 0,
    byCheck: Object.fromEntries(CORRECTION_CHECKS.map((check) => [check, 0])) as Record<
      CorrectionCheck,
      number
    >,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMinMs: null,
    latencyMaxMs: null,
  };
  for (const run of runs) {
    if (run.stage === 'file-skip') {
      totals.fileSkips += 1;
      continue;
    }
    totals.providerCalls += 1;
    if (run.wallMs !== undefined) {
      totals.latencyMinMs =
        totals.latencyMinMs === null ? run.wallMs : Math.min(totals.latencyMinMs, run.wallMs);
      totals.latencyMaxMs =
        totals.latencyMaxMs === null ? run.wallMs : Math.max(totals.latencyMaxMs, run.wallMs);
    }
    if (!run.outcome) continue;
    if (run.outcome.status === 'skipped') {
      totals.passSkipped += 1;
      continue;
    }
    totals.passOk += 1;
    if (run.outcome.usage) {
      totals.promptTokens += run.outcome.usage.promptTokens;
      totals.completionTokens += run.outcome.usage.completionTokens;
      totals.totalTokens += run.outcome.usage.totalTokens;
    }
    for (const proposal of run.outcome.output.proposals) {
      totals.fieldsReviewed += 1;
      if (proposal.verdict === 'keep') totals.keep += 1;
      if (proposal.verdict === 'propose-change') totals.proposeChange += 1;
      if (proposal.verdict === 'unsure') totals.unsure += 1;
      if (proposal.verdict !== 'keep') {
        for (const check of proposal.checks)
          totals.byCheck[check] = (totals.byCheck[check] ?? 0) + 1;
      }
    }
  }
  return totals;
}

/** Non-keep proposals in eligible-field order, each with its stable
 *  adjudication ID (`<analysis filename>#<field address>`). */
export function registerProposals(
  run: CampaignRun,
): Array<{ id: string; proposal: CorrectionProposal; current: string }> {
  if (run.stage !== 'measured' || !run.reconstructed || !run.outcome) return [];
  if (run.outcome.status !== 'ok') return [];
  const basename = path.basename(run.file);
  return run.outcome.output.proposals
    .filter((proposal) => proposal.verdict !== 'keep')
    .map((proposal) => ({
      id: `${basename}#${proposal.field}`,
      proposal,
      current: currentProseText(run.reconstructed!.written, proposal.field),
    }));
}

async function loadRun(args: {
  analysisPath: string;
  language: ReportLanguage;
}): Promise<CampaignRun> {
  const { analysisPath, language } = args;
  const relativeFile = path.relative(process.cwd(), analysisPath);
  const base: CampaignRun = { file: analysisPath, relativeFile, language, stage: 'file-skip' };

  const filename = path.basename(analysisPath);
  const match = ANALYSIS_FILENAME_PATTERN.exec(filename);
  if (!match || match[1] !== language) {
    return { ...base, fileSkipReason: `filename does not denote a ${language} analysis` };
  }
  if (path.basename(path.dirname(analysisPath)) !== 'analyses') {
    return { ...base, fileSkipReason: 'not directly inside an analyses/ directory' };
  }

  try {
    const auditDir = path.dirname(path.dirname(analysisPath));
    const analysesDir = path.join(auditDir, 'analyses');
    const manifest = JSON.parse(
      await readFile(path.join(auditDir, 'manifest.json'), 'utf8'),
    ) as AuditManifest;
    const allFindings = JSON.parse(
      await readFile(path.join(auditDir, 'findings.json'), 'utf8'),
    ) as Finding[];
    const stored = JSON.parse(await readFile(analysisPath, 'utf8')) as StoredAnalysisArtifact;
    const entries = await readdir(analysesDir);
    const structureFilename =
      entries
        .filter((name) => name.endsWith('-structure.json'))
        .sort()
        .at(-1) ?? undefined;
    const structureDoc = structureFilename
      ? parseStructureDocument(
          JSON.parse(await readFile(path.join(analysesDir, structureFilename), 'utf8')),
        )
      : undefined;

    const issue = faithfulnessIssue({
      structureFilename,
      manifest,
      allFindings,
      structureDoc,
      stored,
    });
    if (issue) return { ...base, fileSkipReason: issue };

    const written = projectWrittenFromStoredAnalysis(stored, structureDoc!);
    const writingInput = assembleWritingInput({
      manifest,
      allFindings,
      structureDoc: structureDoc!,
      stored,
      language,
    });

    const startedAt = Date.now();
    const outcome = await analyzeCorrectionReview({ writingInput, written });
    return {
      ...base,
      stage: 'measured',
      reconstructed: { writingInput, written, structureFilename: structureFilename! },
      outcome,
      wallMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...base,
      fileSkipReason: `could not reconstruct the writer input: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function formatRun(run: CampaignRun): string {
  if (run.stage === 'file-skip') {
    return `${run.relativeFile}: skipped (${run.fileSkipReason})`;
  }
  const lines: string[] = [];
  if (run.outcome?.status === 'skipped') {
    lines.push(`${run.relativeFile}: skipped by the pass (${run.outcome.reason})`);
  } else if (run.outcome?.status === 'ok' && run.reconstructed) {
    const usage = run.outcome.usage;
    const usageText = usage
      ? `tokens: ${usage.totalTokens} total = ${usage.promptTokens} prompt + ${usage.completionTokens} completion`
      : 'tokens: not reported';
    const proposals = registerProposals(run);
    lines.push(`${run.relativeFile}: ${proposals.length} proposal(s) to adjudicate`);
    for (const entry of proposals) {
      lines.push(
        `  id=${entry.id} verdict=${entry.proposal.verdict} checks=${entry.proposal.checks.join(',')}`,
      );
      lines.push(`    reason: ${entry.proposal.reason}`);
      lines.push(`    current: ${entry.current}`);
      if (entry.proposal.verdict === 'propose-change') {
        lines.push(`    proposed: ${entry.proposal.replacement}`);
      }
    }
    lines.push(`  (${run.wallMs} ms, ${usageText})`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { language, paths } = parseMeasureArgs(process.argv.slice(2));

  const runs: CampaignRun[] = [];
  for (const analysisPath of paths) {
    try {
      if (!(await stat(analysisPath)).isFile()) {
        throw new Error('not a regular file');
      }
    } catch (error) {
      runs.push({
        file: analysisPath,
        relativeFile: path.relative(process.cwd(), analysisPath),
        language,
        stage: 'file-skip',
        fileSkipReason: `not a readable file (${error instanceof Error ? error.message : String(error)})`,
      });
      continue;
    }
    runs.push(await loadRun({ analysisPath, language }));
  }

  const totals = aggregateRuns(runs);
  console.log(
    `Correction-review measurement, language ${language}: ${totals.named} named file(s), ` +
      `${totals.providerCalls} provider call(s), nothing persisted.`,
  );
  console.log('');
  for (const run of runs) {
    const formatted = formatRun(run);
    if (formatted.length > 0) console.log(formatted);
  }
  console.log('');
  console.log(
    `Pass outcomes: ${totals.passOk} ok, ${totals.passSkipped} skipped by the pass, ` +
      `${totals.fileSkips} file-level skip(s).`,
  );
  console.log(
    `Fields reviewed: ${totals.fieldsReviewed}: ${totals.keep} keep, ` +
      `${totals.proposeChange} propose-change, ${totals.unsure} unsure.`,
  );
  console.log(
    `Non-keep proposals by check: ${CORRECTION_CHECKS.map(
      (check) => `${check} ${totals.byCheck[check]}`,
    ).join(', ')}.`,
  );
  const usage = `tokens: ${totals.totalTokens} total = ${totals.promptTokens} prompt + ${totals.completionTokens} completion`;
  const latency =
    totals.latencyMinMs === null
      ? 'latency: no calls'
      : `latency: ${totals.latencyMinMs}-${totals.latencyMaxMs} ms per call`;
  console.log(usage);
  console.log(latency);
  console.log(
    'Done. This output measures; it does not decide. Adjudicate every propose-change and unsure id, ' +
      'then record the counts, the cost range, and the operator call in docs/rules/llm-layer-rules.md ' +
      'section 12a and docs/decisions/trade-offs.md entry 55.',
  );
}

/** Tests import this module for its pure helpers; only a direct tsx run
 *  executes main. */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
