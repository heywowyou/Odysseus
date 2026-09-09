import { describe, expect, it } from 'vitest';
import type { CheckExecutionOutcome, CheckId } from '../check-scope-coverage.js';
import type { RenderedCostProfile } from '../full-audit-plan.js';
import type { PageScanResult } from '../scan-page.js';
import { buildScanJson } from './page-scan-io.js';

const checkOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>> = {
  'render-diff': 'completed',
  axe: 'completed',
  'keyboard-navigation': 'failed',
};

const renderedCostProfile: RenderedCostProfile = {
  url: 'https://example.com/',
  domNodeCount: 120,
  imageCount: 3,
  resourceCount: 14,
  knownTransferBytes: 40_000,
  unknownTransferSizeCount: 1,
};

describe('buildScanJson', () => {
  it('persists checkOutcomes and renderedCostProfile so a resume can replay the planner from disk', () => {
    const scanResult: PageScanResult = {
      url: 'https://example.com/',
      checkOutcomes,
      renderedCostProfile,
    };

    expect(buildScanJson(scanResult, undefined)).toEqual({
      url: 'https://example.com/',
      checkOutcomes,
      renderedCostProfile,
    });
  });

  it('omits both plan-035 fields when the scan result carries none', () => {
    const scanResult: PageScanResult = { url: 'https://example.com/' };
    const scanJson = buildScanJson(scanResult, undefined);

    expect(scanJson).not.toHaveProperty('checkOutcomes');
    expect(scanJson).not.toHaveProperty('renderedCostProfile');
  });

  it('leaves every other field unchanged, including a Lighthouse result merged after the fact', () => {
    const scanResult: PageScanResult = {
      url: 'https://example.com/',
      checkOutcomes,
      lighthouse: { finalUrl: 'https://example.com/' } as NonNullable<PageScanResult['lighthouse']>,
    };
    const scanJson = buildScanJson(scanResult, undefined);

    expect(scanJson.lighthouse).toEqual(scanResult.lighthouse);
    expect(scanJson.checkOutcomes).toEqual(checkOutcomes);
    expect(scanJson).not.toHaveProperty('renderedCostProfile');
  });
});
