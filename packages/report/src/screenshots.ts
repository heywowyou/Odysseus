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
import { buildMissingPercentIndex, isLegalPage, isWrapperPage } from '@odysseus/llm';
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

/** Ranking key for the render-evidence sort (B6): a page with a known
 *  absolute character gap (renderedTextLength - rawTextLength) outranks
 *  one known only by missingPercent, so "a commercial page missing 4,000
 *  characters outranks a thin page missing 300" instead of the reverse.
 *  Pages in the 5-20% band (missingPercent known, no backing render-diff
 *  finding, per B17) fall back to missingPercent, ranked below every page
 *  with a known character count. */
function evidenceRankKey(
  missingPercent: number,
  detail: { rawTextLength: number | null; renderedTextLength: number | null },
): [number, number] {
  if (detail.rawTextLength !== null && detail.renderedTextLength !== null) {
    return [1, detail.renderedTextLength - detail.rawTextLength];
  }
  return [0, missingPercent];
}

/** Doc §3: "3 worst pages by missingPct," now ranked by absolute
 *  characters missing when known (B6) rather than by raw missingPercent -
 *  no homepage tie-break (unlike the old screenshot-embedding version,
 *  which always led with the homepage: that made sense when a healthy
 *  homepage screenshot was still worth showing as a baseline, but a bar
 *  chart has nothing to show for a 0%-missing page, so there is no reason
 *  to force it to the front here).
 *
 *  Wrapper and legal-noindex pages are excluded before ranking (B6): the
 *  render-evidence section used to rank them highest, since a third-party
 *  embed trivially scores ~100% missing, showing off the two pages the
 *  report's own Observations section already says don't need fixing.
 *  Reuses isWrapperPage/isLegalPage from @odysseus/llm - the same
 *  classification partitionFindings uses for Observations - rather than a
 *  second, independently-maintained predicate. */
export function resolveRenderDiffEvidence(
  manifest: AuditManifest,
  findings: readonly Finding[],
): { pages: RenderDiffEvidencePage[]; totalEligible: number; wrapperOrLegalExcludedCount: number } {
  const candidates = prunePageInfoFromManifest(manifest);
  const keptDirs = selectPageDirsToKeep(candidates);
  const missingPercentByUrl = buildMissingPercentIndex(manifest);

  const kept = candidates.filter((page) => keptDirs.has(page.pageDir));
  const wrapperOrLegalExcludedCount = kept.filter(
    (page) => isWrapperPage(page.pageUrl, missingPercentByUrl) || isLegalPage(page.pageUrl),
  ).length;

  const eligible = kept
    .filter((page) => !isWrapperPage(page.pageUrl, missingPercentByUrl) && !isLegalPage(page.pageUrl))
    .filter((page) => (page.missingPercent ?? 0) >= EVIDENCE_INCLUSION_THRESHOLD_PERCENT)
    .map((page) => ({ page, detail: renderDiffDetailsForPage(findings, page.pageUrl) }))
    .sort((a, b) => {
      const [aTier, aValue] = evidenceRankKey(a.page.missingPercent ?? 0, a.detail);
      const [bTier, bValue] = evidenceRankKey(b.page.missingPercent ?? 0, b.detail);
      return bTier - aTier || bValue - aValue;
    });

  const pages = eligible.slice(0, EVIDENCE_MAX_RENDER_DIFF_PAGES).map(({ page, detail }) => ({
    pageUrl: page.pageUrl,
    missingPercent: page.missingPercent ?? 0,
    ...detail,
  }));

  return { pages, totalEligible: eligible.length, wrapperOrLegalExcludedCount };
}
