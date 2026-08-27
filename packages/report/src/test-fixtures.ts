/**
 * Test-only loader for the committed small-site.fr reference snapshot,
 * used so section-builder tests exercise real scanner/LLM output shapes
 * rather than hand-built stand-ins. Named without .test.ts/.spec.ts so Vitest's
 * glob (packages/**\/*.{test,spec}.ts) does not pick this up as a suite,
 * matching packages/core/src/normalize/fixtures.ts's convention.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditManifest, Finding, LlmOutput, ReportLanguage } from '@odysseus/core';
import type { StoredAnalysis } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SMALL_SITE_AUDIT_DIR = path.resolve(
  __dirname,
  '../../../fixtures/test-audits/small-site',
);

/** The fixture follows the artifacts layout, `<timestamp>-<language>.json`,
 *  because report-env-loading.e2e.test.ts copies it and runs the real CLI
 *  against it, and the CLI resolves an analysis by that name. Resolve by
 *  suffix rather than pinning a filename that a regenerated fixture changes. */
async function latestAnalysisPath(dir: string, language: ReportLanguage): Promise<string> {
  const entries = await fs.readdir(dir);
  const matching = entries.filter((name) => name.endsWith(`-${language}.json`)).sort();
  const latest = matching.at(-1);
  if (latest === undefined) throw new Error(`No ${language} analysis under ${dir}`);
  return path.join(dir, latest);
}

export async function loadSmallSiteManifest(): Promise<AuditManifest> {
  const raw = await fs.readFile(path.join(SMALL_SITE_AUDIT_DIR, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as AuditManifest;
}

export async function loadSmallSiteFindings(): Promise<Finding[]> {
  const raw = await fs.readFile(path.join(SMALL_SITE_AUDIT_DIR, 'findings.json'), 'utf-8');
  return JSON.parse(raw) as Finding[];
}

export async function loadSmallSiteAnalysis(language: ReportLanguage): Promise<StoredAnalysis> {
  const raw = await fs.readFile(
    await latestAnalysisPath(path.join(SMALL_SITE_AUDIT_DIR, 'analyses'), language),
    'utf-8',
  );
  const parsed = JSON.parse(raw) as LlmOutput & {
    auditId: string;
    language: ReportLanguage;
    model: string;
    temperature: number;
    generatedAt: string;
  };
  return { ...parsed, generatedAt: new Date(parsed.generatedAt) };
}
