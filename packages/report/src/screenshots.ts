/**
 * Screenshot selection for the render-diff evidence section. Must reuse
 * selectPageDirsToKeep from @odysseus/scanner rather than reimplement the
 * selection rule, or the report will eventually ask for a screenshot the
 * scan already deleted (docs/normalization-rules.md section 6).
 *
 * pruneScreenshots itself is not called here: pruning already ran, and
 * deleted, at scan time. This only needs to know which pageDirs *should*
 * have survived, to read whatever is actually on disk for them.
 *
 * On top of that scan-time selection, a second, report-level filter (A8/B18)
 * drops any pair below EVIDENCE_INCLUSION_THRESHOLD_PERCENT before
 * embedding: a healthy page kept on disk because it's the homepage is
 * still not evidence of anything, and full-resolution PNGs are downscaled
 * to a capped-width, capped-height JPEG before becoming a data URI.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import {
  RENDERDIFF_RULE_ID,
  type AuditManifest,
  type Finding,
  type RenderDiffResult,
} from '@odysseus/core';
import { selectPageDirsToKeep, type PrunePageInfo } from '@odysseus/scanner';
import {
  EVIDENCE_INCLUSION_THRESHOLD_PERCENT,
  EVIDENCE_JPEG_QUALITY,
  EVIDENCE_MAX_HEIGHT_PX,
  EVIDENCE_MAX_WIDTH_PX,
} from './constants.js';

export interface RenderDiffEvidencePage {
  pageUrl: string;
  missingPercent: number | undefined;
  isHomepage: boolean;
  /** null when the screenshot was pruned, or the page never produced one
   *  (e.g. a render-diff error). The template must render an explicit
   *  "no screenshot available" state, never a broken <img>. */
  rawDataUri: string | null;
  renderedDataUri: string | null;
  /** B17: the character counts behind missingPercent, so the evidence
   *  reads as a measurement rather than a bare percentage. null when this
   *  page's missingPercent fell below the render-diff *emission*
   *  threshold (20%, higher than this section's 5% *inclusion* threshold),
   *  since no text-missing-from-raw-html finding exists to read the
   *  lengths from in that band - never guessed, rendered as "not
   *  measured" instead. See docs/report-v2-refactor.md B17. */
  rawTextLength: number | null;
  renderedTextLength: number | null;
}

/** Mirrors packages/cli/src/commands/audit.ts's prunePageInfoFromManifest
 *  exactly: same derivation, so the kept set computed here matches what
 *  was actually kept on disk at scan time. Not imported from cli, since
 *  cli depends on report's sibling packages, not the other way round;
 *  this is a 6-line pure mapping, not the selection algorithm itself. */
function prunePageInfoFromManifest(manifest: AuditManifest): PrunePageInfo[] {
  return manifest.pages
    .filter((page): page is typeof page & { pageDir: string } => page.pageDir !== undefined)
    .map((page) => ({
      pageUrl: page.url,
      pageDir: page.pageDir,
      missingPercent: page.renderDiffMissingPercent,
      isHomepage: page.url === manifest.crawl.startUrl,
    }));
}

/** Runs entirely inside the Chromium page: decodes the PNG, draws it to a
 *  canvas capped at EVIDENCE_MAX_WIDTH_PX wide (never upscaled) and
 *  EVIDENCE_MAX_HEIGHT_PX tall (a canvas simply clips content drawn
 *  beyond its own height, which crops the bottom off a tall strip rather
 *  than needing a separate crop step), and exports JPEG at
 *  EVIDENCE_JPEG_QUALITY. No image-processing dependency: this package
 *  already launches Chromium for PDF rendering, so the same browser does
 *  the resize. */
async function downscaleScreenshot(browser: Browser, pngBuffer: Buffer): Promise<string> {
  const page = await browser.newPage();
  try {
    const pngDataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    return await page.evaluate(
      async ({ src, maxWidth, maxHeight, quality }) => {
        const img = new Image();
        img.src = src;
        await img.decode();

        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const width = Math.round(img.naturalWidth * scale);
        const height = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.min(height, maxHeight);

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('odysseus report: 2d canvas context unavailable for screenshot downscale');
        ctx.drawImage(img, 0, 0, width, height);

        return canvas.toDataURL('image/jpeg', quality);
      },
      { src: pngDataUri, maxWidth: EVIDENCE_MAX_WIDTH_PX, maxHeight: EVIDENCE_MAX_HEIGHT_PX, quality: EVIDENCE_JPEG_QUALITY },
    );
  } finally {
    await page.close();
  }
}

async function readAndDownscale(browser: Browser, filePath: string): Promise<string | null> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return null;
  }
  return downscaleScreenshot(browser, buffer);
}

/** rawEvidence is typed Record<string, unknown> on the locked Finding
 *  shape; perPage's real shape (docs/normalization-rules.md section 4)
 *  is a per-page RenderDiffResult keyed by URL, cast and guarded here
 *  rather than trusted. */
function renderDiffLengthsForPage(
  findings: readonly Finding[],
  pageUrl: string,
): { rawTextLength: number | null; renderedTextLength: number | null } {
  const finding = findings.find(
    (f) => f.ruleId === RENDERDIFF_RULE_ID && f.pageUrls.includes(pageUrl),
  );
  const perPage = finding?.rawEvidence['perPage'] as Record<string, RenderDiffResult> | undefined;
  const entry = perPage?.[pageUrl];
  if (!entry) return { rawTextLength: null, renderedTextLength: null };
  return { rawTextLength: entry.rawTextLength, renderedTextLength: entry.renderedTextLength };
}

export async function resolveRenderDiffEvidence(
  manifest: AuditManifest,
  auditDir: string,
  findings: readonly Finding[],
  browser: Browser,
): Promise<RenderDiffEvidencePage[]> {
  const candidates = prunePageInfoFromManifest(manifest);
  const keptDirs = selectPageDirsToKeep(candidates);

  const kept = candidates
    .filter((page) => keptDirs.has(page.pageDir))
    .filter((page) => (page.missingPercent ?? 0) >= EVIDENCE_INCLUSION_THRESHOLD_PERCENT)
    .sort((a, b) => {
      if (a.isHomepage !== b.isHomepage) return a.isHomepage ? -1 : 1;
      return (b.missingPercent ?? 0) - (a.missingPercent ?? 0);
    });

  return Promise.all(
    kept.map(async (page) => {
      const pageDirPath = path.join(auditDir, page.pageDir);
      const [rawDataUri, renderedDataUri] = await Promise.all([
        readAndDownscale(browser, path.join(pageDirPath, 'raw.png')),
        readAndDownscale(browser, path.join(pageDirPath, 'rendered.png')),
      ]);
      const lengths = renderDiffLengthsForPage(findings, page.pageUrl);

      return {
        pageUrl: page.pageUrl,
        missingPercent: page.missingPercent,
        isHomepage: page.isHomepage,
        rawDataUri,
        renderedDataUri,
        ...lengths,
      };
    }),
  );
}
