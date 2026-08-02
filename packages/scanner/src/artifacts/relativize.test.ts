import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toAuditRelativeRefs } from './relativize.js';
import type { RenderDiffResult } from '@odysseus/core';

const AUDIT_DIR = '/artifacts/example.com/2026-08-02T14-32-05Z';

function buildResult(overrides: Partial<RenderDiffResult> = {}): RenderDiffResult {
  return {
    pageUrl: 'https://example.com/',
    rawTextLength: 10,
    renderedTextLength: 100,
    missingPercent: 90,
    consoleErrors: [],
    httpStatus: 200,
    ...overrides,
  };
}

describe('toAuditRelativeRefs', () => {
  it('rewrites both screenshot refs relative to the audit directory', () => {
    const result = buildResult({
      rawScreenshotRef: path.join(AUDIT_DIR, 'pages', 'contact-d4e5f6', 'raw.png'),
      renderedScreenshotRef: path.join(AUDIT_DIR, 'pages', 'contact-d4e5f6', 'rendered.png'),
    });

    const relativized = toAuditRelativeRefs(result, AUDIT_DIR);

    expect(relativized.rawScreenshotRef).toBe(path.join('pages', 'contact-d4e5f6', 'raw.png'));
    expect(relativized.renderedScreenshotRef).toBe(path.join('pages', 'contact-d4e5f6', 'rendered.png'));
  });

  it('leaves every other field untouched', () => {
    const result = buildResult({
      rawScreenshotRef: path.join(AUDIT_DIR, 'pages', 'x', 'raw.png'),
      missingPercent: 42,
    });
    const relativized = toAuditRelativeRefs(result, AUDIT_DIR);
    expect(relativized.missingPercent).toBe(42);
    expect(relativized.pageUrl).toBe(result.pageUrl);
    expect(relativized.rawTextLength).toBe(result.rawTextLength);
  });

  it('leaves undefined refs undefined', () => {
    const result = buildResult();
    const relativized = toAuditRelativeRefs(result, AUDIT_DIR);
    expect(relativized.rawScreenshotRef).toBeUndefined();
    expect(relativized.renderedScreenshotRef).toBeUndefined();
  });
});
