import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import type { AuditManifest, Finding, ReportLanguage, SiteSignalOverrides } from '@odysseus/core';
import { buildFallbackSiteContext, type SiteContextInput } from '@odysseus/llm';
import { runAnalysisStage } from '@odysseus/interface';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';
import { parseSirenOption } from '../parse-siren-option.js';
import { parseBooleanOption } from '../parse-boolean-option.js';

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

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze <artifacts-dir>')
    .description(
      "Group, prioritize, and explain a completed audit's findings via the Mistral API. " +
        'Reads findings.json and manifest.json only; never re-scans the client site.',
    )
    .requiredOption('--language <fr|en>', 'Report language: fr or en', parseLanguage)
    .option('--context <file>', 'Path to a JSON file with site context')
    .option(
      '--regenerate-structure',
      'Force a fresh structure pass (grouping and prioritization) even if one already exists for this audit',
    )
    .option(
      '--siren <number>',
      'Manually supplied SIREN, same as `odysseus audit`\'s flag of the same name. Only consulted when this ' +
        'audit has no obligation determination already computed by `audit` in the same process (i.e. every ' +
        'standalone `analyze <dir>` call) - reproduces the same manual override `audit --siren` was given, ' +
        'instead of silently recomputing from extracted facts alone.',
      parseSirenOption,
    )
    .option(
      '--override-transactional-flow <true|false>',
      'Manually asserted hasTransactionalFlow override, same as `odysseus audit`\'s flag of the same name and ' +
        'same "only consulted when no obligation determination already exists" posture as --siren above.',
      parseBooleanOption,
    )
    .option(
      '--override-transactional-flow-reason <text>',
      'Optional free-text reason for --override-transactional-flow.',
    )
    .action(
      async (
        artifactsDir: string,
        opts: {
          language: ReportLanguage;
          context?: string;
          regenerateStructure?: boolean;
          siren?: string;
          overrideTransactionalFlow?: boolean;
          overrideTransactionalFlowReason?: string;
        },
      ) => {
        const resolvedDir = path.resolve(artifactsDir);
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

        try {
          const manifestPath = path.join(resolvedDir, 'manifest.json');
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AuditManifest;

          const findingsPath = path.join(resolvedDir, 'findings.json');
          const allFindings = JSON.parse(await fs.readFile(findingsPath, 'utf-8')) as Finding[];

          const { siteContext, usedFallback } = await readSiteContext(opts.context);

          const siteSignalOverrides: SiteSignalOverrides | undefined =
            opts.overrideTransactionalFlow !== undefined
              ? {
                  hasTransactionalFlow: {
                    value: opts.overrideTransactionalFlow,
                    ...(opts.overrideTransactionalFlowReason !== undefined
                      ? { reason: opts.overrideTransactionalFlowReason }
                      : {}),
                  },
                }
              : undefined;

          mongoConnection = await connectToMongo();
          const result = await runAnalysisStage(
            resolvedDir,
            manifest,
            allFindings,
            {
              language: opts.language,
              ...(usedFallback ? {} : { siteContext }),
              ...(opts.regenerateStructure !== undefined ? { regenerateStructure: opts.regenerateStructure } : {}),
              ...(opts.siren !== undefined ? { manualSiren: opts.siren } : {}),
              ...(siteSignalOverrides !== undefined ? { siteSignalOverrides } : {}),
            },
            mongoConnection,
          );

          console.log(
            `  Structure: ${result.structureReused ? 'reused' : 'generated'} (${path.basename(result.structurePath)}, ${result.analysis.themes.length} themes)`,
          );
          console.log(`Analysis of ${manifest.auditId} complete (${opts.language})`);
          console.log(`  Overall risk: ${result.analysis.overallRisk}`);
          console.log(`  Themes: ${result.analysis.themes.length}`);
          console.log(`  Quick wins: ${result.analysis.quickWins.length}`);
          if (result.unreferencedFindingCount > 0) {
            console.log(`  Warning: ${result.unreferencedFindingCount} finding(s) not referenced by any theme`);
          }
          if (result.usedFallbackContext) {
            console.log('  Note: no --context file was provided; minimal site context was used.');
          }
          console.log(`  Written: ${result.analysisPath}`);
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
