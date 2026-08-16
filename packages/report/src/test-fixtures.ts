/**
 * Test-only loader for the real sas-fernande.fr reference data, used so
 * section-builder tests exercise real scanner/LLM output shapes rather
 * than hand-built stand-ins. Named without .test.ts/.spec.ts so Vitest's
 * glob (packages/**\/*.{test,spec}.ts) does not pick this up as a suite,
 * matching packages/core/src/normalize/fixtures.ts's convention.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditManifest, Finding, LlmOutput, ReportLanguage } from '@odysseus/core';
import type { StoredAnalysis } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SAS_FERNANDE_AUDIT_DIR = path.resolve(
  __dirname,
  '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z',
);

const ANALYSIS_FILENAMES: Record<ReportLanguage, string> = {
  fr: '2026-08-02T18-28-34Z-fr.json',
  en: '2026-08-02T18-30-16Z-en.json',
};

export async function loadSasFernandeManifest(): Promise<AuditManifest> {
  const raw = await fs.readFile(path.join(SAS_FERNANDE_AUDIT_DIR, 'manifest.json'), 'utf-8');
  return JSON.parse(raw) as AuditManifest;
}

export async function loadSasFernandeFindings(): Promise<Finding[]> {
  const raw = await fs.readFile(path.join(SAS_FERNANDE_AUDIT_DIR, 'findings.json'), 'utf-8');
  return JSON.parse(raw) as Finding[];
}

export async function loadSasFernandeAnalysis(language: ReportLanguage): Promise<StoredAnalysis> {
  const raw = await fs.readFile(
    path.join(SAS_FERNANDE_AUDIT_DIR, 'analyses', ANALYSIS_FILENAMES[language]),
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
