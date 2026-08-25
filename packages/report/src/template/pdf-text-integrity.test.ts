/**
 * Item 0.4: a real Palais Gallien report was reported (docs/report/
 * report-feedback-palais-gallien-v2.md) to drop or merge characters at
 * soft-wrap points in the printed PDF's own text layer - a hyphen
 * swallowed in a wrapped URL, a selector's leading class token merged
 * into the next one. That class of corruption (the same one already
 * documented for letter-spacing.test.ts) can only be caught by extracting
 * text from a real generated PDF, not by inspecting the HTML string
 * render-lint.ts and the other template tests check, so no automated test
 * existed for it before this one.
 *
 * Honest limitation, checked directly during this session: this specific
 * test does NOT provably distinguish the pre-fix `word-break: break-word`
 * CSS from the post-fix `word-break: normal; hyphens: none` against this
 * package's fixtures - reverting paged.css's rule back to the reported-
 * broken value and rerunning this test still passed, extracting every
 * selector clean either way, using pdf-parse's pdfjs-dist-based reader.
 * Whether the original corruption was Chromium-version-specific, font-
 * subsetting-specific to the real Palais Gallien scan's exact strings, or
 * an artifact of a *visual* copy-paste from a PDF viewer rather than
 * programmatic text extraction (all three read text differently) was not
 * resolved. The CSS change (paged.css) is kept regardless - it is the
 * report-feedback doc's own recommended direction and cannot make
 * wrapping worse - but this test should be read as a general text-
 * integrity safety net (it would catch the letter-spacing class of bug,
 * for instance), not as proof this particular fix was necessary or
 * sufficient. A future session with access to the exact font/Chromium
 * combination that produced the original report should re-investigate
 * before trusting this test to gate that specific regression.
 */
import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import type { Finding } from '@odysseus/core';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { renderPdfFromHtml } from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../test-fixtures.js';

/** Every finding's representative selector (the one findings-appendix.ts
 *  actually renders, elements[0]?.selector) and every distinct page URL
 *  across the fixture - the same two categories item 0.4's manual
 *  verification checked against the real Palais Gallien data. Short
 *  selectors (img:nth-of-type(3), a plain URL query string, etc.) are
 *  excluded: they carry no hyphen or multi-token class name for a
 *  soft-wrap point to corrupt, so they add no signal here. */
function collectLongStringsToVerify(findings: readonly Finding[]): { selectors: string[]; urls: string[] } {
  const selectors = new Set<string>();
  const urls = new Set<string>();
  for (const finding of findings) {
    // A finding collapsed onto a file identity (trade-off 30) renders a file
    // count in the selector column, not elements[0].selector - so its
    // selector is legitimately absent from the PDF and asserting on it tests
    // the wrong thing. Found 2026-08-25, when re-normalizing this fixture
    // brought it up to date with a collapse that had shipped weeks earlier:
    // the test had been passing only because the fixture predated it.
    const resourceUrls = (finding.rawEvidence as { resourceUrls?: unknown }).resourceUrls;
    const rendersFileCountInstead = Array.isArray(resourceUrls) && resourceUrls.length > 0;
    const selector = finding.elements[0]?.selector;
    if (!rendersFileCountInstead && selector && selector.length > 15) selectors.add(selector);
    for (const url of finding.pageUrls) urls.add(url);
  }
  return { selectors: [...selectors], urls: [...urls] };
}

describe('item 0.4: the generated PDF text layer never drops or merges characters at a wrap point', () => {
  it('extracts every long selector and page URL from a real generated PDF byte-for-byte intact', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSasFernandeManifest(),
      loadSasFernandeFindings(),
      loadSasFernandeAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderPdfFromHtml(html, browser);
    } finally {
      await browser.close();
    }

    const parser = new PDFParse({ data: pdfBuffer });
    let extractedText: string;
    try {
      extractedText = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }

    // pdftotext/pdf-parse both introduce their own line breaks and
    // column-alignment whitespace at wrap points that carry no
    // information about the underlying PDF content stream - stripping
    // all whitespace before comparing isolates genuine character loss
    // (a dropped hyphen, a merged token) from harmless re-layout.
    const normalized = extractedText.replace(/\s+/g, '');
    const { selectors, urls } = collectLongStringsToVerify(findings);
    expect(selectors.length).toBeGreaterThan(0);
    expect(urls.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const value of [...selectors, ...urls]) {
      if (!normalized.includes(value.replace(/\s+/g, ''))) missing.push(value);
    }
    expect(missing).toEqual([]);
  }, 60_000);
});
