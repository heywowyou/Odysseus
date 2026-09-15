import { describe, expect, it } from 'vitest';
import { canonicalJobTypeForScanIntent, displayJobIntent } from './scan-intents.js';

describe('scan intent queue contract', () => {
  it('maps every public intent to its canonical single-site job', () => {
    expect(canonicalJobTypeForScanIntent('quick-check')).toBe('quick-check');
    expect(canonicalJobTypeForScanIntent('prospecting-audit')).toBe('prospecting-audit');
    expect(canonicalJobTypeForScanIntent('full-audit')).toBe('full-audit');
    expect(canonicalJobTypeForScanIntent('prospecting-audit')).not.toBe('prospecting');
  });

  it('maps legacy rows for display without changing canonical rows', () => {
    expect(displayJobIntent('outreach-full-scan', undefined)).toBe('prospecting-audit');
    expect(displayJobIntent('prospecting', 'quick-check')).toBe('quick-check');
    expect(displayJobIntent('prospecting', 'prospecting-audit')).toBe('prospecting-audit');
    expect(displayJobIntent('prospecting-audit', 'quick-check')).toBe('prospecting-audit');
    expect(displayJobIntent('prospecting', undefined)).toBe('prospecting');
  });
});
