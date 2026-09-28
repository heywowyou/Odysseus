import type { ManifestPageEntry } from '../types/manifest.js';
import {
  isTabWalkHeldByDialog,
  type KeyboardNavigationCheckInput,
} from './normalize-keyboard-navigation.js';
import type { VideoCaptionsCheckInput } from './normalize-video-captions.js';

/**
 * Plan 075 K1: the checks that ran on a page without concluding, recorded
 * in its extended-pass coverage so the report can state a check's clean
 * result only over the pages it concluded on. Computed from the stored
 * check results, so a refresh records it for audits scanned before it
 * existed, as I1 does for language redirects.
 */
export interface InconclusiveCheckPage {
  pageUrl: string;
  keyboardNavigation?: KeyboardNavigationCheckInput;
  videoCaptions?: VideoCaptionsCheckInput;
}

export function inconclusiveCheckIdsOf(page: InconclusiveCheckPage): string[] {
  const ids: string[] = [];
  if (page.keyboardNavigation !== undefined && isTabWalkHeldByDialog(page.keyboardNavigation)) {
    ids.push('keyboard-navigation');
  }
  const videos = page.videoCaptions?.videos ?? [];
  if (
    videos.some(
      (video) =>
        !video.hasCaptionTrack &&
        (video.audio ?? (video.hasAudio === undefined ? 'undetermined' : 'known')) ===
          'undetermined',
    )
  ) {
    ids.push('video-captions');
  }
  return ids;
}

export function markInconclusiveChecks(
  entries: readonly ManifestPageEntry[],
  pages: readonly InconclusiveCheckPage[],
): ManifestPageEntry[] {
  const byUrl = new Map(pages.map((page) => [page.pageUrl, page]));
  return entries.map((entry) => {
    const coverage = entry.analysisCoverage;
    if (coverage === undefined) return entry;
    const { inconclusiveCheckIds: _stored, ...extended } = coverage.passes.extended;
    const page = byUrl.get(entry.url);
    const ids = page === undefined ? [] : inconclusiveCheckIdsOf(page);
    return {
      ...entry,
      analysisCoverage: {
        ...coverage,
        passes: {
          ...coverage.passes,
          extended: ids.length > 0 ? { ...extended, inconclusiveCheckIds: ids } : extended,
        },
      },
    };
  });
}
