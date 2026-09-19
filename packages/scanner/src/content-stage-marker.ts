import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';

/**
 * Records that a full audit's content stage finished: every crawled page was
 * analysed, the discovery waves reached their fixed point, and the targeted
 * recovery of failed checks ran. A resumed run that finds a valid marker
 * restores the wave pages from disk and goes straight to Lighthouse planning.
 *
 * Without it a container restart during the Lighthouse stage replayed the
 * waves and the recovery, which report no progress: the Hôtel Point France
 * audit sat silent for about 40 minutes after a deploy before Lighthouse
 * resumed.
 *
 * The marker is bound to the crawled page set and to the evidence scope and
 * epoch, so a marker from another run of the same audit directory is ignored.
 */
export const CONTENT_STAGE_MARKER_FILE = 'content-stage.json';

export interface ContentStageMarker {
  version: 1;
  crawledUrlsDigest: string;
  scopeDigest: string | null;
  evidenceEpoch: number;
  admittedWaveUrls: string[];
}

export interface ContentStageBinding {
  crawledUrls: readonly string[];
  scopeDigest: string | undefined;
  evidenceEpoch: number;
}

function digestUrls(urls: readonly string[]): string {
  return createHash('sha256')
    .update([...urls].sort().join('\n'))
    .digest('hex');
}

export function buildContentStageMarker(
  binding: ContentStageBinding,
  admittedWaveUrls: readonly string[],
): ContentStageMarker {
  return {
    version: 1,
    crawledUrlsDigest: digestUrls(binding.crawledUrls),
    scopeDigest: binding.scopeDigest ?? null,
    evidenceEpoch: binding.evidenceEpoch,
    admittedWaveUrls: [...admittedWaveUrls],
  };
}

/** The wave pages a valid marker admitted, or undefined when the marker is
 *  absent, malformed, or belongs to another crawl, scope or epoch. */
export function readContentStageMarker(
  auditDir: string,
  binding: ContentStageBinding,
): readonly string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(auditDir, CONTENT_STAGE_MARKER_FILE), 'utf8'));
  } catch {
    return undefined;
  }
  const marker = parsed as Partial<ContentStageMarker> | null;
  if (
    marker === null ||
    typeof marker !== 'object' ||
    marker.version !== 1 ||
    marker.crawledUrlsDigest !== digestUrls(binding.crawledUrls) ||
    marker.scopeDigest !== (binding.scopeDigest ?? null) ||
    marker.evidenceEpoch !== binding.evidenceEpoch ||
    !Array.isArray(marker.admittedWaveUrls) ||
    !marker.admittedWaveUrls.every((url) => typeof url === 'string')
  ) {
    return undefined;
  }
  return marker.admittedWaveUrls;
}

export function writeContentStageMarker(auditDir: string, marker: ContentStageMarker): void {
  const target = path.join(auditDir, CONTENT_STAGE_MARKER_FILE);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

export function clearContentStageMarker(auditDir: string): void {
  fs.rmSync(path.join(auditDir, CONTENT_STAGE_MARKER_FILE), { force: true });
}
