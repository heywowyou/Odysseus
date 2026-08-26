/**
 * Groups, prioritizes, and writes a completed audit's findings via the
 * Mistral API, exactly as the `odysseus analyze` CLI command does today -
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
import path from 'node:path';
import type { Connection } from 'mongoose';
import type {
  AuditManifest,
  Finding,
  ObligationAssessment,
  ReportLanguage,
  SiteSignalOverrides,
} from '@odysseus/core';
import {
  analyzeStructure,
  analyzeWriting,
  buildFallbackSiteContext,
  buildStructureInput,
  buildWritingInput,
  computeDominantPerformanceMetric,
  computeSiteStats,
  filterFindingsForLlm,
  findUnreferencedStructureFindingIds,
  mergeAnalysisPasses,
  parseStructureDocument,
  partitionFindings,
  type SiteContextInput,
  type StructureDocument,
} from '@odysseus/llm';
import { persistAnalysis } from '@odysseus/store';
import type { StoredAnalysis } from '@odysseus/report';
import { runObligationStage } from './obligation-stage.js';

export interface RunAnalysisStageOptions {
  language: ReportLanguage;
  /** Omitted means "use the fallback context" - the intake questionnaire
   *  this would otherwise come from doesn't exist yet (see
   *  docs/llm-layer-rules.md section 4). */
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
}

export interface AnalysisStageResult {
  analysis: StoredAnalysis;
  analysisPath: string;
  structurePath: string;
  structureReused: boolean;
  unreferencedFindingCount: number;
  usedFallbackContext: boolean;
}

function timestampForFilename(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
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
 *  finding that may no longer exist. See docs/llm-layer-rules.md
 *  sections 2 and 9. */
async function loadOrGenerateStructure(
  analysesDir: string,
  auditId: string,
  forModel: readonly Finding[],
  siteContext: SiteContextInput,
  usedFallback: boolean,
  regenerate: boolean,
  manifest: AuditManifest,
): Promise<{ structureDoc: StructureDocument; reused: boolean; structurePath: string }> {
  if (!regenerate) {
    const existingPath = await findLatestStructureFile(analysesDir);
    if (existingPath) {
      const raw = JSON.parse(await fs.readFile(existingPath, 'utf-8'));
      const structureDoc = parseStructureDocument(raw);

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
  const usedFallbackContext = options.siteContext === undefined;
  const siteContext = options.siteContext ?? buildFallbackSiteContext();
  // Diversion (docs/report-v2-refactor.md 4.1) runs after the severity
  // floor, on the same set: forModel must be exactly what reaches the
  // structure and writing passes and their guards, never allFindings.
  const severityFiltered = filterFindingsForLlm(allFindings);
  const { forModel } = partitionFindings(severityFiltered, manifest);
  const analysesDir = path.join(auditDir, 'analyses');

  const { structureDoc, reused, structurePath } = await loadOrGenerateStructure(
    analysesDir,
    manifest.auditId,
    forModel,
    siteContext,
    usedFallbackContext,
    options.regenerateStructure ?? false,
    manifest,
  );

  // siteStats is computed from allFindings (unfiltered), not forModel, so
  // the executive summary cites the audit's true scope rather than only
  // what the model was shown. See docs/report-v2-refactor.md B10.
  const siteStats = computeSiteStats(allFindings, manifest);
  const dominantPerformanceMetric = computeDominantPerformanceMetric(manifest);
  const writingInput = buildWritingInput(
    structureDoc.themes,
    forModel,
    siteContext,
    options.language,
    siteStats,
    dominantPerformanceMetric,
  );
  const generatedAt = new Date();
  const writingResult = await analyzeWriting(
    writingInput,
    structureDoc.themes.map((t) => t.themeKey),
    usedFallbackContext,
  );
  const merged = mergeAnalysisPasses(
    structureDoc,
    writingResult.output,
    forModel,
    options.language,
  );
  const unreferencedFindingCount = findUnreferencedStructureFindingIds(
    structureDoc,
    forModel,
  ).length;

  // Not present in the queued pipeline (run-full-audit-job.ts passes it
  // through, computed once by runAuditStage), but the standalone
  // `odysseus analyze <dir>` CLI path calls this stage directly - computed
  // lazily here so that path stays independently runnable. The Sirene
  // cache absorbs the cost of a repeat lookup for the same SIREN.
  // manualSiren/siteSignalOverrides let that standalone path reproduce
  // the same manual facts `odysseus audit` was given, instead of always
  // falling back to extracted-only facts.
  const obligationAssessment =
    options.obligationAssessment ??
    (await runObligationStage(
      manifest,
      connection,
      options.manualSiren,
      options.siteSignalOverrides,
    ));

  await fs.mkdir(analysesDir, { recursive: true });
  const analysisPath = path.join(
    analysesDir,
    `${timestampForFilename(generatedAt)}-${options.language}.json`,
  );
  await fs.writeFile(
    analysisPath,
    JSON.stringify(
      {
        auditId: manifest.auditId,
        language: options.language,
        model: writingResult.model,
        temperature: writingResult.temperature,
        generatedAt: generatedAt.toISOString(),
        ...merged,
        obligationAssessment,
      },
      null,
      2,
    ),
  );

  await persistAnalysis(
    connection,
    manifest.auditId,
    options.language,
    writingResult.model,
    writingResult.temperature,
    generatedAt,
    merged,
    obligationAssessment,
  );

  return {
    analysis: {
      ...merged,
      auditId: manifest.auditId,
      language: options.language,
      model: writingResult.model,
      temperature: writingResult.temperature,
      generatedAt,
      obligationAssessment,
    },
    analysisPath,
    structurePath,
    structureReused: reused,
    unreferencedFindingCount,
    usedFallbackContext,
  };
}
