/**
 * Dev validation tool, not library code: runs the WCAG-citation and
 * business-claim guards log-only over every stored analysis under
 * artifacts/ (or a directory given as the first argument), so a new guard
 * can be measured against real output before it is promoted into
 * analyzeWriting's retry loop. Never rejects anything, always exits 0:
 * the promotion decision is made by a human reading this output, not by
 * this script.
 *
 * Run from the workspace root:
 *   pnpm exec tsx packages/llm/src/lint-stored-analyses.ts [artifactsDir]
 */
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReportLanguage } from '@odysseus/core';
import { findBusinessClaimViolationsInFields } from './business-claim-guard.js';
import { findWcagCitationViolationsInFields } from './wcag-citation-guard.js';
import {
  computeRepetitionMetrics,
  proseFieldsOf,
  type StoredAnalysisShape,
} from './repetition-metrics.js';

const ANALYSIS_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d-]+Z-(fr|en)\.json$/;

async function* findAnalysisFiles(dir: string): AsyncGenerator<{ file: string; language: string }> {
  let hosts: Dirent[];
  try {
    hosts = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const host of hosts) {
    if (!host.isDirectory()) continue;
    const auditDirs: Dirent[] = await readdir(path.join(dir, host.name), { withFileTypes: true });
    for (const audit of auditDirs) {
      if (!audit.isDirectory()) continue;
      const analysesDir = path.join(dir, host.name, audit.name, 'analyses');
      let files;
      try {
        files = await readdir(analysesDir);
      } catch {
        continue;
      }
      for (const file of files) {
        const match = ANALYSIS_FILENAME_PATTERN.exec(file);
        if (match) {
          yield { file: path.join(analysesDir, file), language: match[1]! };
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const artifactsDir = process.argv[2] ?? path.resolve(moduleDir, '../../../artifacts');

  let filesScanned = 0;
  const totals = { wcag: 0, business: 0 };
  const repetitionTotals = {
    recommendedActionsTotal: 0,
    recommendedActionsSharingFirstFiveWords: 0,
    recommendedActionsOpeningWithDevoirModal: 0,
    recommendedActionsSharingSentenceFinalTail: 0,
    businessImpactTotal: 0,
    businessImpactSharingFirstTwoWords: 0,
    verbatimPromptExampleMatches: 0,
    constructionFlags: 0,
  };
  const perFile: string[] = [];

  for await (const { file, language } of findAnalysisFiles(artifactsDir)) {
    filesScanned += 1;
    const analysis: StoredAnalysisShape = JSON.parse(await readFile(file, 'utf8'));
    const fields = proseFieldsOf(analysis);
    const reportLanguage = language as ReportLanguage;

    const wcag = findWcagCitationViolationsInFields(fields);
    const business = findBusinessClaimViolationsInFields(fields, reportLanguage);
    totals.wcag += wcag.length;
    totals.business += business.length;

    const repetition = computeRepetitionMetrics(fields, reportLanguage);
    repetitionTotals.recommendedActionsTotal += repetition.recommendedActionsTotal;
    repetitionTotals.recommendedActionsSharingFirstFiveWords +=
      repetition.recommendedActionsSharingFirstFiveWords;
    repetitionTotals.recommendedActionsOpeningWithDevoirModal +=
      repetition.recommendedActionsOpeningWithDevoirModal;
    repetitionTotals.recommendedActionsSharingSentenceFinalTail +=
      repetition.recommendedActionsSharingSentenceFinalTail;
    repetitionTotals.businessImpactTotal += repetition.businessImpactTotal;
    repetitionTotals.businessImpactSharingFirstTwoWords +=
      repetition.businessImpactSharingFirstTwoWords;
    repetitionTotals.verbatimPromptExampleMatches += repetition.verbatimPromptExampleMatches.length;
    repetitionTotals.constructionFlags += repetition.constructionRepetitionFlags.length;

    if (
      wcag.length > 0 ||
      business.length > 0 ||
      repetition.verbatimPromptExampleMatches.length > 0 ||
      repetition.constructionRepetitionFlags.length > 0
    ) {
      const lines = [
        `${path.relative(artifactsDir, file)} (${language}):`,
        ...wcag.map((v) => `  [wcag-citation] ${v.field} matched "${v.matched}"`),
        ...business.map((v) => `  [business-claim] ${v.field} matched "${v.matched}"`),
        ...repetition.verbatimPromptExampleMatches.map((m) => `  [verbatim-example] ${m}`),
        ...repetition.constructionRepetitionFlags.map((m) => `  [construction] ${m}`),
      ];
      perFile.push(lines.join('\n'));
    }
  }

  console.log(perFile.join('\n\n'));
  console.log(`\nScanned ${filesScanned} analysis files under ${artifactsDir}`);
  console.log(`WCAG citation violations: ${totals.wcag}`);
  console.log(`Business claim violations: ${totals.business}`);
  console.log(
    `recommendedActions sharing their first five words: ${repetitionTotals.recommendedActionsSharingFirstFiveWords}/${repetitionTotals.recommendedActionsTotal} (most common opening, per-file share summed)`,
  );
  console.log(
    `recommendedActions opening on subject + devoir: ${repetitionTotals.recommendedActionsOpeningWithDevoirModal}/${repetitionTotals.recommendedActionsTotal} (per-file count summed, issue #106)`,
  );
  console.log(
    `recommendedActions sharing one sentence-final tail: ${repetitionTotals.recommendedActionsSharingSentenceFinalTail}/${repetitionTotals.recommendedActionsTotal} (most common tail, per-file count summed, issue #106)`,
  );
  console.log(
    `businessImpact sharing their first two words: ${repetitionTotals.businessImpactSharingFirstTwoWords}/${repetitionTotals.businessImpactTotal} (most common opening, per-file share summed)`,
  );
  console.log(`Verbatim prompt-example matches: ${repetitionTotals.verbatimPromptExampleMatches}`);
  console.log(`Construction-level flags raised: ${repetitionTotals.constructionFlags}`);
}

void main();
