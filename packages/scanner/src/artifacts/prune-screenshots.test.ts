import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pruneScreenshots,
  selectPageDirsToKeep,
  SCREENSHOT_PRUNE_KEEP_TOP_N,
  type PrunePageInfo,
} from './prune-screenshots.js';

describe('selectPageDirsToKeep', () => {
  it('always keeps the homepage, even below the emission threshold', () => {
    const pages: PrunePageInfo[] = [
      {
        pageUrl: 'https://example.com/',
        pageDir: 'root-aaaaaa',
        missingPercent: 0,
        isHomepage: true,
      },
    ];
    expect(selectPageDirsToKeep(pages)).toEqual(new Set(['root-aaaaaa']));
  });

  it('keeps the top N qualifying pages by missingPercent, homepage plus the rest', () => {
    const pages: PrunePageInfo[] = [
      { pageUrl: 'https://example.com/', pageDir: 'root', missingPercent: 5, isHomepage: true },
      { pageUrl: 'https://example.com/a', pageDir: 'a', missingPercent: 90, isHomepage: false },
      { pageUrl: 'https://example.com/b', pageDir: 'b', missingPercent: 80, isHomepage: false },
      { pageUrl: 'https://example.com/c', pageDir: 'c', missingPercent: 70, isHomepage: false },
      { pageUrl: 'https://example.com/d', pageDir: 'd', missingPercent: 60, isHomepage: false },
      { pageUrl: 'https://example.com/e', pageDir: 'e', missingPercent: 10, isHomepage: false }, // below threshold
    ];

    const kept = selectPageDirsToKeep(pages, { topN: 2 });
    expect(kept).toEqual(new Set(['root', 'a', 'b']));
  });

  it('defaults topN to SCREENSHOT_PRUNE_KEEP_TOP_N', () => {
    const pages: PrunePageInfo[] = Array.from({ length: 5 }, (_, i) => ({
      pageUrl: `https://example.com/${i}`,
      pageDir: `p${i}`,
      missingPercent: 50 + i,
      isHomepage: false,
    }));
    const kept = selectPageDirsToKeep(pages);
    expect(kept.size).toBe(SCREENSHOT_PRUNE_KEEP_TOP_N);
  });

  it('keeps fewer than N when fewer pages qualify', () => {
    const pages: PrunePageInfo[] = [
      { pageUrl: 'https://example.com/', pageDir: 'root', missingPercent: 0, isHomepage: true },
      { pageUrl: 'https://example.com/a', pageDir: 'a', missingPercent: 25, isHomepage: false },
    ];
    expect(selectPageDirsToKeep(pages, { topN: 3 })).toEqual(new Set(['root', 'a']));
  });

  it('treats an undefined missingPercent as never qualifying', () => {
    const pages: PrunePageInfo[] = [
      { pageUrl: 'https://example.com/', pageDir: 'root', missingPercent: 0, isHomepage: true },
      {
        pageUrl: 'https://example.com/a',
        pageDir: 'a',
        missingPercent: undefined,
        isHomepage: false,
      },
    ];
    expect(selectPageDirsToKeep(pages)).toEqual(new Set(['root']));
  });
});

describe('pruneScreenshots', () => {
  let scratchDir: string;

  afterEach(async () => {
    if (scratchDir) await fs.rm(scratchDir, { recursive: true, force: true });
  });

  it('removes PNGs for non-kept pages but leaves scan.json and kept pages intact', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-prune-'));

    const pages: PrunePageInfo[] = [
      { pageUrl: 'https://example.com/', pageDir: 'root-aaa', missingPercent: 0, isHomepage: true },
      { pageUrl: 'https://example.com/a', pageDir: 'a-bbb', missingPercent: 90, isHomepage: false },
      { pageUrl: 'https://example.com/b', pageDir: 'b-ccc', missingPercent: 5, isHomepage: false },
    ];

    for (const page of pages) {
      const pageDirPath = path.join(scratchDir, page.pageDir);
      await fs.mkdir(pageDirPath, { recursive: true });
      await fs.writeFile(path.join(pageDirPath, 'raw.png'), 'raw');
      await fs.writeFile(path.join(pageDirPath, 'rendered.png'), 'rendered');
      await fs.writeFile(path.join(pageDirPath, 'scan.json'), '{}');
    }

    const { prunedPageDirs } = await pruneScreenshots(scratchDir, pages, { topN: 3 });
    expect(prunedPageDirs).toEqual(['b-ccc']);

    // Kept pages: PNGs and scan.json all survive.
    expect(existsSync(path.join(scratchDir, 'root-aaa', 'raw.png'))).toBe(true);
    expect(existsSync(path.join(scratchDir, 'a-bbb', 'rendered.png'))).toBe(true);

    // Pruned page: PNGs gone, scan.json survives (normalize <dir> depends on this).
    expect(existsSync(path.join(scratchDir, 'b-ccc', 'raw.png'))).toBe(false);
    expect(existsSync(path.join(scratchDir, 'b-ccc', 'rendered.png'))).toBe(false);
    expect(existsSync(path.join(scratchDir, 'b-ccc', 'scan.json'))).toBe(true);
  });

  it('does not throw when a PNG is already missing', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-prune-'));
    const pages: PrunePageInfo[] = [
      { pageUrl: 'https://example.com/a', pageDir: 'a', missingPercent: 5, isHomepage: false },
    ];
    await fs.mkdir(path.join(scratchDir, 'a'), { recursive: true });

    await expect(pruneScreenshots(scratchDir, pages, { topN: 0 })).resolves.toEqual({
      prunedPageDirs: ['a'],
    });
  });
});
