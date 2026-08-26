import { LEGAL_PATH_PATTERN, type AuditManifest, type Finding } from '@odysseus/core';

/** A page whose raw HTML is missing this much of its rendered content is
 *  treated as a third-party embed wrapper (a Facebook/Instagram page
 *  embed, for example), not a page whose own content can be improved.
 *  Higher than the render-diff emission threshold (20%, in @odysseus/core)
 *  deliberately: most client-rendered pages are not wrapper pages, this
 *  only catches the near-total case. See docs/report-v2-refactor.md A1-A3. */
export const WRAPPER_PAGE_MISSING_PERCENT_THRESHOLD = 95;

export type DiversionReason = 'wrapper' | 'legal';

export interface DivertedFinding {
  finding: Finding;
  reason: DiversionReason;
}

export interface PartitionedFindings {
  /** Never contains a diverted finding. Feed this, not the unfiltered
   *  input, to buildStructureInput/buildWritingInput and to the
   *  invented/unreferenced-finding guards. */
  forModel: Finding[];
  diverted: DivertedFinding[];
}

/** manifest.pages is an array, not a url-keyed dict, so every diversion
 *  check needs this built once up front rather than scanning the array
 *  per finding. */
export function buildMissingPercentIndex(manifest: AuditManifest): Map<string, number> {
  const index = new Map<string, number>();
  for (const page of manifest.pages) {
    if (page.renderDiffMissingPercent !== undefined) {
      index.set(page.url, page.renderDiffMissingPercent);
    }
  }
  return index;
}

export function isWrapperPage(
  url: string,
  missingPercentByUrl: ReadonlyMap<string, number>,
): boolean {
  const missingPercent = missingPercentByUrl.get(url);
  return missingPercent !== undefined && missingPercent >= WRAPPER_PAGE_MISSING_PERCENT_THRESHOLD;
}

export function isLegalPage(url: string): boolean {
  return LEGAL_PATH_PATTERN.test(url);
}

/** A finding is diverted only when every page it appears on is the same
 *  kind of diverted page. A finding spanning both a wrapper page and an
 *  ordinary page still reaches the model: only the near-entirely
 *  third-party or near-entirely legal case is diverted. */
export function classifyDiversion(
  finding: Pick<Finding, 'pageUrls'>,
  missingPercentByUrl: ReadonlyMap<string, number>,
): DiversionReason | null {
  if (finding.pageUrls.length === 0) return null;
  if (finding.pageUrls.every((url) => isWrapperPage(url, missingPercentByUrl))) return 'wrapper';
  if (finding.pageUrls.every((url) => isLegalPage(url))) return 'legal';
  return null;
}

/** The governing rule of docs/report-v2-refactor.md Part 4.1: divert, do
 *  not instruct. Wrapper-page and legal-noindex findings never reach the
 *  model, so the model cannot recommend indexing a noindex legal page or
 *  SEO work on a Meta embed, because it never sees the finding. Called
 *  from packages/interface's analysis stage (feeding the two-pass
 *  pipeline) and directly from packages/report (feeding the deterministic
 *  Observations section and the appendix's cross-reference), so both
 *  views are always derived from the same source of truth. */
export function partitionFindings(
  findings: readonly Finding[],
  manifest: AuditManifest,
): PartitionedFindings {
  const missingPercentByUrl = buildMissingPercentIndex(manifest);
  const forModel: Finding[] = [];
  const diverted: DivertedFinding[] = [];

  for (const finding of findings) {
    const reason = classifyDiversion(finding, missingPercentByUrl);
    if (reason) {
      diverted.push({ finding, reason });
    } else {
      forModel.push(finding);
    }
  }

  return { forModel, diverted };
}
