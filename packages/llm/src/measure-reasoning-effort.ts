/**
 * Dev measurement tool for plan 029 lever E, not library code: re-runs the
 * writing pass at the production `reasoning_effort: 'none'` and at a raised
 * setting against the same stored structure documents, and prints a
 * side-by-side report of the repetition metrics lint-stored-analyses.ts
 * computes, plus token usage and wall-clock latency. Non-gating by
 * construction: nothing is persisted, no analysis document is written, and
 * no production call site reads this script. Whether to raise the effort
 * in production is an operator decision made after reading this output,
 * per the same "measure before promoting" doctrine as trade-off 55.
 *
 * Each run is ONE attempt: production's guard-and-retry loop is not
 * replicated. Guards run log-only over the single response (all of them,
 * not just the first to fire) so the output shows what each effort level
 * would have tripped; a response a guard rejects is still measured, since
 * the repetition metrics are the point. transactionalFlowStatus is the
 * neutral 'unknown' for both arms - deriving the real one needs the
 * obligation stage, and a fixed value keeps the comparison symmetric.
 *
 * The two default audit directories are the stored audits plan 027's
 * step 7 measured against (Briketenia and Villas Foch, full local
 * artifacts). Run from the workspace root with .env sourced:
 *   set -a; . ./.env; set +a
 *   pnpm exec tsx packages/llm/src/measure-reasoning-effort.ts \
 *     [--effort low|medium|high] [--languages fr,en] [--baseline-only] \
 *     [auditDir ...]
 *
 * --baseline-only (added for issue #106) runs only the production arm,
 * one attempt per stored structure document. Issue #106's comparison is
 * across prompt versions, not effort levels: the same command run before
 * and after a writing-prompt change, with the repetition metrics as the
 * yardstick. Running the raised arm in that comparison would double the
 * live calls to produce a number the question never asked about.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import { callOpenAiForWriting, type ReasoningEffort, type WritingCallUsage } from './client.js';
import {
  buildFallbackSiteContext,
  buildWritingInput,
  computeSiteStats,
  filterFindingsForLlm,
} from './build-input.js';
import {
  computeRepetitionMetrics,
  proseFieldsOf,
  type RepetitionMetrics,
} from './repetition-metrics.js';
import { findBusinessClaimViolations } from './business-claim-guard.js';
import { findExecutiveSummaryDigitViolations } from './executive-summary-digit-guard.js';
import { findFindingCountViolations } from './finding-count-guard.js';
import { findLanguageComplianceViolations } from './language-guard.js';
import { findLegalConsequenceViolations } from './legal-consequence-guard.js';
import { findPageCountViolations } from './page-count-guard.js';
import { findPositionalReferenceViolations } from './positional-reference-guard.js';
import { findProviderPhraseViolations, selectProviderPhrase } from './provider-phrase-guard.js';
import { findSeverityVocabularyViolations } from './severity-vocabulary-guard.js';
import { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
import { findTransactionalFlowViolations } from './transactional-flow-guard.js';
import { findWcagCitationViolations } from './wcag-citation-guard.js';
import { parseStructureDocument } from './structure-schema.js';
import { normalizeWritingOutputTypography } from './typography.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, '../../..');
const DEFAULT_AUDIT_DIRS = [
  path.join(workspaceRoot, 'artifacts/www.briketenia.com/2026-09-04T19-06-02Z'),
  path.join(workspaceRoot, 'artifacts/www.villasfoch.fr/2026-09-03T20-44-46Z'),
];

interface RunResult {
  label: string;
  effort: ReasoningEffort;
  language: ReportLanguage;
  ok: boolean;
  error?: string;
  wallMs?: number;
  usage?: WritingCallUsage;
  rejectedBy?: string[];
  repetition?: RepetitionMetrics;
}

/** Guard sweep over one response, reporting every guard that would fire
 *  rather than analyzeWriting's first-match rejection, in the same order
 *  the production loop runs them. */
