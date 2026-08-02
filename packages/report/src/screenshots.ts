/**
 * Screenshot selection for the render-diff evidence section. Must reuse
 * selectPageDirsToKeep from @odysseus/scanner rather than reimplement the
 * selection rule, or the report will eventually ask for a screenshot the
 * scan already deleted (docs/normalization-rules.md section 6).
 *
 * pruneScreenshots itself is not called here: pruning already ran, and
 * deleted, at scan time. This only needs to know which pageDirs *should*
 * have survived, to read whatever is actually on disk for them.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { selectPageDirsToKeep, type PrunePageInfo } from '@odysseus/scanner';
import type { AuditManifest } from '@odysseus/core';

export interface RenderDiffEvidencePage {
  pageUrl: string;
  missingPercent: number | undefined;
  isHomepage: boolean;
  /** null when the screenshot was pruned, or the page never produced one
   *  (e.g. a render-diff error). The template must render an explicit
   *  "no screenshot available" state, never a broken <img>. */
  rawDataUri: string | null;
  renderedDataUri: string | null;
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

async function readAsDataUri(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function resolveRenderDiffEvidence(
  manifest: AuditManifest,
  auditDir: string,
): Promise<RenderDiffEvidencePage[]> {
  const candidates = prunePageInfoFromManifest(manifest);
  const keptDirs = selectPageDirsToKeep(candidates);

  const kept = candidates
    .filter((page) => keptDirs.has(page.pageDir))
    .sort((a, b) => {
      if (a.isHomepage !== b.isHomepage) return a.isHomepage ? -1 : 1;
      return (b.missingPercent ?? 0) - (a.missingPercent ?? 0);
    });

  return Promise.all(
    kept.map(async (page) => {
      const pageDirPath = path.join(auditDir, page.pageDir);
      const [rawDataUri, renderedDataUri] = await Promise.all([
        readAsDataUri(path.join(pageDirPath, 'raw.png')),
        readAsDataUri(path.join(pageDirPath, 'rendered.png')),
      ]);
      return {
        pageUrl: page.pageUrl,
        missingPercent: page.missingPercent,
        isHomepage: page.isHomepage,
        rawDataUri,
        renderedDataUri,
      };
    }),
  );
}
