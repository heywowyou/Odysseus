/**
 * Every glyph the report prints must come from a face the report embeds.
 *
 * The PDF file check (pdf-integrity.ts) judges fonts by name, and a host
 * whose default `monospace` is DejaVu Sans Mono produces the same name as
 * the embedded face: a `<pre>` that fell back to the host font passed here
 * and failed in the production container, whose default is a CJK face.
 * Chromium's own record of the font that drew each text node carries an
 * `isCustomFont` flag, true only for an @font-face font, so this check
 * gives the same answer on every host.
 */
import { describe, expect, it } from 'vitest';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

/** Markup the small-site fixture does not reach on its own: a fix snippet's
 *  pre/code block, the other user-agent monospace elements, and characters
 *  outside Avenir Next that the mono face covers. */
const PROBE = `<section class="sheet" id="host-font-probe">
  <div class="theme-snippet"><pre><code>&lt;html lang="fr"&gt;</code></pre></div>
  <p><kbd>Tab</kbd> <samp>200 OK</samp> <code>h1</code></p>
  <p>16 490 ms → 2 500 ms ≤ 4 000 ms</p>
</section>`;

interface PlatformFont {
  familyName: string;
  isCustomFont: boolean;
  glyphCount: number;
}

describe('fonts that actually draw the report text', () => {
  it('draws every text node, fix snippets included, from an embedded face', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const report = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const html = report.replace('</body>', `${PROBE}</body>`);

    const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
    const hostFonts = new Map<string, string>();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });

      const textNodes: { nodeId: number; text: string }[] = [];
      const walk = (node: typeof root): void => {
        if (node.nodeType === 3 && node.nodeValue.trim() !== '')
          textNodes.push({ nodeId: node.nodeId, text: node.nodeValue.trim() });
        if (node.nodeName === 'STYLE' || node.nodeName === 'SCRIPT') return;
        for (const child of node.children ?? []) walk(child);
      };
      walk(root);
      expect(textNodes.length).toBeGreaterThan(100);

      for (const { nodeId, text } of textNodes) {
        const { fonts } = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })) as {
          fonts: PlatformFont[];
        };
        for (const font of fonts)
          if (!font.isCustomFont && font.glyphCount > 0)
            hostFonts.set(font.familyName, hostFonts.get(font.familyName) ?? text.slice(0, 80));
      }
      const probe = (
        await cdp.send('CSS.getPlatformFontsForNode', {
          nodeId: textNodes.find((n) => n.text.startsWith('<html'))!.nodeId,
        })
      ).fonts as PlatformFont[];
      expect(probe.map((f) => f.isCustomFont)).toEqual([true]);
    } finally {
      await browser.close();
    }
    expect(Object.fromEntries(hostFonts)).toEqual({});
  }, 120_000);
});
