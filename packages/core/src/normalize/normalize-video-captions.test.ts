import { describe, expect, it } from 'vitest';
import { extractVideoCaptionsCandidates, VIDEO_MISSING_CAPTIONS_RULE_ID } from './normalize-video-captions.js';

const PAGE_URL = 'https://example.com/';

describe('video-missing-captions', () => {
  it('fires for a video with no caption track', () => {
    const candidates = extractVideoCaptionsCandidates({
      pageUrl: PAGE_URL,
      videos: [{ selector: 'video:nth-of-type(1)', hasCaptionTrack: false }],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(VIDEO_MISSING_CAPTIONS_RULE_ID);
    expect(candidates[0]?.category).toBe('accessibility');
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.wcagCriteria).toEqual(['1.2.2']);
    expect(candidates[0]?.element?.selector).toBe('video:nth-of-type(1)');
  });

  it('does not fire for a video with a captions track', () => {
    expect(
      extractVideoCaptionsCandidates({
        pageUrl: PAGE_URL,
        videos: [{ selector: 'video:nth-of-type(1)', hasCaptionTrack: true }],
      }),
    ).toEqual([]);
  });

  it('does not fire when there are no videos', () => {
    expect(extractVideoCaptionsCandidates({ pageUrl: PAGE_URL, videos: [] })).toEqual([]);
  });

  it('handles multiple videos independently', () => {
    const candidates = extractVideoCaptionsCandidates({
      pageUrl: PAGE_URL,
      videos: [
        { selector: 'video:nth-of-type(1)', hasCaptionTrack: true },
        { selector: 'video:nth-of-type(2)', hasCaptionTrack: false },
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element?.selector).toBe('video:nth-of-type(2)');
  });
});
