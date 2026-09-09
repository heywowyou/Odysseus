import { describe, expect, it } from 'vitest';
import { AFTER_CONTENT_PHASES, AFTER_LIGHTHOUSE_PHASES, PHASE_KEYS } from './phase-order';

describe('dashboard phase order', () => {
  it('the phase vocabulary is exactly the phases with operator copy', () => {
    expect([...PHASE_KEYS].sort()).toEqual([
      'analyze-en',
      'analyze-fr',
      'complete',
      'content-scan',
      'crawl',
      'failed',
      'lighthouse',
      'normalize',
      'queued',
      'report-en',
      'report-fr',
      'scan',
      'scanning',
      'select-performance',
    ]);
  });

  it('the content bar pins for exactly the phases after content-scan', () => {
    expect([...AFTER_CONTENT_PHASES].sort()).toEqual([
      'analyze-en',
      'analyze-fr',
      'complete',
      'lighthouse',
      'normalize',
      'report-en',
      'report-fr',
      'select-performance',
    ]);
  });

  it('the lighthouse bar pins for exactly the phases after lighthouse', () => {
    expect([...AFTER_LIGHTHOUSE_PHASES].sort()).toEqual([
      'analyze-en',
      'analyze-fr',
      'complete',
      'normalize',
      'report-en',
      'report-fr',
    ]);
  });
});
