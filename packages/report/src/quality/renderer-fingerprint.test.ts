import { describe, expect, it } from 'vitest';
import {
  reportRendererAssetFingerprints,
  reportRendererCodeFingerprint,
} from './renderer-fingerprint.js';

describe('reportRendererAssetFingerprints', () => {
  it('returns deterministic sha256 fingerprints for the renderer styles and embedded fonts', async () => {
    const first = await reportRendererAssetFingerprints();
    const second = await reportRendererAssetFingerprints();
    expect(first).toEqual(second);
    expect(first.rendererAssets).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.fonts).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fingerprints the embedded font payload separately from the whole stylesheet', async () => {
    const { rendererAssets, fonts } = await reportRendererAssetFingerprints();
    expect(fonts).not.toBe(rendererAssets);
  });
});

describe('reportRendererCodeFingerprint', () => {
  it('fingerprints the loaded report and core module trees deterministically', async () => {
    const first = await reportRendererCodeFingerprint();
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await reportRendererCodeFingerprint()).toBe(first);
  });
});
