/**
 * Plan 070 calibration tool, not production code: for each named saved
 * audit it rebuilds the writing input exactly as the analysis stage does
 * (buildStageWritingInput), runs one fresh writing pass, then the critic and
 * its one targeted repair regardless of WRITING_CRITIC_ENABLED
 * (runCriticAndRepair), and records per-pass tokens, cost, and latency from
 * the LLM telemetry events. With --structure it also runs one fresh
 * structure pass first, for the plan's A0 cost baseline; the stored
 * structure document is still the one the writing input is built from, so
 * the writer sees the same themes production would reuse.
 *
 * Nothing is persisted to the audit, the database, or any report. The raw
 * register (every raised issue, the original and repaired text of each
 * flagged field) is written under the gitignored artifacts/ tree for the
 * operator to label; precision is decided by those labels, never by this
 * script.
 *
 * Run from the workspace root after `pnpm run build` (the interface
 * package resolves @odysseus/llm to its built output):
 *   set -a; . ./.env; set +a
 *   pnpm exec tsx packages/interface/src/pipeline/measure-writing-critic.ts \
 *     [--structure] <artifacts/<host>/<audit>> [...]
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AuditManifest, Finding, ObligationAssessment } from '@odysseus/core';
import { assertFindingsProvenance, buildFindingsProvenance } from '@odysseus/core';
import {
  analyzeStructure,
  analyzeWriting,
  buildFallbackSiteContext,
  buildStructureInput,
  configureLlmTelemetrySink,
  filterFindingsForLlm,
  listWritingProseFields,
  parseStructureDocument,
  partitionFindings,
  RecordingLlmTelemetrySink,
  runCriticAndRepair,
  type LlmCallTelemetryEvent,
  type SiteContextInput,
} from '@odysseus/llm';
import { buildStageWritingInput } from './analysis-stage.js';

/** GPT-5.6 Luna list price, USD per million tokens. */
const INPUT_USD_PER_MILLION = 0.2;
const OUTPUT_USD_PER_MILLION = 1.2;

interface PassMeasure {
  pass: string;
  kind: LlmCallTelemetryEvent['kind'];
  attemptCount: number;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
}

function measure(event: LlmCallTelemetryEvent, pass: string): PassMeasure {
  const tokens =
    event.kind === 'call-succeeded' && event.promptTokens !== undefined
      ? {
          promptTokens: event.promptTokens,
          completionTokens: event.completionTokens ?? 0,
          ...(event.reasoningTokens !== undefined
            ? { reasoningTokens: event.reasoningTokens }
            : {}),
          costUsd:
            (event.promptTokens * INPUT_USD_PER_MILLION +
              (event.completionTokens ?? 0) * OUTPUT_USD_PER_MILLION) /
            1_000_000,
        }
      : {};
  return {
    pass,
    kind: event.kind,
    attemptCount: event.attemptCount,
    durationMs: event.durationMs,
    ...tokens,
  };
}

/** Terminal events only, labelled in call order: the second writing event
 *  after a critic event is the repair. */
function labelPasses(events: readonly LlmCallTelemetryEvent[]): PassMeasure[] {
  let criticSeen = false;
  return events
    .filter((event) => event.kind !== 'call-rejected')
    .map((event) => {
      if (event.pass === 'review') {
        criticSeen = true;
        return measure(event, 'critic');
      }
      if (event.pass === 'writing') return measure(event, criticSeen ? 'repair' : 'writing');
      return measure(event, event.pass);
    });
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
}

async function latest(dir: string, suffix: string): Promise<string | undefined> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const name = entries
    .filter((entry) => entry.endsWith(suffix))
    .sort()
    .at(-1);
  return name === undefined ? undefined : path.join(dir, name);
}

