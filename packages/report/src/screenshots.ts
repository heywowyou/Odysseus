/**
 * Render-diff evidence selection for the report's section 08. Must reuse
 * selectPageDirsToKeep from @odysseus/scanner rather than reimplement the
 * selection rule, or this could pick a page the scan already pruned
 * (docs/normalization-rules.md section 6) - even though this module no
 * longer reads screenshot files off disk at all (see below), the same
 * pruning decision still governs which pages are legitimate evidence.
 *
 * docs/report-design-system.md section 3: section 08 carries no
 * screenshots, only two proportional bars (raw vs rendered visible-text
 * length) and a one-line caption, capped at the 3 worst pages by
 * missingPercent. Screenshots stay in the technical export; this module
 * used to downscale and embed raw.png/rendered.png as data URIs for the
 * report PDF, which is why it used to take a Browser - that whole path is
 * gone, on purpose, not simplified away by accident.
 */

import {
  RENDERDIFF_RULE_ID,
  type AuditManifest,
  type Finding,
  type RenderDiffResult,
} from '@odysseus/core';
import { selectPageDirsToKeep, type PrunePageInfo } from '@odysseus/scanner';
import { EVIDENCE_INCLUSION_THRESHOLD_PERCENT, EVIDENCE_MAX_RENDER_DIFF_PAGES } from './constants.js';

export interface RenderDiffEvidencePage {
  pageUrl: string;
  missingPercent: number;
  /** B17: the character counts behind missingPercent, so the evidence
   *  reads as a measurement rather than a bare percentage. null when this
   *  page's missingPercent fell below the render-diff *emission*
   *  threshold (20%, higher than this section's 5% *inclusion* threshold),
   *  since no text-missing-from-raw-html finding exists to read the
   *  lengths from in that band - never guessed, rendered as "not
   *  measured" instead. See docs/report-v2-refactor.md B17. */
  rawTextLength: number | null;
  renderedTextLength: number | null;
  /** The render-diff finding's representative element selector for this
   *  page, shown in the bar caption ("... sur {selector}"). Empty string
   *  when no such finding exists to read a selector from (same band as a
   *  null rawTextLength/renderedTextLength above). */
  selector: string;
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

/** rawEvidence is typed Record<string, unknown> on the locked Finding
 *  shape; perPage's real shape (docs/normalization-rules.md section 4)
 *  is a per-page RenderDiffResult keyed by URL, cast and guarded here
 *  rather than trusted. */
function renderDiffDetailsForPage(
  findings: readonly Finding[],
  pageUrl: string,
): { rawTextLength: number | null; renderedTextLength: number | null; selector: string } {
  const finding = findings.find(
    (f) => f.ruleId === RENDERDIFF_RULE_ID && f.pageUrls.includes(pageUrl),
  );
  const perPage = finding?.rawEvidence['perPage'] as Record<string, RenderDiffResult> | undefined;
  const entry = perPage?.[pageUrl];
  if (!entry) return { rawTextLength: null, renderedTextLength: null, selector: '' };
  return {
    rawTextLength: entry.rawTextLength,
    renderedTextLength: entry.renderedTextLength,
    selector: finding?.elements[0]?.selector ?? '',
  };
}

/** Doc §3: "3 worst pages by missingPct" - purely a ranking by
 *  missingPercent descending, no homepage tie-break (unlike the old
 *  screenshot-embedding version, which always led with the homepage: that
 *  made sense when a healthy homepage screenshot was still worth showing
 *  as a baseline, but a bar chart has nothing to show for a 0%-missing
 *  page, so there is no reason to force it to the front here). */
export function resolveRenderDiffEvidence(
  manifest: AuditManifest,
  findings: readonly Finding[],
): { pages: RenderDiffEvidencePage[]; totalEligible: number } {
  const candidates = prunePageInfoFromManifest(manifest);
  const keptDirs = selectPageDirsToKeep(candidates);

  const eligible = candidates
    .filter((page) => keptDirs.has(page.pageDir))
    .filter((page) => (page.missingPercent ?? 0) >= EVIDENCE_INCLUSION_THRESHOLD_PERCENT)
    .sort((a, b) => (b.missingPercent ?? 0) - (a.missingPercent ?? 0));

  const pages = eligible.slice(0, EVIDENCE_MAX_RENDER_DIFF_PAGES).map((page) => ({
    pageUrl: page.pageUrl,
    missingPercent: page.missingPercent ?? 0,
    ...renderDiffDetailsForPage(findings, page.pageUrl),
  }));

  return { pages, totalEligible: eligible.length };
}
