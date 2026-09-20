import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, FindingsProvenance } from '@odysseus/core';
import { FINDINGS_SCHEMA_VERSION } from '@odysseus/core';
import { buildRenderBundle } from './render-bundle.js';
import {
  RENDER_BUNDLE_FILES,
  readRenderBundleDir,
  writeRenderBundleDir,
} from './render-bundle-files.js';
import type { StoredAnalysis } from './types.js';

const provenance: FindingsProvenance = {
  findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
  normalizationFingerprint: 'fingerprint',
  findingsDigest: `sha256:${'a'.repeat(64)}`,
};

const manifest = {
  auditId: 'audit-1',
  siteUrl: 'https://example.test/',
} as unknown as AuditManifest;
const findings: Finding[] = [];

const analysis = {
  analysisId: 'analysis-1',
  auditId: 'audit-1',
  language: 'fr',
  model: 'test-model',
  temperature: 0,
  generatedAt: new Date('2026-09-17T10:59:25.000Z'),
  findingsProvenance: provenance,
  overallRisk: 'medium',
  executiveSummary: 'résumé',
  themes: [],
  quickWins: [],
  notes: '',
} as unknown as StoredAnalysis;

const bundle = buildRenderBundle({
  manifest,
  findings,
  analysis,
  findingsProvenance: provenance,
  renderInputs: { qualityLimitations: [] },
  rendererBuild: 'build-abc',
});

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-bundle-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('render bundle directory', () => {
  it('round-trips every member, with the analysis date usable by the template', async () => {
    const dir = path.join(await tempDir(), 'bundle-fr');
    await writeRenderBundleDir(dir, bundle);
    const read = await readRenderBundleDir(dir);

    expect(read.lineage).toEqual(bundle.lineage);
    expect(read.manifest).toEqual(bundle.manifest);
    expect(read.analysis.generatedAt).toBeInstanceOf(Date);
    expect(read.analysis.generatedAt.toISOString()).toBe('2026-09-17T10:59:25.000Z');
    expect(read.qualityLimitations).toEqual([]);
  });

  /** One file per member, named the way the audit directory names the same
   *  things, because the operator reads these while deciding what to correct. */
  it('unpacks the bundle into readable files rather than one blob', async () => {
    const dir = path.join(await tempDir(), 'bundle-fr');
    await writeRenderBundleDir(dir, bundle);

    expect((await fs.readdir(dir)).sort()).toEqual(
      Object.values(RENDER_BUNDLE_FILES).slice().sort(),
    );
  });

  it('writes client data owner-readable only, including over an earlier fetch', async () => {
    const dir = path.join(await tempDir(), 'bundle-fr');
    await fs.mkdir(dir, { recursive: true });
    const analysisFile = path.join(dir, RENDER_BUNDLE_FILES.analysis);
    await fs.writeFile(analysisFile, '{}', { mode: 0o644 });

    await writeRenderBundleDir(dir, bundle);

    for (const name of Object.values(RENDER_BUNDLE_FILES)) {
      const mode = (await fs.stat(path.join(dir, name))).mode & 0o777;
      expect(mode, name).toBe(0o600);
    }
  });
});
