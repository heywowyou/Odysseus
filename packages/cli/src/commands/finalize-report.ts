/**
 * `odysseus report:finalize` (Plan 072): renders the operator's finalized
 * client report on this machine, from a bundle fetched off the dashboard plus
 * an override file of the corrections the operator wrote after reading the
 * generated PDF front to back.
 *
 * It opens no database connection and constructs no provider client. That is
 * the point rather than an incidental property: the finalization runs against
 * whatever local code is checked out, typically newer than the VPS build that
 * rendered the hosted PDF, and it must not be able to reach into production
 * state to do it. `finalize-report.no-infrastructure.test.ts` pins it.
 *
 * Exit code 1 on any refusal, with the reason on stderr, so the skill's
 * workflow stops instead of uploading something nobody checked.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { parseWritingOverrideFile } from '@odysseus/llm';
import {
  applyOverridesToBundle,
  generateReportPdf,
  readRenderBundleDir,
  REPORT_TEMPLATE_VERSION,
  reportPageCountWarning,
} from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';

interface FinalizeOptions {
  bundle: string;
  overrides?: string;
  out: string;
}

function fail(message: string): never {
  console.error(message);
  process.exitCode = 1;
  throw new FinalizeRefused();
}

/** Thrown after the reason is printed, so Commander's action rejects without
 *  printing a stack over a message the operator is meant to read. */
class FinalizeRefused extends Error {}

export async function finalizeReport(options: FinalizeOptions): Promise<void> {
  const bundleDir = path.resolve(options.bundle);
  const bundle = await readRenderBundleDir(bundleDir);

  let rendered = bundle;
  let overrideCount = 0;
  if (options.overrides !== undefined) {
    const file = parseWritingOverrideFile(
      JSON.parse(await fs.readFile(path.resolve(options.overrides), 'utf-8')),
    );
    const result = applyOverridesToBundle(bundle, file);
    if (result.status === 'refused') {
      fail(`odysseus report:finalize refused this override file.\n\n${result.reason}`);
    }
    rendered = result.bundle;
    overrideCount = file.overrides.length;
    if (result.preExistingGuardFailures.length > 0) {
      // Not a refusal: the delivered report already carried these, and
      // refusing would leave the operator unable to correct the very text
      // that trips them. Printed so they are not discovered by the client.
      console.warn(
        `warning: the generated prose already failed guard(s) this correction does not fix: ` +
          `${result.preExistingGuardFailures.join(', ')}`,
      );
    }
  }

  const { lineage, manifest, findings, analysis, obligationAssessment, ...renderInputs } = rendered;
  const { pdf, pageCount } = await generateReportPdf({
    // Kept only because the render input contract still names it; the
    // template reads nothing off disk, which is what makes this command
    // possible at all. Pointed at the bundle so a future reader of a stack
    // trace lands somewhere real.
    auditDir: bundleDir,
    manifest,
    findings,
    analysis: {
      ...analysis,
      ...(obligationAssessment !== undefined ? { obligationAssessment } : {}),
    },
    renderMetadata: {
      reportId: `${lineage.analysisId}-final`,
      renderedAt: new Date(),
      rendererBuild: readOdysseusBuildId(),
      templateVersion: REPORT_TEMPLATE_VERSION,
    },
    ...renderInputs,
  });

  const out = path.resolve(options.out);
  await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
  await fs.writeFile(out, pdf, { mode: 0o600 });
  await fs.chmod(out, 0o600);

  const warning = reportPageCountWarning(pageCount);
  console.log(
    `${lineage.language.toUpperCase()} ${lineage.auditId}: ${overrideCount} correction(s), ` +
      `${pageCount} pages -> ${out}`,
  );
  if (warning !== undefined) {
    console.warn(
      `warning: ${warning.pageCount} pages exceeds the ${warning.threshold}-page review threshold`,
    );
  }
  console.log(
    'Upload it with scripts/upload-finalized-report.mjs; the dashboard refuses it if the ' +
      'analysis has been regenerated since this bundle was fetched.',
  );
}

export function registerFinalizeReportCommand(program: Command): void {
  program
    .command('report:finalize')
    .description(
      "Render the operator's finalized client report from a fetched bundle and an override file",
    )
    .requiredOption('--bundle <dir>', 'bundle directory fetched from the dashboard')
    .option('--overrides <file>', 'override file of the corrections to apply')
    .requiredOption('--out <pdf>', 'where to write the finalized PDF')
    .action(async (options: FinalizeOptions) => {
      try {
        await finalizeReport(options);
      } catch (error) {
        if (error instanceof FinalizeRefused) return;
        throw error;
      }
    });
}
