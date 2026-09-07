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
import type { ProseField } from './prose-fields.js';
import { findWcagCitationViolationsInFields } from './wcag-citation-guard.js';
import { PROMPT_EXAMPLE_SENTENCES } from './writing-prompt.js';

interface StoredAnalysisShape {
  executiveSummary?: unknown;
  notes?: unknown;
  themes?: Array<{ title?: unknown; businessImpact?: unknown; recommendedActions?: unknown }>;
}

/** Plan 027 step 6: the diagnosis behind this whole plan was a set of
 *  repetition measurements (18/18 identical recommendedActions openings,
 *  a verbatim-copied closing sentence), not a single violation count. These
 *  three additions measure the same shape of problem for any *future*
 *  prompt regression, without gating anything - promotion to a guard is
 *  the same "measure first" doctrine trade-off 55 already applies to the
 *  shadow reviewer. */
interface RepetitionMetrics {
  recommendedActionsTotal: number;
  recommendedActionsSharingFirstFiveWords: number;
  businessImpactTotal: number;
  businessImpactSharingFirstTwoWords: number;
  verbatimPromptExampleMatches: string[];
}

function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).slice(0, count).join(' ').toLowerCase();
}

function mostCommonShare(values: readonly string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const mostCommon = Math.max(...counts.values());
  return mostCommon / values.length;
}

/** The stored prose has already been through typography normalization, so
 *  it carries typographic apostrophes while the prompt-example constants
 *  carry straight ones. Comparing the two raw forms is why this check
 *  reported zero on every French analysis ever linted: with an apostrophe
 *  in every French example, it could not return anything else. */
function straighten(text: string): string {
  return text.replace(/[\u2019\u02BC]/g, "'").toLowerCase();
}

/** Long enough that an ordinary shared turn of phrase does not trip it,
 *  short enough to catch a reused opening clause. */
const SHARED_OPENING_WORD_THRESHOLD = 6;

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Counts how many leading words any sentence of `text` shares with
 *  `example`, taking the best sentence. */
function sharedOpeningWordCount(text: string, example: string): number {
  const exampleWords = wordsOf(example);
  let best = 0;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = wordsOf(sentence);
    let shared = 0;
    while (
      shared < words.length &&
      shared < exampleWords.length &&
      words[shared] === exampleWords[shared]
    ) {
      shared++;
    }
    if (shared > best) best = shared;
  }
  return best;
}

function findVerbatimPromptExampleMatches(
  fields: readonly ProseField[],
  language: ReportLanguage,
): string[] {
  const examples = PROMPT_EXAMPLE_SENTENCES[language];
  const matches: string[] = [];
  for (const field of fields) {
    const haystack = straighten(field.text);
    for (const example of examples) {
      const needle = straighten(example);
      if (haystack.includes(needle)) {
        matches.push(`${field.field} matches a prompt example verbatim: "${example}"`);
        continue;
      }
      // A whole-sentence match was never the behaviour worth measuring: the
      // model reuses an example's opening clause and finishes it its own way,
      // which a containment check cannot see. Measured 2026-09-07: three
      // consecutive French runs opened their closing sentence with example
      // two's first eleven words while this function reported zero.
      const shared = sharedOpeningWordCount(haystack, needle);
      if (shared >= SHARED_OPENING_WORD_THRESHOLD) {
        matches.push(
          `${field.field} reuses a prompt example's opening ${shared} words: "${firstWords(example, shared)}..."`,
        );
      }
    }
  }
  return matches;
}

function computeRepetitionMetrics(
  fields: readonly ProseField[],
  language: ReportLanguage,
): RepetitionMetrics {
  const recommendedActions = fields
    .filter((f) => /recommendedActions\[\d+\]$/.test(f.field))
    .map((f) => firstWords(f.text, 5));
  const businessImpact = fields
    .filter((f) => f.field.endsWith('.businessImpact'))
    .map((f) => firstWords(f.text, 2));

  return {
    recommendedActionsTotal: recommendedActions.length,
    recommendedActionsSharingFirstFiveWords: Math.round(
      mostCommonShare(recommendedActions) * recommendedActions.length,
    ),
    businessImpactTotal: businessImpact.length,
    businessImpactSharingFirstTwoWords: Math.round(
      mostCommonShare(businessImpact) * businessImpact.length,
    ),
    verbatimPromptExampleMatches: findVerbatimPromptExampleMatches(fields, language),
  };
}

const ANALYSIS_FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d-]+Z-(fr|en)\.json$/;

function proseFieldsOf(analysis: StoredAnalysisShape): ProseField[] {
  const fields: ProseField[] = [];
  if (typeof analysis.executiveSummary === 'string') {
    fields.push({ field: 'executiveSummary', text: analysis.executiveSummary });
  }
  if (typeof analysis.notes === 'string') {
    fields.push({ field: 'notes', text: analysis.notes });
  }
  (analysis.themes ?? []).forEach((theme, i) => {
    if (typeof theme.title === 'string') {
      fields.push({ field: `themes[${i}].title`, text: theme.title });
    }
    if (typeof theme.businessImpact === 'string') {
      fields.push({ field: `themes[${i}].businessImpact`, text: theme.businessImpact });
    }
    if (Array.isArray(theme.recommendedActions)) {
      theme.recommendedActions.forEach((action, j) => {
        if (typeof action === 'string') {
          fields.push({ field: `themes[${i}].recommendedActions[${j}]`, text: action });
        }
      });
    }
  });
  return fields;
}

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
    businessImpactTotal: 0,
    businessImpactSharingFirstTwoWords: 0,
    verbatimPromptExampleMatches: 0,
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
    repetitionTotals.businessImpactTotal += repetition.businessImpactTotal;
    repetitionTotals.businessImpactSharingFirstTwoWords +=
      repetition.businessImpactSharingFirstTwoWords;
    repetitionTotals.verbatimPromptExampleMatches += repetition.verbatimPromptExampleMatches.length;

    if (
      wcag.length > 0 ||
      business.length > 0 ||
      repetition.verbatimPromptExampleMatches.length > 0
    ) {
      const lines = [
        `${path.relative(artifactsDir, file)} (${language}):`,
        ...wcag.map((v) => `  [wcag-citation] ${v.field} matched "${v.matched}"`),
        ...business.map((v) => `  [business-claim] ${v.field} matched "${v.matched}"`),
        ...repetition.verbatimPromptExampleMatches.map((m) => `  [verbatim-example] ${m}`),
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
    `businessImpact sharing their first two words: ${repetitionTotals.businessImpactSharingFirstTwoWords}/${repetitionTotals.businessImpactTotal} (most common opening, per-file share summed)`,
  );
  console.log(`Verbatim prompt-example matches: ${repetitionTotals.verbatimPromptExampleMatches}`);
}

void main();
