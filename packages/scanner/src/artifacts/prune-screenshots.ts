/**
 * Screenshot pruning, run at the end of a scan.
 *
 * Capturing two full-page screenshots per page and keeping all of them
 * means a 20-page site stores 40 images to illustrate one or two
 * findings, and on a server-rendered site every one of them depicts a
 * non-finding. Always keep the homepage pair; keep pairs for the top N
 * pages by missingPercent among those meeting the render-diff emission
 * threshold; delete every other pair. This is data minimisation rather
 * than retention: full-page screenshots of a client site incidentally
 * capture personal data, and not capturing is a stronger position than
 * deleting later.
 *
 * This is the single, canonical screenshot-retention implementation.
 * Report generation (Milestone 6) must import and reuse
 * selectPageDirsToKeep/pruneScreenshots rather than reimplementing
 * pruning; see CLAUDE.md.
 *
 * Selection (selectPageDirsToKeep) is pure and independently testable
 * from the actual filesystem deletion (pruneScreenshots), and never
 * touches scan.json: `normalize <dir>` reads scan.json only and must keep
 * working after pruning has run.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RENDER_DIFF_EMISSION_THRESHOLD_PERCENT } from '@odysseus/core';

export const SCREENSHOT_PRUNE_KEEP_TOP_N = 3;

export interface PrunePageInfo {
  pageUrl: string;
  pageDir: string;
  missingPercent: number | undefined;
  isHomepage: boolean;
}

export function selectPageDirsToKeep(
  pages: readonly PrunePageInfo[],
  options: { topN?: number } = {},
): Set<string> {
  const topN = options.topN ?? SCREENSHOT_PRUNE_KEEP_TOP_N;
  const keep = new Set<string>();

  for (const page of pages) {
    if (page.isHomepage) keep.add(page.pageDir);
  }

  const qualifying = pages
    .filter((page) => page.missingPercent !== undefined && page.missingPercent >= RENDER_DIFF_EMISSION_THRESHOLD_PERCENT)
    .sort((a, b) => (b.missingPercent ?? 0) - (a.missingPercent ?? 0));

  for (const page of qualifying.slice(0, topN)) {
    keep.add(page.pageDir);
  }

  return keep;
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function pruneScreenshots(
  auditDir: string,
  pages: readonly PrunePageInfo[],
  options: { topN?: number } = {},
): Promise<{ prunedPageDirs: string[] }> {
  const keep = selectPageDirsToKeep(pages, options);
  const prunedPageDirs: string[] = [];

  for (const page of pages) {
    if (keep.has(page.pageDir)) continue;
    const pageDirPath = path.join(auditDir, page.pageDir);
    await unlinkIfExists(path.join(pageDirPath, 'raw.png'));
    await unlinkIfExists(path.join(pageDirPath, 'rendered.png'));
    prunedPageDirs.push(page.pageDir);
  }

  return { prunedPageDirs };
}
