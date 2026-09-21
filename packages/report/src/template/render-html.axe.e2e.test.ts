/**
 * E35/R8: an accessibility audit tool that fails its own audit is not a
 * product. axe-core and Playwright are already dependencies (of
 * packages/scanner and now this package); this is the one test that
 * actually points them at the report's own rendered HTML. Needs real
 * Chromium, so it carries the *.e2e.test.ts name and runs with the e2e
 * project while staying next to render-html.ts.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';
import type { Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../types.js';

/** Same WCAG 2.2 AA tag set packages/scanner/src/axe.ts audits client
 *  sites against - the report should hold itself to the same bar it
 *  sells. */
const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

describe('the rendered report HTML passes its own axe-core audit', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('has zero WCAG 2.2 AA violations on both themes of the real small-site.test French report', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    for (const theme of ['dark', 'light'] as const) {
      const html = await renderHtml({
        manifest,
        findings,
        analysis,
        renderDiffEvidencePages,
        theme,
      });
      await expectReportAxe(browser, html, theme);
    }
    // Measured at ~28s on an idle machine, so the pair gets a 120s budget.
  }, 120_000);

  /**
   * The small-site fixture predates milestone 8.6 and contains no
   * privacy-category finding, so the run above never renders the
   * 'privacy' colour pairing added 2026-08-24. This second run reclassifies
   * one internally consistent theme and its findings in the committed fixture
   * so the palette is exercised without relying on an operator's local scan.
   */
  it('has zero WCAG 2.2 AA violations on both themes of a de-identified report containing a privacy theme', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { findings: privacyFindings, analysis: privacyAnalysis } = withPrivacyTheme(
      findings,
      analysis,
    );
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, privacyFindings);

    for (const theme of ['dark', 'light'] as const) {
      const html = await renderHtml({
        manifest,
        findings: privacyFindings,
        analysis: privacyAnalysis,
        renderDiffEvidencePages,
        theme,
      });
      expect(html).toContain('style="background:#282927;color:#e5c07b"');
      await expectReportAxe(browser, html, `privacy ${theme}`);
    }
  }, 120_000);
});

async function expectReportAxe(browser: Browser, html: string, label: string): Promise<void> {
  // AxeBuilder requires a page created from a full BrowserContext (its
  // script-injection mechanism rejects a bare browser.newPage() page with
  // "Please use browser.newContext()".
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const results = await new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).analyze();

    if (results.violations.length > 0) {
      const summary = results.violations
        .map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}\n` +
            v.nodes
              .slice(0, 12)
              .map((node) => `    ${node.failureSummary}\n    ${node.html}`)
              .join('\n'),
        )
        .join('\n');
      throw new Error(`Report HTML failed its own axe-core audit (${label}):\n${summary}`);
    }
    expect(results.violations, label).toEqual([]);
  } finally {
    await context.close();
  }
}

function withPrivacyTheme(
  findings: Finding[],
  analysis: StoredAnalysis,
): { findings: Finding[]; analysis: StoredAnalysis } {
  const [firstTheme, ...remainingThemes] = analysis.themes;
  if (firstTheme === undefined) throw new Error('expected the fixture to contain a theme');

  const privacyFindingIds = new Set(firstTheme.findingIds);
  return {
    findings: findings.map((finding) =>
      privacyFindingIds.has(finding.findingId)
        ? { ...finding, category: 'privacy' as const }
        : finding,
    ),
    analysis: {
      ...analysis,
      themes: [{ ...firstTheme, category: 'privacy' as const }, ...remainingThemes],
    },
  };
}
