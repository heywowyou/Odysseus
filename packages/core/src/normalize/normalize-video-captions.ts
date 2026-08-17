/**
 * Milestone 8 (extended accessibility pass): violation judgment for
 * video-missing-captions. Same scanner-extracts/core-decides split.
 * Native <video> elements only - see video-captions.ts's file header for
 * why embedded players (YouTube, Vimeo) are deliberately not checked.
 *
 * WCAG 1.2.2 requires captions for prerecorded audio in synchronized
 * media - real audio content (spoken dialogue, song lyrics, any
 * meaningful sound) missing captions is correctly flagged here, and
 * that is not weakened by the hasAudio gate below. The gate exists
 * only for the opposite, previously-mislabeled case: a <video> with no
 * meaningful audio track at all is out of scope for 1.2.2 entirely, and
 * must not be reported as "missing subtitles" - see video-captions.ts's
 * file header for the full 1.2.2/1.2.1 reasoning. A silent video is
 * simply not flagged by this function; it is not yet evaluated against
 * 1.2.1 (text alternative for silent video), which would need its own
 * rule ID and severity.ts entry (severity.ts is a locked contract).
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const VIDEO_MISSING_CAPTIONS_RULE_ID = 'video-missing-captions';

export interface VideoCheckInputEntry {
  selector: string;
  hasCaptionTrack: boolean;
  /** See video-captions.ts's VideoCheckResult.hasAudio: defaults to
   *  true when undetermined, so an inaccessible video source never
   *  silently exempts a real captions gap. */
  hasAudio: boolean;
}

export interface VideoCaptionsCheckInput {
  pageUrl: string;
  videos: VideoCheckInputEntry[];
}

export function extractVideoCaptionsCandidates(input: VideoCaptionsCheckInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const video of input.videos) {
    if (video.hasCaptionTrack) continue;
    // A video with no meaningful audio track is not missing captions
    // for the purposes of 1.2.2, it is silent - see the file header.
    if (!video.hasAudio) continue;
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