function guardRejections(
  output: WritingPassOutput,
  input: WritingInput,
  expectedThemeKeys: readonly string[],
): string[] {
  const rejected: string[] = [];
  if (!isThemeKeyMismatchEmpty(findThemeKeyMismatches(expectedThemeKeys, output))) {
    rejected.push('theme-key');
  }
  if (findLanguageComplianceViolations(output, input.language).length > 0)
    rejected.push('language');
  if (findSeverityVocabularyViolations(output, input.language).length > 0) {
    rejected.push('severity-vocabulary');
  }
  if (findLegalConsequenceViolations(output, input.language).length > 0) {
    rejected.push('legal-consequence');
  }
  if (findPageCountViolations(output, input.language).length > 0) rejected.push('page-count');
  if (findFindingCountViolations(output, input.language).length > 0) rejected.push('finding-count');
  if (findPositionalReferenceViolations(output, input.language).length > 0) {
    rejected.push('positional-reference');
  }
  if (findWcagCitationViolations(output).length > 0) rejected.push('wcag-citation');
  if (findBusinessClaimViolations(output, input.language).length > 0) {
    rejected.push('business-claim');
  }
  if (
    findTransactionalFlowViolations(
      output,
      input.language,
      input.transactionalFlowStatus ?? 'unknown',
    ).length > 0
  ) {
    rejected.push('transactional-flow');
  }
  if (findExecutiveSummaryDigitViolations(output).length > 0)
    rejected.push('executive-summary-digit');
  // Same resolution as analyzeWriting's assignedProviderPhrase: the model
  // was shown input.providerPhrase, so judging its output against the
  // unseeded first phrase would flag every seeded report as a violation.
  if (
    findProviderPhraseViolations(
      output,
      input.language,
      input.providerPhrase ?? selectProviderPhrase(input.language),
    ).length > 0
  ) {
    rejected.push('provider-phrase');
  }
  return rejected;
}

async function runWritingPass(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  effort: ReasoningEffort,
  label: string,
  printOutputs: boolean,
): Promise<RunResult> {
  const startedAt = Date.now();
  try {
    const result = await callOpenAiForWriting(input, true, undefined, effort);
    const wallMs = Date.now() - startedAt;
    const rejectedBy = guardRejections(result.output, input, expectedThemeKeys);
    const normalized = normalizeWritingOutputTypography(result.output, input.language);
    if (printOutputs) {
      console.log(
        `--- ${label} @ ${effort} (normalized output, for manual register comparison) ---`,
      );
      console.log(JSON.stringify(normalized, null, 2));
    }
    return {
      label,
      effort,
      language: input.language,
      ok: true,
      wallMs,
      ...(result.usage ? { usage: result.usage } : {}),
      rejectedBy,
      repetition: computeRepetitionMetrics(proseFieldsOf(normalized), input.language),
    };
  } catch (error) {
    return {
      label,
      effort,
      language: input.language,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      wallMs: Date.now() - startedAt,
    };
  }
}

function formatUsage(usage: WritingCallUsage | undefined): string {
  if (!usage) return 'usage: not reported';
  const reasoning =
    usage.reasoningTokens !== undefined ? ` (reasoning ${usage.reasoningTokens})` : '';
  return `tokens: ${usage.totalTokens} total = ${usage.promptTokens} prompt + ${usage.completionTokens} completion${reasoning}`;
}

