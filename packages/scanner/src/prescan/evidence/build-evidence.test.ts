import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { buildPrescanEvidence } from './build-evidence.js';

let scratchDir = '';

afterEach(async () => {
  if (scratchDir !== '') await fs.rm(scratchDir, { recursive: true, force: true });
});

describe('buildPrescanEvidence failures', () => {
  it('reports a missing source screenshot and still prunes partial page files', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-build-evidence-'));
    await fs.mkdir(path.join(scratchDir, 'page'), { recursive: true });
    await fs.writeFile(path.join(scratchDir, 'page', 'unrelated.tmp'), 'partial');
    const evidence = await buildPrescanEvidence({
      browser: {} as Browser,
      prescanDir: scratchDir,
      startedAt: new Date('2026-08-27T00:00:00.000Z'),
      pages: [
        {
          result: {
            role: 'booking',
            url: 'https://hotel.example/book',
            missingPercent: 80,
            rawTextLength: 10,
            renderedTextLength: 100,
            rawScreenshotRef: 'page/missing-raw.png',
            renderedScreenshotRef: 'page/missing-rendered.png',
            durationMs: 1,
          },
          facts: [
            {
              source: 'renderdiff',
              ruleId: 'text-missing-from-raw-html',
              severity: 'moderate',
              wcagCriteria: [],
              pageRole: 'booking',
              pageUrl: 'https://hotel.example/book',
              missingPercent: 80,
              rawTextLength: 10,
              renderedTextLength: 100,
            },
          ],
          failureCapture: null,
        },
      ],
    });
    expect(evidence.renderComparison).toEqual({
      state: 'omitted',
      reason: 'source-screenshot-missing',
    });
    expect(await fs.readdir(scratchDir)).toEqual(['expiry-manifest.json']);
  });
});
