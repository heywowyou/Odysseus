/**
 * Single implementation of "turn one page's raw scan result into the
 * portable scan.json shape and write it to disk", shared by write-audit.ts
 * (which writes every page's scan.json from an in-memory PageScanResult
 * array at the end of a run) and scan-site.ts (which, for the real
 * full-audit path, writes each page's scan.json as soon as that page
 * finishes, so the run's memory footprint doesn't grow with page count -
 * see issue #64).
 */

import * as fs from 'node:fs';
import path from 'node:path';
import type { PageScanResult } from '../scan-page.js';
import { buildPageDir } from './paths.js';
import { toAuditRelativeRefs } from './relativize.js';

export function buildScanJson(
  scanResult: PageScanResult,
  relativizedRenderDiff: PageScanResult['renderDiff'],
): PageScanResult {
  return {
    url: scanResult.url,
    ...(relativizedRenderDiff !== undefined ? { renderDiff: relativizedRenderDiff } : {}),
    ...(scanResult.renderDiffError !== undefined
      ? { renderDiffError: scanResult.renderDiffError }
      : {}),
    ...(scanResult.axe !== undefined ? { axe: scanResult.axe } : {}),
    ...(scanResult.axeError !== undefined ? { axeError: scanResult.axeError } : {}),
    ...(scanResult.lighthouse !== undefined ? { lighthouse: scanResult.lighthouse } : {}),
    ...(scanResult.lighthouseError !== undefined
      ? { lighthouseError: scanResult.lighthouseError }
      : {}),
    ...(scanResult.mentionsLegales !== undefined
      ? { mentionsLegales: scanResult.mentionsLegales }
      : {}),
    ...(scanResult.mentionsLegalesError !== undefined
      ? { mentionsLegalesError: scanResult.mentionsLegalesError }
      : {}),
    ...(scanResult.transactionalFlowEvidence !== undefined
      ? { transactionalFlowEvidence: scanResult.transactionalFlowEvidence }
      : {}),
    ...(scanResult.transactionalFlowRedirectChecks !== undefined
      ? { transactionalFlowRedirectChecks: scanResult.transactionalFlowRedirectChecks }
      : {}),
    ...(scanResult.transactionalFlowAmbiguities !== undefined
      ? { transactionalFlowAmbiguities: scanResult.transactionalFlowAmbiguities }
      : {}),
    ...(scanResult.headMetadata !== undefined ? { headMetadata: scanResult.headMetadata } : {}),
    ...(scanResult.headMetadataError !== undefined
      ? { headMetadataError: scanResult.headMetadataError }
      : {}),
    ...(scanResult.canonicalTarget !== undefined
      ? { canonicalTarget: scanResult.canonicalTarget }
      : {}),
    ...(scanResult.sitemapCheck !== undefined ? { sitemapCheck: scanResult.sitemapCheck } : {}),
    ...(scanResult.llmsTxtCheck !== undefined ? { llmsTxtCheck: scanResult.llmsTxtCheck } : {}),
    ...(scanResult.mixedContent !== undefined ? { mixedContent: scanResult.mixedContent } : {}),
    ...(scanResult.mixedContentError !== undefined
      ? { mixedContentError: scanResult.mixedContentError }
      : {}),
    ...(scanResult.keyboardNavigation !== undefined
      ? { keyboardNavigation: scanResult.keyboardNavigation }
      : {}),
    ...(scanResult.keyboardNavigationError !== undefined
      ? { keyboardNavigationError: scanResult.keyboardNavigationError }
      : {}),
    ...(scanResult.formErrorHandling !== undefined
      ? { formErrorHandling: scanResult.formErrorHandling }
      : {}),
    ...(scanResult.formErrorHandlingError !== undefined
      ? { formErrorHandlingError: scanResult.formErrorHandlingError }
      : {}),
    ...(scanResult.videoCaptions !== undefined ? { videoCaptions: scanResult.videoCaptions } : {}),
    ...(scanResult.videoCaptionsError !== undefined
      ? { videoCaptionsError: scanResult.videoCaptionsError }
      : {}),
    ...(scanResult.placeholderLabels !== undefined
      ? { placeholderLabels: scanResult.placeholderLabels }
      : {}),
    ...(scanResult.placeholderLabelsError !== undefined
      ? { placeholderLabelsError: scanResult.placeholderLabelsError }
      : {}),
    ...(scanResult.altText !== undefined ? { altText: scanResult.altText } : {}),
    ...(scanResult.altTextError !== undefined ? { altTextError: scanResult.altTextError } : {}),
    ...(scanResult.securityHeaders !== undefined
      ? { securityHeaders: scanResult.securityHeaders }
      : {}),
    ...(scanResult.cookieConsent !== undefined ? { cookieConsent: scanResult.cookieConsent } : {}),
    ...(scanResult.accessibilityStatement !== undefined
      ? { accessibilityStatement: scanResult.accessibilityStatement }
      : {}),
    ...(scanResult.napConsistency !== undefined
      ? { napConsistency: scanResult.napConsistency }
      : {}),
    ...(scanResult.reflow !== undefined ? { reflow: scanResult.reflow } : {}),
    ...(scanResult.htmlValidity !== undefined ? { htmlValidity: scanResult.htmlValidity } : {}),
    ...(scanResult.structuredData !== undefined
      ? { structuredData: scanResult.structuredData }
      : {}),
    ...(scanResult.structuredDataError !== undefined
      ? { structuredDataError: scanResult.structuredDataError }
      : {}),
    // Persisted so a resumed run can rebuild every finalizeLighthousePlan
    // input from disk (issue #124 / plan 035).
    ...(scanResult.checkOutcomes !== undefined ? { checkOutcomes: scanResult.checkOutcomes } : {}),
    ...(scanResult.renderedCostProfile !== undefined
      ? { renderedCostProfile: scanResult.renderedCostProfile }
      : {}),
    ...(scanResult.readiness !== undefined ? { readiness: scanResult.readiness } : {}),
    ...(scanResult.frames !== undefined ? { frames: scanResult.frames } : {}),
    ...(scanResult.structuralAnchor !== undefined
      ? { structuralAnchor: scanResult.structuralAnchor }
      : {}),
    ...(scanResult.acquisitionAttempts !== undefined
      ? { acquisitionAttempts: scanResult.acquisitionAttempts }
      : {}),
  };
}

