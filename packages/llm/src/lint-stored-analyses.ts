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

interface StoredAnalysisShape {
  executiveSummary?: unknown;
  notes?: unknown;
  themes?: Array<{ title?: unknown; businessImpact?: unknown; recommendedActions?: unknown }>;
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
  const perFile: string[] = [];

  for await (const { file, language } of findAnalysisFiles(artifactsDir)) {
    filesScanned += 1;
    const analysis: StoredAnalysisShape = JSON.parse(await readFile(file, 'utf8'));
    const fields = proseFieldsOf(analysis);

    const wcag = findWcagCitationViolationsInFields(fields);
    const business = findBusinessClaimViolationsInFields(fields, language as ReportLanguage);
    totals.wcag += wcag.length;
    totals.business += business.length;

    if (wcag.length > 0 || business.length > 0) {
      const lines = [
        `${path.relative(artifactsDir, file)} (${language}):`,
        ...wcag.map((v) => `  [wcag-citation] ${v.field} matched "${v.matched}"`),
        ...business.map((v) => `  [business-claim] ${v.field} matched "${v.matched}"`),
      ];
      perFile.push(lines.join('\n'));
    }
  }

  console.log(perFile.join('\n\n'));
  console.log(`\nScanned ${filesScanned} analysis files under ${artifactsDir}`);
  console.log(`WCAG citation violations: ${totals.wcag}`);
  console.log(`Business claim violations: ${totals.business}`);
}

void main();