async function measureAudit(auditDir: string, runStructure: boolean, outDir: string) {
  const manifest = await readJson<AuditManifest>(path.join(auditDir, 'manifest.json'));
  const allFindings = await readJson<Finding[]>(path.join(auditDir, 'findings.json'));
  const provenance = buildFindingsProvenance(allFindings);
  assertFindingsProvenance(manifest.findingsProvenance, provenance, 'legacy manifest');

  const analysesDir = path.join(auditDir, 'analyses');
  const structurePath = await latest(analysesDir, '-structure.json');
  const analysisPath = await latest(analysesDir, '-fr.json');
  if (structurePath === undefined || analysisPath === undefined) {
    throw new Error('no stored structure or French analysis');
  }
  const structureDoc = parseStructureDocument(await readJson(structurePath));
  assertFindingsProvenance(structureDoc.findingsProvenance, provenance, 'structure document');
  const stored = await readJson<{
    siteContext?: SiteContextInput;
    obligationAssessment?: ObligationAssessment;
  }>(analysisPath);
  if (stored.obligationAssessment === undefined) {
    throw new Error('stored French analysis has no obligation assessment');
  }

  const usedFallbackContext = stored.siteContext === undefined;
  const siteContext = stored.siteContext ?? buildFallbackSiteContext();
  const { forModel } = partitionFindings(filterFindingsForLlm(allFindings), manifest);

  const sink = new RecordingLlmTelemetrySink();
  configureLlmTelemetrySink(sink);

  if (runStructure) {
    await analyzeStructure(
      buildStructureInput(forModel, siteContext),
      forModel,
      usedFallbackContext,
      manifest,
    );
  }

  const writingInput = await buildStageWritingInput({
    auditDir,
    manifest,
    allFindings,
    forModel,
    structureThemes: structureDoc.themes,
    siteContext,
    language: 'fr',
    obligationAssessment: stored.obligationAssessment,
  });
  const expectedThemeKeys = structureDoc.themes.map((theme) => theme.themeKey);
  const written = await analyzeWriting(writingInput, expectedThemeKeys, usedFallbackContext);
  const critiqued = await runCriticAndRepair(
    writingInput,
    expectedThemeKeys,
    usedFallbackContext,
    written,
  );

  const before = new Map(listWritingProseFields(written.output).map((f) => [f.field, f.text]));
  const after = new Map(listWritingProseFields(critiqued.output).map((f) => [f.field, f.text]));
  const sidecar = critiqued.critic?.sidecar;
  const register = {
    auditDir,
    structurePath,
    themes: structureDoc.themes.length,
    findingsForModel: forModel.length,
    usedFallbackContext,
    passes: labelPasses(sink.events),
    record: critiqued.critic?.record,
    status: sidecar?.status,
    reason: sidecar?.reason,
    dropped: sidecar?.dropped,
    warnings: critiqued.sanitizationWarnings,
    issues: (sidecar?.issues ?? []).map((issue) => {
      const replacement = sidecar?.replacements.find((entry) => entry.field === issue.field);
      return {
        ...issue,
        original: before.get(issue.field),
        // null: the repair removed this action. Absent: not repaired.
        ...(replacement ? { repaired: replacement.after } : {}),
        label: null as 'real' | 'false-positive' | null,
      };
    }),
    // Every field of the report before and after, by path, so a reviewer
    // can confirm nothing outside the flagged fields moved.
    unflaggedFieldsChanged: [...before]
      .filter(([field, text]) => {
        if (sidecar?.repairedFields.includes(field) === true) return false;
        return after.get(field) !== text;
      })
      .map(([field]) => field),
  };

  const name = `${path.basename(path.dirname(auditDir))}__${path.basename(auditDir)}.json`;
  await fs.writeFile(path.join(outDir, name), JSON.stringify(register, null, 2));
  return register;
}

const args = process.argv.slice(2);
const runStructure = args.includes('--structure');
const auditDirs = args.filter((arg) => !arg.startsWith('--')).map((dir) => path.resolve(dir));
if (auditDirs.length === 0) {
  console.error('usage: measure-writing-critic.ts [--structure] <audit-dir> [...]');
  process.exit(2);
}

const outDir = path.resolve(
  'artifacts/writing-critic-calibration',
  new Date().toISOString().replace(/[:.]/gu, '-'),
);
await fs.mkdir(outDir, { recursive: true });

for (const auditDir of auditDirs) {
  try {
    const result = await measureAudit(auditDir, runStructure, outDir);
    const passes = result.passes
      .map(
        (p) =>
          `${p.pass}:${p.kind === 'call-succeeded' ? '' : `${p.kind} `}${p.promptTokens ?? '?'}in/${p.completionTokens ?? '?'}out ` +
          `$${p.costUsd?.toFixed(4) ?? '?'} ${(p.durationMs / 1000).toFixed(1)}s x${p.attemptCount}`,
      )
      .join(' | ');
    console.log(
      `${path.relative(process.cwd(), auditDir)}: status=${result.status} raised=${result.record?.issuesRaised} ` +
        `accepted=${result.record?.issuesAccepted} repaired=${result.record?.repairApplied}\n  ${passes}`,
    );
  } catch (error) {
    console.log(
      `${path.relative(process.cwd(), auditDir)}: skipped - ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
console.log(`Register: ${path.relative(process.cwd(), outDir)}`);
