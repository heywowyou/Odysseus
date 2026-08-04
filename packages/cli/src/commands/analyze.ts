import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
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
import { connectToMongo, disconnectFromMongo, persistAnalysis } from '@odysseus/store';

function parseLanguage(value: string): ReportLanguage {
  if (value !== 'fr' && value !== 'en') {
    throw new InvalidArgumentError(`must be "fr" or "en", got "${value}"`);
  }
  return value;
}

async function readSiteContext(
  contextPath: string | undefined,
): Promise<{ siteContext: SiteContextInput; usedFallback: boolean }> {
  if (!contextPath) {
    return { siteContext: buildFallbackSiteContext(), usedFallback: true };
  }
  const raw = await fs.readFile(path.resolve(contextPath), 'utf-8');
  const siteContext = JSON.parse(raw) as SiteContextInput;
  return { siteContext, usedFallback: false };
}

function timestampForFilename(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/** Newest existing analyses/<timestamp>-structure.json for this audit,
 *  by lexicographic sort - ISO-8601 filenames sort chronologically, same
 *  convention report.ts's findLatestAnalysisFile already relies on. */
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
 *  priorityRank/quickWins/overallRisk for this audit, shared across
 *  every --language invocation. Reused by default (newest existing
 *  *-structure.json); --regenerate-structure forces a fresh run.
 *
 *  A reused structure file is defensively re-checked against the
 *  current filtered findings before being trusted: a stale structure
 *  file (written before findings.json was re-normalized) must fail
 *  loudly with a clear "--regenerate-structure" pointer, never silently
 *  regenerate or silently proceed with a finding that may no longer
 *  exist. See docs/llm-layer-rules.md sections 2 and 9. */
async function loadOrGenerateStructure(
  analysesDir: string,
  auditId: string,
  filtered: readonly Finding[],
  siteContext: SiteContextInput,
  usedFallback: boolean,
  regenerate: boolean,
): Promise<{ structureDoc: StructureDocument; reused: boolean; path: string }> {
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

      return { structureDoc, reused: true, path: existingPath };
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

  if (structureResult.unreferencedFindingCount > 0) {
    console.log(
      `  Warning: ${structureResult.unreferencedFindingCount} finding(s) not referenced by any theme`,
    );
  }

  return { structureDoc, reused: false, path: outputPath };
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze <artifacts-dir>')
    .description(
      "Group, prioritize, and explain a completed audit's findings via the Claude API. " +
        'Reads findings.json and manifest.json only; never re-scans the client site.',
    )
    .requiredOption('--language <fr|en>', 'Report language: fr or en', parseLanguage)
    .option('--context <file>', 'Path to a JSON file with site context')
    .option(
      '--regenerate-structure',
      'Force a fresh structure pass (grouping and prioritization) even if one already exists for this audit',
    )
    .action(
      async (
        artifactsDir: string,
        opts: { language: ReportLanguage; context?: string; regenerateStructure?: boolean },
      ) => {
        const resolvedDir = path.resolve(artifactsDir);
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

        try {
          const manifestPath = path.join(resolvedDir, 'manifest.json');
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AuditManifest;

          const findingsPath = path.join(resolvedDir, 'findings.json');
          const allFindings = JSON.parse(await fs.readFile(findingsPath, 'utf-8')) as Finding[];

          const { siteContext, usedFallback } = await readSiteContext(opts.context);
          const filtered = filterFindingsForLlm(allFindings);

          const analysesDir = path.join(resolvedDir, 'analyses');
          const { structureDoc, reused, path: structurePath } = await loadOrGenerateStructure(
            analysesDir,
            manifest.auditId,
            filtered,
            siteContext,
            usedFallback,
            Boolean(opts.regenerateStructure),
          );
          console.log(
            `  Structure: ${reused ? 'reused' : 'generated'} (${path.basename(structurePath)}, ${structureDoc.themes.length} themes)`,
          );

          const writingInput = buildWritingInput(structureDoc.themes, filtered, siteContext, opts.language);
          const generatedAt = new Date();
          const writingResult = await analyzeWriting(
            writingInput,
            structureDoc.themes.map((t) => t.themeKey),
            usedFallback,
          );
          const merged = mergeAnalysisPasses(structureDoc, writingResult.output);
          const unreferencedFindingCount = findUnreferencedStructureFindingIds(structureDoc, filtered).length;

          const outputPath = path.join(
            analysesDir,
            `${timestampForFilename(generatedAt)}-${opts.language}.json`,
          );
          await fs.writeFile(
            outputPath,
            JSON.stringify(
              {
                auditId: manifest.auditId,
                language: opts.language,
                model: writingResult.model,
                effort: writingResult.effort,
                generatedAt: generatedAt.toISOString(),
                ...merged,
              },
              null,
              2,
            ),
          );

          mongoConnection = await connectToMongo();
          await persistAnalysis(
            mongoConnection,
            manifest.auditId,
            opts.language,
            writingResult.model,
            writingResult.effort,
            generatedAt,
            merged,
          );

          console.log(`Analysis of ${manifest.auditId} complete (${opts.language})`);
          console.log(`  Overall risk: ${merged.overallRisk}`);
          console.log(`  Themes: ${merged.themes.length}`);
          console.log(`  Quick wins: ${merged.quickWins.length}`);
          if (unreferencedFindingCount > 0) {
            console.log(`  Warning: ${unreferencedFindingCount} finding(s) not referenced by any theme`);
          }
          if (usedFallback) {
            console.log('  Note: no --context file was provided; minimal site context was used.');
          }
          console.log(`  Written: ${outputPath}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus analyze: failed to analyze ${resolvedDir}\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );
}
