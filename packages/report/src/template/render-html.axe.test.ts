/**
 * E35/R8: an accessibility audit tool that fails its own audit is not a
 * product. axe-core and Playwright are already dependencies (of
 * packages/scanner and now this package); this is the one test that
 * actually points them at the report's own rendered HTML. Needs real
 * Chromium, matching this repo's *.e2e.test.ts convention, though it
 * isn't named that way since it belongs next to render-html.ts rather
 * than in the browser-heavy screenshots tests.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { describe, expect, it } from 'vitest';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAudit, type AuditManifest, type NormalizePageInput } from '@odysseus/core';
import type { StoredAnalysis } from '../types.js';

/** Same WCAG 2.2 AA tag set packages/scanner/src/axe.ts audits client
 *  sites against - the report should hold itself to the same bar it
 *  sells. */
const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

describe('the rendered report HTML passes its own axe-core audit', () => {
  it('has zero WCAG 2.2 AA violations on the real small-site.test French report', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    const { browser } = await launchBrowser();
    try {
      // AxeBuilder requires a page created from a full BrowserContext
      // (its script-injection mechanism rejects a bare browser.newPage()
      // page with "Please use browser.newContext()").
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const results = await new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).analyze();

      if (results.violations.length > 0) {
        const summary = results.violations
          .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}`)
          .join('\n');
        throw new Error(`Report HTML failed its own axe-core audit:\n${summary}`);
      }
      expect(results.violations).toEqual([]);
    } finally {
      await browser.close();
    }
    // Measured at ~28s on an idle machine, so a 30s budget left a 7 percent
    // margin and this test failed as a timeout, not a violation, whenever
    // anything else was using the CPU (a concurrent scan, a full suite run).
    // Matched to the 60s the second case in this file already uses.
  }, 60_000);

  /**
   * The small-site fixture predates milestone 8.6 and contains no
   * privacy-category finding, so the run above never renders the
   * 'privacy' colour pairing added 2026-08-24 - it would pass whatever
   * hex that pairing used. This second run points the same audit at a
   * real scan that does contain them (four security-header findings,
   * moved from 'seo' to 'privacy' with the category), which is what
   * actually confirms #e5c07b on #332a19 clears WCAG 1.4.3 rather than
   * only the arithmetic saying so.
   */
  it('has zero WCAG 2.2 AA violations on a real report containing privacy findings', async () => {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const auditDir = path.join(
      moduleDir,
      '../../../../artifacts/www.hotel-palais-gallien-bordeaux.com/2026-08-22T16-31-02Z',
    );
    const manifest = JSON.parse(
      readFileSync(path.join(auditDir, 'manifest.json'), 'utf-8'),
    ) as AuditManifest;
    // Re-normalized from the stored per-page scan.json rather than read
    // from the stored findings.json, exactly the way `normalize <dir>`
    // re-runs offline. The committed findings.json predates the 'privacy'
    // category and still tags the security-header rules 'seo'; running
    // the real normalizer is what makes this a test of current behaviour
    // instead of a test of a frozen snapshot, and it needs no re-scan.
    const findings = normalizeAudit({
      auditId: manifest.auditId,
      startedAt: new Date(manifest.startedAt),
      pages: readdirSync(path.join(auditDir, 'pages'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(auditDir, 'pages', entry.name, 'scan.json'))
        .filter((file) => existsSync(file))
        .map((file) => JSON.parse(readFileSync(file, 'utf-8')) as NormalizePageInput),
      ...(manifest.translationClusters !== undefined
        ? { translationClusters: manifest.translationClusters }
        : {}),
    });
    const rawAnalysis = JSON.parse(
      readFileSync(path.join(auditDir, 'analyses', readdirFirstAnalysis(auditDir)), 'utf-8'),
    ) as StoredAnalysis;
    // JSON.parse leaves generatedAt a string; the store's own reader
    // revives it. renderLegalExposure does date arithmetic on it.
    const analysis: StoredAnalysis = {
      ...rawAnalysis,
      generatedAt: new Date(rawAnalysis.generatedAt),
    };

    expect(
      findings.some((f) => f.category === 'privacy'),
      'fixture no longer contains a privacy finding',
    ).toBe(true);

    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    const { browser } = await launchBrowser();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const results = await new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).analyze();

      if (results.violations.length > 0) {
        const summary = results.violations
          .map(
            (v) =>
              `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}\n` +
              v.nodes.map((n) => `    ${n.failureSummary}\n    ${n.html}`).join('\n'),
          )
          .join('\n');
        throw new Error(`Report HTML failed its own axe-core audit:\n${summary}`);
      }
      expect(results.violations).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 60_000);
});

function readdirFirstAnalysis(auditDir: string): string {
  const files = readdirSync(path.join(auditDir, 'analyses'))
    .filter((f) => f.endsWith('-fr.json'))
    .sort();
  if (files.length === 0) throw new Error(`no French analysis in ${auditDir}/analyses`);
  return files[files.length - 1]!;
}
