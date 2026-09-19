import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTENT_STAGE_MARKER_FILE,
  buildContentStageMarker,
  clearContentStageMarker,
  readContentStageMarker,
  writeContentStageMarker,
} from './content-stage-marker.js';

const binding = {
  crawledUrls: ['https://example.com/', 'https://example.com/a'],
  scopeDigest: 'scope-1',
  evidenceEpoch: 2,
};

describe('content stage marker', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-content-stage-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the admitted wave pages for the crawl, scope and epoch it was written for', () => {
    writeContentStageMarker(dir, buildContentStageMarker(binding, ['https://example.com/w']));
    expect(readContentStageMarker(dir, binding)).toEqual(['https://example.com/w']);
    // Crawl order does not matter, only the page set.
    expect(
      readContentStageMarker(dir, { ...binding, crawledUrls: [...binding.crawledUrls].reverse() }),
    ).toEqual(['https://example.com/w']);
  });

  it('ignores a marker from another crawl, scope or epoch', () => {
    writeContentStageMarker(dir, buildContentStageMarker(binding, []));
    expect(
      readContentStageMarker(dir, { ...binding, crawledUrls: ['https://example.com/'] }),
    ).toBeUndefined();
    expect(readContentStageMarker(dir, { ...binding, scopeDigest: 'scope-2' })).toBeUndefined();
    expect(readContentStageMarker(dir, { ...binding, scopeDigest: undefined })).toBeUndefined();
    expect(readContentStageMarker(dir, { ...binding, evidenceEpoch: 3 })).toBeUndefined();
  });

  it('ignores a missing or malformed marker and clears it', () => {
    expect(readContentStageMarker(dir, binding)).toBeUndefined();
    fs.writeFileSync(path.join(dir, CONTENT_STAGE_MARKER_FILE), '{"version":1');
    expect(readContentStageMarker(dir, binding)).toBeUndefined();
    clearContentStageMarker(dir);
    expect(fs.existsSync(path.join(dir, CONTENT_STAGE_MARKER_FILE))).toBe(false);
    clearContentStageMarker(dir);
  });
});
