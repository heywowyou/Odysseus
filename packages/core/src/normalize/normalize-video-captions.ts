/**
 * Milestone 8 (extended accessibility pass): violation judgment for
 * video-missing-captions. Same scanner-extracts/core-decides split.
 * Native <video> elements only - see video-captions.ts's file header for
 * why embedded players (YouTube, Vimeo) are deliberately not checked.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const VIDEO_MISSING_CAPTIONS_RULE_ID = 'video-missing-captions';

export interface VideoCheckInputEntry {
  selector: string;
  hasCaptionTrack: boolean;
}

export interface VideoCaptionsCheckInput {
  pageUrl: string;
  videos: VideoCheckInputEntry[];
}

export function extractVideoCaptionsCandidates(input: VideoCaptionsCheckInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const video of input.videos) {
    if (video.hasCaptionTrack) continue;
    candidates.push({
      source: 'custom',
      ruleId: VIDEO_MISSING_CAPTIONS_RULE_ID,
      category: 'accessibility',
      severity: severityFromCustom(VIDEO_MISSING_CAPTIONS_RULE_ID),
      wcagCriteria: ['1.2.2'],
      title: 'Video has no captions track',
      description:
        'This <video> element has no <track kind="captions"> (or kind="subtitles"). Deaf and hard-of-hearing visitors get no access to its audio content.',
      pageUrl: input.pageUrl,
      element: { pageUrl: input.pageUrl, selector: video.selector, snippet: '' },
      rawEvidenceForPage: {},
    });
  }

  return candidates;
}
