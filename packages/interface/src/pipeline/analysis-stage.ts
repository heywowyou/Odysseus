/**
 * Groups, prioritizes, and writes a completed audit's findings via the
 * Claude API, exactly as the `odysseus analyze` CLI command does today -
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
import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import {
  analyzeStructure,
  analyzeWriting,
  buildFallbackSiteContext,
  buildStructureInput,
  buildWritingInput,
  filterFindingsForLlm,
  findUnreferencedStructureFindingIds,
  mergeAnalysisPasses,
  parseStructureDocument,
  type SiteContextInput,
  type StructureDocument,
} from '@odysseus/llm';
import { persistAnalysis } from '@odysseus/store';
import type { StoredAnalysis } from '@odysseus/report';

export interface RunAnalysisStageOptions {
  language: ReportLanguage;
  /** Omitted means "use the fallback context" - the intake questionnaire
   *  this would otherwise come from doesn't exist yet (see
   *  docs/llm-layer-rules.md section 4). */
  siteContext?: SiteContextInput;
  regenerateStructure?: boolean;
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
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
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
  filtered: readonly Finding[],
  siteContext: SiteContextInput,
  usedFallback: boolean,
  regenerate: boolean,
): Promise<{ structureDoc: StructureDocument; reused: boolean; structurePath: string }> {
  if (!regenerate) {
    const existingPath = await findLatestStructureFile(analysesDir);
    if (existingPath) {
      const raw = JSON.parse(await fs.readFile(existingPath, 'utf-8'));
      const structureDoc = parseStructureDocument(raw);

      const knownIds = new Set(filtered.map((f) => f.findingId));
      const referenced = new Set<string>();
      for (const theme of structureDoc.themes) for (const id of theme.findingIds) referenced.add(id);
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

  const structureInput = buildStructureInput(filtered, siteContext);
  const structureResult = await analyzeStructure(structureInput, filtered, usedFallback);

  const generatedAt = new Date();
  const structureDoc: StructureDocument = {
    auditId,
    themes: structureResult.themes,
    quickWins: structureResult.quickWins,
    overallRisk: structureResult.overallRisk,
    model: structureResult.model,
    effort: structureResult.effort,
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
  const filtered = filterFindingsForLlm(allFindings);
  const analysesDir = path.join(auditDir, 'analyses');

  const { structureDoc, reused, structurePath } = await loadOrGenerateStructure(
    analysesDir,
    manifest.auditId,
    filtered,
    siteContext,
    usedFallbackContext,
    options.regenerateStructure ?? false,
  );

  const writingInput = buildWritingInput(structureDoc.themes, filtered, siteContext, options.language);
  const generatedAt = new Date();
  const writingResult = await analyzeWriting(
    writingInput,
    structureDoc.themes.map((t) => t.themeKey),
    usedFallbackContext,
  );
  const merged = mergeAnalysisPasses(structureDoc, writingResult.output);
  const unreferencedFindingCount = findUnreferencedStructureFindingIds(structureDoc, filtered).length;

  await fs.mkdir(analysesDir, { recursive: true });
  const analysisPath = path.join(analysesDir, `${timestampForFilename(generatedAt)}-${options.language}.json`);
  await fs.writeFile(
    analysisPath,
    JSON.stringify(
      {
        auditId: manifest.auditId,
        language: options.language,
        model: writingResult.model,
        effort: writingResult.effort,
        generatedAt: generatedAt.toISOString(),
        ...merged,
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
    writingResult.effort,
    generatedAt,
    merged,
  );

  return {
    analysis: {
      ...merged,
      auditId: manifest.auditId,
      language: options.language,
      model: writingResult.model,
      effort: writingResult.effort,
      generatedAt,
    },
    analysisPath,
    structurePath,
    structureReused: reused,
    unreferencedFindingCount,
    usedFallbackContext,
  };
}