export interface WrittenPageScanJson {
  pageDir: string;
  scanJson: PageScanResult;
}

/** Reads back a page's already-written scan.json, or undefined if none
 *  exists yet at that page's directory, or the file cannot be read or
 *  parsed. The undefined-on-corruption case is deliberate (issue #132): a
 *  scan.json truncated by a crash mid-write must degrade to "page pending
 *  re-scan" on the next resume, never throw out of the resume partition
 *  (scan-site.ts hands this reader to partitionPagesForResume as its
 *  readExisting callback, where one throw would poison every later resume
 *  attempt of the audit until a human deleted the file by hand). Used
 *  wherever a caller needs a page's full result but (issue #64) never
 *  retained it in memory - scan-site.ts's staged full-audit path re-reads
 *  a page's rendered-only scan.json before merging in its Lighthouse
 *  result, and write-audit.ts falls back to this when a visited page
 *  isn't in siteResult.pages. */
export function readPageScanJson(pagesDir: string, url: string): PageScanResult | undefined {
  const scanJsonPath = path.join(pagesDir, buildPageDir(url), 'scan.json');
  if (!fs.existsSync(scanJsonPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(scanJsonPath, 'utf-8')) as PageScanResult;
  } catch {
    return undefined;
  }
}

/**
 * Writes one page's scan.json into pagesDir/<slug>-<hash>/, relativizing
 * its render-diff screenshot refs against auditDir first. Synchronous
 * deliberately: see write-audit.ts's own doc comment on why the equivalent
 * write there never uses the async fs API (WSL2 io_uring writes have hung
 * forever on this exact kind of step).
 */
export function writePageScanJson(
  pagesDir: string,
  auditDir: string,
  scanResult: PageScanResult,
): WrittenPageScanJson {
  const pageDir = buildPageDir(scanResult.url);
  const pageDirPath = path.join(pagesDir, pageDir);
  fs.mkdirSync(pageDirPath, { recursive: true });

  const relativizedRenderDiff = scanResult.renderDiff
    ? toAuditRelativeRefs(scanResult.renderDiff, auditDir)
    : undefined;
  const scanJson = buildScanJson(scanResult, relativizedRenderDiff);
  // Temp-file write plus same-volume rename, matching crawl-checkpoint-io.ts
  // (issue #132): a run killed mid-write must never leave a truncated
  // scan.json at the final path, where it used to make every later resume
  // attempt of that audit throw until the file was removed by hand.
  const target = path.join(pageDirPath, 'scan.json');
  const temp = path.join(pageDirPath, '.scan.json.tmp');
  fs.writeFileSync(temp, JSON.stringify(scanJson, null, 2));
  fs.renameSync(temp, target);

  return { pageDir, scanJson };
}
