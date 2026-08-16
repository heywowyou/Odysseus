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
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../test-fixtures.js';

/** Same WCAG 2.2 AA tag set packages/scanner/src/axe.ts audits client
 *  sites against - the report should hold itself to the same bar it
 *  sells. */
const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

describe('the rendered report HTML passes its own axe-core audit', () => {
  it('has zero WCAG 2.2 AA violations on the real sas-fernande.fr French report', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSasFernandeManifest(),
      loadSasFernandeFindings(),
      loadSasFernandeAnalysis('fr'),
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
  }, 30_000);
});
