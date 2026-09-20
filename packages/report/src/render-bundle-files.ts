/**
 * Plan 072: a render bundle on the operator's disk.
 *
 * The HTTP route serves one JSON document. On disk it is unpacked into one
 * file per member, named the way the audit directory names the same things,
 * because the operator reads these: the point of keeping the full working set
 * is that a finalization can be picked up, audited, or diffed against the
 * next regeneration months later. `analysis.json` next to `analysis.json` of
 * the following run is a readable diff; one blob is not.
 *
 * The directory is the single source of truth once written - there is no
 * combined copy beside it to fall out of step with it.
 *
 * Every file is client data and is written 0600, matching
 * scripts/fetch-client-report.mjs.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RenderBundle, RenderBundleLineage, ReportRenderInputs } from './render-bundle.js';
import type { StoredAnalysis } from './types.js';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export const RENDER_BUNDLE_FILES = {
  lineage: 'lineage.json',
  manifest: 'manifest.json',
  findings: 'findings.json',
  analysis: 'analysis.json',
  /** Everything `generateReportPdf` takes beyond those three: manual fields,
   *  the grade override, the preparation preview, the re-audit delta, the
   *  evidence limitations and the obligation assessment. */
  renderInputs: 'render-inputs.json',
} as const;

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: FILE_MODE });
  // writeFile's mode applies only when it creates the file, so an existing
  // one keeps whatever it had. Re-fetching into a working set must not
  // silently leave a client's report readable.
  await fs.chmod(file, FILE_MODE);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
}

export async function writeRenderBundleDir(dir: string, bundle: RenderBundle): Promise<void> {
  const { lineage, manifest, findings, analysis, ...renderInputs } = bundle;
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
  await writeJson(path.join(dir, RENDER_BUNDLE_FILES.lineage), lineage);
  await writeJson(path.join(dir, RENDER_BUNDLE_FILES.manifest), manifest);
  await writeJson(path.join(dir, RENDER_BUNDLE_FILES.findings), findings);
  await writeJson(path.join(dir, RENDER_BUNDLE_FILES.analysis), analysis);
  await writeJson(path.join(dir, RENDER_BUNDLE_FILES.renderInputs), renderInputs);
}

/**
 * Reads a bundle directory back.
 *
 * `analysis.generatedAt` is revived for the same reason `parseRenderBundle`
 * revives it: the legal-exposure section measures elapsed time from it with
 * getFullYear/getMonth/getDate, and a string there is a TypeError at render
 * time. The manifest and findings stay as JSON gives them, because that is
 * exactly what the server renders from.
 */
export async function readRenderBundleDir(dir: string): Promise<RenderBundle> {
  const [lineage, manifest, findings, analysis, renderInputs] = await Promise.all([
    readJson<RenderBundleLineage>(path.join(dir, RENDER_BUNDLE_FILES.lineage)),
    readJson<RenderBundle['manifest']>(path.join(dir, RENDER_BUNDLE_FILES.manifest)),
    readJson<RenderBundle['findings']>(path.join(dir, RENDER_BUNDLE_FILES.findings)),
    readJson<StoredAnalysis>(path.join(dir, RENDER_BUNDLE_FILES.analysis)),
    readJson<ReportRenderInputs>(path.join(dir, RENDER_BUNDLE_FILES.renderInputs)),
  ]);
  return {
    ...renderInputs,
    lineage,
    manifest,
    findings,
    analysis: { ...analysis, generatedAt: new Date(analysis.generatedAt) },
  };
}
