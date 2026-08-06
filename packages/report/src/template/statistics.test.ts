import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { computeStatistics } from './statistics.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadHaaitzaAuditDir(): string {
  return path.join(moduleDir, '../../../../artifacts/haaitza.com/2026-08-06T20-30-06Z');
}

function loadHaaitzaFindings(): Finding[] {
  return JSON.parse(readFileSync(path.join(loadHaaitzaAuditDir(), 'findings.json'), 'utf-8')) as Finding[];
}

function loadHaaitzaManifest(): AuditManifest {
  return JSON.parse(readFileSync(path.join(loadHaaitzaAuditDir(), 'manifest.json'), 'utf-8')) as AuditManifest;
}

describe('computeStatistics', () => {
  it('matches every number the doc itself verified against the real haaitza scan', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();

    const stats = computeStatistics(findings, manifest);

    expect(stats).toEqual({
      pagesScanned: 20,
      totalFindings: 103,
      accessibilityOccurrences: 431,
      pagesWithCritical: 20,
      critical: 8,
      serious: 20,
      moderate: 15,
      minor: 60,
      wcagCriteriaFailingCount: 7,
      pagesWithWcagFailure: 20,
      accessibilityCount: 23,
      seoRenderingCount: 16,
    });
  });
});
