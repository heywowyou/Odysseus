import type { AuditManifest, Finding } from '@odysseus/core';
import { callOpenAiForStructure } from './client.js';
import { OPENAI_MODEL, OPENAI_TEMPERATURE, MAX_RETRIES } from './constants.js';
import { applyStructureRankingRules } from './structure-ranking.js';
import {
  findInventedStructureFindingIds,
  findUnreferencedStructureFindingIds,
} from './structure-guards.js';
import {
  aliasStructureInput,
  buildFindingAliasMap,
  resolveStructureOutputIds,
} from './finding-alias.js';
import {
  assignThemeKeys,
  type StructureInput,
  type StructureThemeWithKey,
} from './structure-schema.js';
import { paceRateLimitedRetry } from './rate-limit-pacing.js';
import { captureLlmCallTelemetry } from './telemetry/llm-telemetry.js';

export interface AnalyzeStructureResult {
  themes: StructureThemeWithKey[];
  quickWins: string[];
  overallRisk: 'low' | 'medium' | 'high';
  model: string;
  temperature: number;
  unreferencedFindingCount: number;
}

/** Retry-and-guard orchestration for the structure pass, independent of
 *  the writing pass's own retry budget. Enforces the governing rule:
 *  deterministic scanners detect, the LLM explains - any response
 *  referencing a finding ID absent from its input is rejected, logged,
 *  and retried, then fails loudly rather than shipping a partial or
 *  untraceable grouping. See docs/rules/llm-layer-rules.md sections 2 and 9.
 *
 *  filteredFindings must be the exact array passed into
 *  buildStructureInput to produce `input` - the guard functions must see
 *  exactly what the model saw, never the unfiltered full set. See
 *  section 1. */
export async function analyzeStructure(
  input: StructureInput,
  filteredFindings: readonly Finding[],
  usedFallbackContext: boolean,
  manifest: AuditManifest,
): Promise<AnalyzeStructureResult> {
  let lastFailureReason = '';
  const startedAtMs = Date.now();

  // Findings are shown to the model under dense alias IDs, so the holes left
  // by filtering and diversion cannot tempt it into completing a numeric run.
  // Aliases are resolved away below, before anything is returned. See
  // finding-alias.ts for the failure this fixes.
  const aliasMap = buildFindingAliasMap(filteredFindings);
  const aliasedInput = aliasStructureInput(input, aliasMap);

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let result: Awaited<ReturnType<typeof callOpenAiForStructure>>;
    try {
      result = await callOpenAiForStructure(aliasedInput, usedFallbackContext);
    } catch (error) {
      // A malformed or truncated response (e.g. schema/JSON parse failure)
      // is a retryable attempt, not an immediate abort - same treatment as
      // an invented finding ID. A provider refusal also surfaces here as a
      // failed attempt. Only genuinely unrecoverable errors (auth,
      // etc.) will still fail every attempt and surface via the
      // exhausted-retries error below.
      lastFailureReason = error instanceof Error ? error.message : String(error);
      console.error(
        `odysseus analyze (structure pass): attempt ${attempt}/${MAX_RETRIES + 1} failed - ${lastFailureReason}`,
      );
      await paceRateLimitedRetry(attempt, lastFailureReason);
      continue;
    }

    // Checked in alias space, which is what the model was actually shown.
    const invented = findInventedStructureFindingIds(result.output, aliasMap.aliasedIds);
    if (invented.length > 0) {
      lastFailureReason = `response referenced finding ID(s) not present in the input: ${invented.join(', ')}`;
      console.error(
        `odysseus analyze (structure pass): attempt ${attempt}/${MAX_RETRIES + 1} rejected - invented finding IDs: ${invented.join(', ')}`,
      );
      continue;
    }

    // Real IDs from here down: everything downstream of this point, including
    // the warning below and structure.json on disk, must never see an alias.
    const output = resolveStructureOutputIds(result.output, aliasMap);

    const unreferenced = findUnreferencedStructureFindingIds(output, filteredFindings);
    if (unreferenced.length > 0) {
      console.warn(
        `odysseus analyze (structure pass): warning - ${unreferenced.length} finding(s) not referenced by any theme: ${unreferenced.join(', ')}`,
      );
    }

    const themes = applyStructureRankingRules(assignThemeKeys(output), filteredFindings, manifest);

    captureLlmCallTelemetry({
      kind: 'call-succeeded',
      pass: 'structure',
      model: OPENAI_MODEL,
      attemptCount: attempt,
      durationMs: Date.now() - startedAtMs,
      schemaValidFirstAttempt: attempt === 1,
    });
    return {
      themes,
      quickWins: output.quickWins,
      overallRisk: output.overallRisk,
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      unreferencedFindingCount: unreferenced.length,
    };
  }

  captureLlmCallTelemetry({
    kind: 'call-exhausted',
    pass: 'structure',
    model: OPENAI_MODEL,
    attemptCount: MAX_RETRIES + 1,
    durationMs: Date.now() - startedAtMs,
  });
  throw new Error(
    `odysseus analyze (structure pass): exhausted ${MAX_RETRIES + 1} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
