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

const TEST_AUDITS_ROOT = path.resolve(__dirname, '../../../fixtures/test-audits');
const COMMITTED_TEST_AUDITS = ['small-site', 'multi-page', 'large-rule-families'] as const;

const SMALL_SITE_AUDIT_DIR = path.resolve(TEST_AUDITS_ROOT, 'small-site');

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

/** small-site's only findings confined to its legal page are accessibility
 *  failures, which stay ranked. Tests of the legal-page diversion itself
 *  need a search finding there, so this retags the legal-page
 *  link-in-text-block finding as a crawlable-anchors finding. It keeps its id,
 *  so the fixture analysis, which never saw it, stays consistent. */
export async function loadSmallSiteFindingsWithLegalSearchFinding(): Promise<Finding[]> {
  const findings = await loadSmallSiteFindings();
  const index = findings.findIndex(
    (finding) =>
      finding.ruleId === 'link-in-text-block' &&
      finding.pageUrls.every((url) => url.includes('/mentions-legales/')),
  );
  const legalFinding = findings[index];
  if (legalFinding === undefined) throw new Error('small-site has no legal-page finding');
  findings[index] = {
    ...legalFinding,
    source: 'lighthouse',
    ruleId: 'crawlable-anchors',
    category: 'seo',
    wcagCriteria: [],
  };
  return findings;
}

/** Every rule observed across the committed, de-identified reference audits.
 *  Coverage tests share this loader so none can quietly fall back to a local
 *  gitignored artifacts tree. */
export async function loadObservedFixtureRuleIds(): Promise<Set<string>> {
  const fixtureFindings = await Promise.all(
    COMMITTED_TEST_AUDITS.map(async (auditName) => {
      const raw = await fs.readFile(
        path.join(TEST_AUDITS_ROOT, auditName, 'findings.json'),
        'utf-8',
      );
      return JSON.parse(raw) as Finding[];
    }),
  );

  return new Set(fixtureFindings.flatMap((findings) => findings.map((finding) => finding.ruleId)));
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
