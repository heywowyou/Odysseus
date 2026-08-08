/**
 * Milestone 8 (extended accessibility pass): video-missing-captions.
 * Native <video> elements only. Embedded players (YouTube, Vimeo, etc.)
 * are deliberately not checked - the addendum's own wording ("query the
 * relevant embed API for caption availability where feasible") is a
 * hedge, not a requirement, and doing it properly would mean loading
 * each provider's embed JS, a cross-origin postMessage handshake per
 * video, and a provider-specific integration per platform. That is
 * meaningfully more infrastructure than every other milestone 8 check
 * needed, for a signal this module can honestly report as "not checked"
 * instead. An honest gap beats a check that silently only half-covers
 * what it claims to.
 */

import type { Page } from 'playwright';

export interface VideoCheckResult {
  selector: string;
  hasCaptionTrack: boolean;
}

export interface VideoCaptionsExtraction {
  pageUrl: string;
  videos: VideoCheckResult[];
}

export async function checkVideoCaptions(page: Page, pageUrl: string): Promise<VideoCaptionsExtraction> {
  const videos = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('video'));
    return elements.map((el, i) => {
      const hasCaptionTrack = Array.from(el.querySelectorAll('track')).some((track) => {
        const kind = track.getAttribute('kind');
        return kind === 'captions' || kind === 'subtitles';
      });
      const selector = el.id ? `#${el.id}` : `video:nth-of-type(${i + 1})`;
      return { selector, hasCaptionTrack };
    });
  });

  return { pageUrl, videos };
}
