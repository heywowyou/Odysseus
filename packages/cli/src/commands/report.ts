import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import type {
  AuditManifest,
  Finding,
  FindingsProvenance,
  LlmOutput,
  ReportLanguage,
} from '@odysseus/core';
import { pickLegacyLatestPair } from '@odysseus/core';
import type { StoredAnalysis, VerifiedStoredAnalysis } from '@odysseus/report';
import { runAllReportsStage, runReportStage } from '@odysseus/interface';
import {
  connectToMongo,
  disconnectFromMongo,
  resolveSelectedAnalysisPairForAudit,
} from '@odysseus/store';

function parseLanguage(value: string): ReportLanguage {
  if (value !== 'fr' && value !== 'en') {
    throw new InvalidArgumentError(`must be "fr" or "en", got "${value}"`);
  }
  return value;
}

/** analyses/<timestamp>-<lang>.json filenames sort lexicographically in
 *  chronological order (same trick as audit directory names), so the
 *  last match is the latest analysis for the requested language. */
async function findLatestAnalysisFile(
  analysesDir: string,
  language: ReportLanguage,
): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await fs.readdir(analysesDir);
  } catch {
    return undefined;
  }
  const matching = entries.filter((name) => name.endsWith(`-${language}.json`)).sort();
  const latest = matching.at(-1);
  return latest ? path.join(analysesDir, latest) : undefined;
}

async function readAnalysis(analysisPath: string): Promise<StoredAnalysis> {
  const raw = await fs.readFile(analysisPath, 'utf-8');
  const parsed = JSON.parse(raw) as LlmOutput & {
    analysisId: string;
    auditId: string;
    findingsProvenance: FindingsProvenance;
    language: ReportLanguage;
    model: string;
    temperature: number;
    generatedAt: string;
  };
  return { ...parsed, generatedAt: new Date(parsed.generatedAt) };
}

async function loadManifestAndFindings(
  resolvedDir: string,
): Promise<{ manifest: AuditManifest; findings: Finding[] }> {
  const manifestPath = path.join(resolvedDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AuditManifest;

  const findingsPath = path.join(resolvedDir, 'findings.json');
  const findings = JSON.parse(await fs.readFile(findingsPath, 'utf-8')) as Finding[];

  return { manifest, findings };
}

/** Every complete per-language analysis document on disk for this audit,
 *  for the offline legacy fallback of `--all`. */
async function loadAllDiskAnalyses(resolvedDir: string): Promise<StoredAnalysis[]> {
  const analysesDir = path.join(resolvedDir, 'analyses');
  let entries: string[];
  try {
    entries = await fs.readdir(analysesDir);
  } catch {
    return [];
  }
  const documents: StoredAnalysis[] = [];
  for (const name of entries
    .filter((entry) => entry.endsWith('-fr.json') || entry.endsWith('-en.json'))
    .sort()) {
    documents.push(await readAnalysis(path.join(analysesDir, name)));
  }
  return documents;
}

function logPageCountWarning(warning: { pageCount: number; threshold: number }): void {
  console.warn(
    `  Warning: ${warning.pageCount} pages, above the ${warning.threshold}-page guideline. ` +
      'The report was generated and persisted normally.',
  );
}

export function registerReportCommand(program: Command): void {
  program
    .command('report <artifacts-dir>')
    .description(
      'Render a stored analysis and the full findings appendix into a bilingual PDF. ' +
        'Reads manifest.json, findings.json, and an analyses/*.json file; never re-scans the client site.',
    )
    .option('--language <fr|en>', 'Report language: fr or en', parseLanguage)
    .option(
      '--analysis <file>',
      'Path to a specific analysis file; defaults to the latest for --language',
    )
    .option(
      '--all',
      "Generate both language reports (fr and en) from each language's existing latest analysis in one " +
        'invocation, instead of one report per invocation. Requires both fr and en analyses to already ' +
        'exist; incompatible with --language and --analysis.',
    )
    .action(
      async (
        artifactsDir: string,
        opts: { language?: ReportLanguage; analysis?: string; all?: boolean },
      ) => {
        const resolvedDir = path.resolve(artifactsDir);
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

        try {
          if (opts.all) {
            if (opts.language || opts.analysis) {
              throw new Error('--all cannot be combined with --language or --analysis');
            }

            const { manifest, findings } = await loadManifestAndFindings(resolvedDir);

            mongoConnection = await connectToMongo();
            // Plan 019: the paid pair is the audit's selected pair, or the
            // legacy latest complete pair through the one centralized
            // fallback (core's pickLegacyLatestPair over the on-disk
            // documents when the database holds no analyses for it).
            const resolution = await resolveSelectedAnalysisPairForAudit(
              mongoConnection,
              manifest.auditId,
            );
            let fr: StoredAnalysis;
            let en: StoredAnalysis;
            if (resolution.kind !== 'none' && resolution.en !== undefined) {
              fr = { ...resolution.fr };
              en = { ...resolution.en };
            } else {
              // Legacy artifacts without analysisId or provenance are not
              // eligible for the paid pair at all.
              const diskAnalyses = (await loadAllDiskAnalyses(resolvedDir)).filter(
                (analysis): analysis is VerifiedStoredAnalysis =>
                  analysis.analysisId !== undefined && analysis.findingsProvenance !== undefined,
              );
              const diskPair = pickLegacyLatestPair(diskAnalyses);
              if (!diskPair) {
                throw new Error(
                  'No complete bilingual analysis pair found in the database or on disk. ' +
                    'Run "odysseus analyze" first.',
                );
              }
              fr = diskPair.fr;
              en = diskPair.en;
            }

            const results = await runAllReportsStage(
              resolvedDir,
              manifest,
              findings,
              { fr, en },
              mongoConnection,
            );

            console.log(`Reports for ${manifest.auditId} complete (2 of 2: fr/en)`);
            for (const result of results) {
              console.log(`  ${result.language}: ${result.reportPath}`);
              if (result.pageCountWarning !== undefined) {
                logPageCountWarning(result.pageCountWarning);
              }
            }
            return;
          }

          if (!opts.language) {
            throw new Error('--language <fr|en> is required unless --all is passed');
          }

          const { manifest, findings } = await loadManifestAndFindings(resolvedDir);

          const analysisPath = opts.analysis
            ? path.resolve(opts.analysis)
            : await findLatestAnalysisFile(path.join(resolvedDir, 'analyses'), opts.language);
          if (!analysisPath) {
            throw new Error(
              `No analysis found for language "${opts.language}" under ${resolvedDir}/analyses. ` +
                'Run "odysseus analyze" first, or pass --analysis explicitly.',
            );
          }
          const analysis = await readAnalysis(analysisPath);

          mongoConnection = await connectToMongo();
          const result = await runReportStage(
            resolvedDir,
            manifest,
            findings,
            analysis,
            mongoConnection,
          );

          console.log(`Report for ${manifest.auditId} complete (${opts.language})`);
          console.log(`  Analysis used: ${path.relative(resolvedDir, analysisPath)}`);
          console.log(`  Written: ${result.reportPath}`);
          if (result.pageCountWarning !== undefined) {
            logPageCountWarning(result.pageCountWarning);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `odysseus report: failed to generate a report for ${resolvedDir}\n${message}`,
          );
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );
}
