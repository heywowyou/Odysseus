import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import type { AuditManifest, Finding, LlmOutput, ReportLanguage } from '@odysseus/core';
import type { ReportTier, StoredAnalysis } from '@odysseus/report';
import { runReportStage } from '@odysseus/interface';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';

function parseLanguage(value: string): ReportLanguage {
  if (value !== 'fr' && value !== 'en') {
    throw new InvalidArgumentError(`must be "fr" or "en", got "${value}"`);
  }
  return value;
}

function parseTier(value: string): ReportTier {
  if (value !== 'screening' && value !== 'full') {
    throw new InvalidArgumentError(`must be "screening" or "full", got "${value}"`);
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
    auditId: string;
    language: ReportLanguage;
    model: string;
    temperature: number;
    generatedAt: string;
  };
  return { ...parsed, generatedAt: new Date(parsed.generatedAt) };
}

export function registerReportCommand(program: Command): void {
  program
    .command('report <artifacts-dir>')
    .description(
      'Render a stored analysis and the full findings appendix into a bilingual PDF. ' +
        'Reads manifest.json, findings.json, and an analyses/*.json file; never re-scans the client site.',
    )
    .requiredOption('--language <fr|en>', 'Report language: fr or en', parseLanguage)
    .option('--analysis <file>', 'Path to a specific analysis file; defaults to the latest for --language')
    .option(
      '--tier <screening|full>',
      'Report tier: screening (executive summary, risk badge, top critical/serious findings, extended ' +
        'accessibility pass as counts only) or full (adds theme grouping, full page/selector detail, render ' +
        'diff evidence, and the "what to do first" summary). Defaults to full.',
      parseTier,
    )
    .action(async (artifactsDir: string, opts: { language: ReportLanguage; analysis?: string; tier?: ReportTier }) => {
      const resolvedDir = path.resolve(artifactsDir);
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

      try {
        const manifestPath = path.join(resolvedDir, 'manifest.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AuditManifest;

        const findingsPath = path.join(resolvedDir, 'findings.json');
        const findings = JSON.parse(await fs.readFile(findingsPath, 'utf-8')) as Finding[];

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

        const tier = opts.tier ?? 'full';
        mongoConnection = await connectToMongo();
        const result = await runReportStage(resolvedDir, manifest, findings, analysis, mongoConnection, tier);

        console.log(`Report for ${manifest.auditId} complete (${opts.language}, ${tier})`);
        console.log(`  Analysis used: ${path.relative(resolvedDir, analysisPath)}`);
        console.log(`  Written: ${result.reportPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus report: failed to generate a report for ${resolvedDir}\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