function metricLine(name: string, none: RunResult, raised: RunResult): string {
  const a = none.repetition;
  const b = raised.repetition;
  if (!a || !b) return `  ${name}: n/a`;
  return `  ${name}: ${a.recommendedActionsSharingFirstFiveWords}/${a.recommendedActionsTotal} -> ${b.recommendedActionsSharingFirstFiveWords}/${b.recommendedActionsTotal}`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let raisedEffort: ReasoningEffort = 'low';
  let languages: ReportLanguage[] = ['fr', 'en'];
  let printOutputs = false;
  let baselineOnly = false;
  const auditDirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--effort') {
      raisedEffort = argv[++i] as ReasoningEffort;
      if (!['low', 'medium', 'high'].includes(raisedEffort)) {
        throw new Error(`--effort must be low, medium, or high, got "${raisedEffort}"`);
      }
    } else if (argv[i] === '--languages') {
      languages = (argv[++i] ?? '').split(',') as ReportLanguage[];
      for (const language of languages) {
        if (language !== 'fr' && language !== 'en') {
          throw new Error(`--languages entries must be fr or en, got "${language}"`);
        }
      }
    } else if (argv[i] === '--print') {
      printOutputs = true;
    } else if (argv[i] === '--baseline-only') {
      baselineOnly = true;
    } else {
      auditDirs.push(path.resolve(argv[i]!));
    }
  }
  const dirs = auditDirs.length > 0 ? auditDirs : DEFAULT_AUDIT_DIRS;

  console.log(
    baselineOnly
      ? `Writing-pass measurement, production arm only ('none'), one attempt per run, nothing persisted.\n`
      : `Writing-pass reasoning_effort measurement: baseline 'none' vs '${raisedEffort}', one attempt per run, nothing persisted.\n`,
  );

  for (const auditDir of dirs) {
    const manifest = JSON.parse(
      await readFile(path.join(auditDir, 'manifest.json'), 'utf8'),
    ) as AuditManifest;
    const allFindings = JSON.parse(
      await readFile(path.join(auditDir, 'findings.json'), 'utf8'),
    ) as Finding[];
    const analysesDir = path.join(auditDir, 'analyses');
    const entries = await readdir(analysesDir);
    const structureFile = entries
      .filter((name) => name.endsWith('-structure.json'))
      .sort()
      .at(-1);
    if (!structureFile) {
      console.log(`${auditDir}: no stored structure document, skipped.`);
      continue;
    }
    const structureDoc = parseStructureDocument(
      JSON.parse(await readFile(path.join(analysesDir, structureFile), 'utf8')),
    );
    const filteredFindings = filterFindingsForLlm(allFindings);
    const siteStats = computeSiteStats(allFindings, manifest);
    const expectedThemeKeys = structureDoc.themes.map((theme) => theme.themeKey);
    const hostLabel = path.basename(path.dirname(auditDir));

    console.log(
      `${hostLabel} (${path.basename(auditDir)}, structure ${structureFile}, ${structureDoc.themes.length} themes)`,
    );

    for (const language of languages) {
      const writingInput = buildWritingInput(
        structureDoc.themes,
        filteredFindings,
        buildFallbackSiteContext(),
        language,
        siteStats,
        emptyWritingPerformanceEvidence(),
        {},
        'unknown',
        manifest.auditId,
      );
      const efforts: ReasoningEffort[] = baselineOnly ? ['none'] : ['none', raisedEffort];
      const runs: RunResult[] = [];
      for (const effort of efforts) {
        const run = await runWritingPass(
          writingInput,
          expectedThemeKeys,
          effort,
          `${hostLabel} ${language}`,
          printOutputs,
        );
        runs.push(run);
        const status = run.ok
          ? run.rejectedBy?.length
            ? `GUARDS: ${run.rejectedBy.join(', ')}`
            : 'guards: clean'
          : `FAILED: ${run.error}`;
        console.log(
          `  ${language} @ ${effort}: ${run.wallMs} ms, ${formatUsage(run.usage)}${run.ok ? `, ${status}` : `, ${status}`}`,
        );
        if (run.ok && run.repetition) {
          const r = run.repetition;
          console.log(
            `    actions opening share: ${r.recommendedActionsSharingFirstFiveWords}/${r.recommendedActionsTotal} (5w), impacts: ${r.businessImpactSharingFirstTwoWords}/${r.businessImpactTotal} (2w), verbatim example matches: ${r.verbatimPromptExampleMatches.length}`,
          );
          console.log(
            `    construction (issue #106): subject+devoir openings ${r.recommendedActionsOpeningWithDevoirModal}/${r.recommendedActionsTotal}, most shared final tail "${r.recommendedActionsMostSharedSentenceFinalTail}" ${r.recommendedActionsSharingSentenceFinalTail}/${r.recommendedActionsTotal}`,
          );
          for (const flag of r.constructionRepetitionFlags) {
            console.log(`    [construction] ${flag}`);
          }
        }
      }
      const [none, raised] = runs;
      if (!baselineOnly && none?.ok && raised?.ok) {
        console.log(`  side by side (${language}):`);
        console.log(metricLine('actions 5-word opening share', none, raised));
        const ai = none.repetition?.businessImpactSharingFirstTwoWords;
        const bi = raised.repetition?.businessImpactSharingFirstTwoWords;
        const at = none.repetition?.businessImpactTotal ?? 0;
        const bt = raised.repetition?.businessImpactTotal ?? 0;
        console.log(`  impacts 2-word opening share: ${ai}/${at} -> ${bi}/${bt}`);
        const latencyDelta = (raised.wallMs ?? 0) - (none.wallMs ?? 0);
        console.log(
          `  latency delta: ${latencyDelta >= 0 ? '+' : ''}${latencyDelta} ms (${none.wallMs} -> ${raised.wallMs})`,
        );
        if (none.usage && raised.usage) {
          console.log(
            `  token delta: ${raised.usage.totalTokens - none.usage.totalTokens >= 0 ? '+' : ''}${raised.usage.totalTokens - none.usage.totalTokens} total, reasoning tokens at '${raised.effort}': ${raised.usage.reasoningTokens ?? 'not reported'}`,
          );
        }
      }
      console.log('');
    }
  }
  console.log(
    'Done. This output measures; it does not decide. Record the ship/defer call and its reasoning in plans/029-writing-pass-open-levers.md.',
  );
}

void main();
