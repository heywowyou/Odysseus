import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCAN_INTENTS,
  canonicalJobTypeForScanIntent,
  displayJobIntent,
  isCurrentScanIntent,
} from './scan-intents.js';

describe('scan intent queue contract', () => {
  it('offers exactly Quick check and Full scan as current launch intents', () => {
    expect([...CURRENT_SCAN_INTENTS]).toEqual(['quick-check', 'full-audit']);
    expect(canonicalJobTypeForScanIntent('quick-check')).toBe('quick-check');
    expect(canonicalJobTypeForScanIntent('full-audit')).toBe('full-audit');
  });

  it('refuses the retired prospecting audit and the batch runner as launch intents', () => {
    expect(isCurrentScanIntent('prospecting-audit')).toBe(false);
    expect(isCurrentScanIntent('outreach-full-scan')).toBe(false);
    expect(isCurrentScanIntent('prospecting')).toBe(false);
    expect(isCurrentScanIntent('full-audit')).toBe(true);
  });

  it('maps legacy rows for display without changing canonical rows', () => {
    expect(displayJobIntent('outreach-full-scan', undefined)).toBe('prospecting-audit');
    expect(displayJobIntent('prospecting', 'quick-check')).toBe('quick-check');
    expect(displayJobIntent('prospecting', 'prospecting-audit')).toBe('prospecting-audit');
    expect(displayJobIntent('prospecting-audit', 'quick-check')).toBe('prospecting-audit');
    expect(displayJobIntent('prospecting', undefined)).toBe('prospecting');
  });
});
