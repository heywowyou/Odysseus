import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import {
  analyzeFindings,
  buildFallbackSiteContext,
  buildLlmInput,
  filterFindingsForLlm,
  type SiteContextInput,
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

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze <artifacts-dir>')
    .description(
      "Group, prioritize, and explain a completed audit's findings via the Claude API. " +
        'Reads findings.json and manifest.json only; never re-scans the client site.',
    )
    .requiredOption('--language <fr|en>', 'Report language: fr or en', parseLanguage)
    .option('--context <file>', 'Path to a JSON file with site context')
    .action(async (artifactsDir: string, opts: { language: ReportLanguage; context?: string }) => {
      const resolvedDir = path.resolve(artifactsDir);
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

      try {
        const manifestPath = path.join(resolvedDir, 'manifest.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AuditManifest;

        const findingsPath = path.join(resolvedDir, 'findings.json');
        const allFindings = JSON.parse(await fs.readFile(findingsPath, 'utf-8')) as Finding[];

        const { siteContext, usedFallback } = await readSiteContext(opts.context);

        const filtered = filterFindingsForLlm(allFindings);
        const input = buildLlmInput(filtered, siteContext, opts.language);

        const generatedAt = new Date();
        const result = await analyzeFindings(input, filtered, usedFallback);

        const analysesDir = path.join(resolvedDir, 'analyses');
        await fs.mkdir(analysesDir, { recursive: true });
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
              model: result.model,
              effort: result.effort,
              generatedAt: generatedAt.toISOString(),
              ...result.output,
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
          result.model,
          result.effort,
          generatedAt,
          result.output,
        );

        console.log(`Analysis of ${manifest.auditId} complete (${opts.language})`);
        console.log(`  Overall risk: ${result.output.overallRisk}`);
        console.log(`  Themes: ${result.output.themes.length}`);
        console.log(`  Quick wins: ${result.output.quickWins.length}`);
        if (result.unreferencedFindingCount > 0) {
          console.log(`  Warning: ${result.unreferencedFindingCount} finding(s) not referenced by any theme`);
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
    });
}
