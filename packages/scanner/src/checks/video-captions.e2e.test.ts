import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../browser.js';
import { checkVideoCaptions } from './video-captions.js';

function startStaticServer(html: string): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

describe('checkVideoCaptions against real pages', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function checkHtml(html: string) {
    const { server, origin } = await startStaticServer(html);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      return await checkVideoCaptions(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  // These fixtures point at a nonexistent movie.mp4, so the video never
  // reaches HAVE_CURRENT_DATA and hasAudio detection cannot run to
  // completion - it falls back to its conservative default (true, assume
  // audio present) rather than false, per video-captions.ts's file header.
  // This is deliberately what the tests below exercise: an inaccessible
  // video source must never silently exempt a real captions gap.

  it('flags a video with no track element at all, defaulting hasAudio to true when undetermined', async () => {
    const result = await checkHtml(`<body><video id="promo" src="movie.mp4" controls></video></body>`);
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: false, hasAudio: true }]);
  });

  it('recognizes a captions track', async () => {
    const result = await checkHtml(
      `<body><video id="promo" src="movie.mp4" controls><track kind="captions" src="cap.vtt" srclang="en" /></video></body>`,
    );
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: true, hasAudio: true }]);
  });

  it('recognizes a subtitles track as equivalent to captions', async () => {
    const result = await checkHtml(
      `<body><video id="promo" src="movie.mp4" controls><track kind="subtitles" src="sub.vtt" srclang="en" /></video></body>`,
    );
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: true, hasAudio: true }]);
  });

  it('does not count a chapters or descriptions track as captions', async () => {
    const result = await checkHtml(
      `<body><video id="promo" src="movie.mp4" controls><track kind="chapters" src="ch.vtt" /></video></body>`,
    );
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: false, hasAudio: true }]);
  });

  it('returns an empty list for a page with no video elements', async () => {
    const result = await checkHtml('<body><p>No video here.</p></body>');
    expect(result.videos).toEqual([]);
  });

  /** Builds a real, playable video entirely from browser APIs (canvas
   *  captureStream, optionally mixed with a Web Audio oscillator, recorded
   *  via MediaRecorder into a blob URL) so hasAudio detection can be
   *  exercised against genuine decoded media instead of only the
   *  undetermined-fallback path above - no binary fixture asset needed. */
  async function checkGeneratedVideo(withAudio: boolean) {
    const { server, origin } = await startStaticServer('<body></body>');
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(origin);
      await page.evaluate(async (withAudioArg) => {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.fillRect(0, 0, 2, 2);
        const videoStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(10);
        const tracks = videoStream.getVideoTracks() as MediaStreamTrack[];

        if (withAudioArg) {
          const AudioContextCtor = window.AudioContext;
          const audioCtx = new AudioContextCtor();
          const oscillator = audioCtx.createOscillator();
          const destination = audioCtx.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          tracks.push(...destination.stream.getAudioTracks());
        }

        const combined = new MediaStream(tracks);
        const recorder = new MediaRecorder(combined, { mimeType: 'video/webm' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        const stopped = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
        });
        recorder.start();
        await new Promise((resolve) => setTimeout(resolve, 300));
        recorder.stop();
        await stopped;

        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.id = 'promo';
        video.src = url;
        video.controls = true;
        document.body.appendChild(video);
        await new Promise<void>((resolve) => {
          video.onloadeddata = () => resolve();
          video.load();
        });
      }, withAudio);

      return await checkVideoCaptions(page, origin);
    } finally {
      await context.close();
      server.close();
    }
  }

  it('detects hasAudio: false for a genuinely silent video, and does not treat it as missing captions', async () => {
    const result = await checkGeneratedVideo(false);
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: false, hasAudio: false }]);
  });

  it('detects hasAudio: true for a video with a real audio track', async () => {
    const result = await checkGeneratedVideo(true);
    expect(result.videos).toEqual([{ selector: '#promo', hasCaptionTrack: false, hasAudio: true }]);
  });
});
