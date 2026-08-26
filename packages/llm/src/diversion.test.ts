import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  buildMissingPercentIndex,
  classifyDiversion,
  isLegalPage,
  isWrapperPage,
  partitionFindings,
} from './diversion.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real committed scan behind docs/report-v2-refactor.md itself: two
 *  /social/ wrapper pages at 100% missing content, and three legal pages
 *  (CGU, cookie policy, privacy policy) under noindex. This is exactly
 *  the A1-A3 case the diversion filter exists to fix. */
function loadHaaitzaAuditDir(): string {
  return path.join(moduleDir, '../../../artifacts/haaitza.com/2026-08-06T20-30-06Z');
}

function loadHaaitzaManifest(): AuditManifest {
  return JSON.parse(
    readFileSync(path.join(loadHaaitzaAuditDir(), 'manifest.json'), 'utf-8'),
  ) as AuditManifest;
}

function loadHaaitzaFindings(): Finding[] {
  return JSON.parse(
    readFileSync(path.join(loadHaaitzaAuditDir(), 'findings.json'), 'utf-8'),
  ) as Finding[];
}

describe('buildMissingPercentIndex', () => {
  it('indexes the two wrapper pages at 100% missing', () => {
    const index = buildMissingPercentIndex(loadHaaitzaManifest());
    expect(index.get('https://haaitza.com/social/facebook/')).toBe(100);
    expect(index.get('https://haaitza.com/social/instagram/')).toBe(100);
    expect(index.get('https://haaitza.com/')).toBe(0);
  });
});

describe('isWrapperPage / isLegalPage', () => {
  it('classifies the real haaitza wrapper and legal pages', () => {
    const index = buildMissingPercentIndex(loadHaaitzaManifest());
    expect(isWrapperPage('https://haaitza.com/social/facebook/', index)).toBe(true);
    expect(isWrapperPage('https://haaitza.com/', index)).toBe(false);
    expect(isLegalPage('https://haaitza.com/conditions-generales-d-utilisation/')).toBe(true);
    expect(isLegalPage('https://haaitza.com/politique-cookies/')).toBe(true);
    expect(isLegalPage('https://haaitza.com/politique-de-confidentialite/')).toBe(true);
    expect(isLegalPage('https://haaitza.com/chambres-hotel-5-etoiles-arcachon/')).toBe(false);
  });
});

describe('classifyDiversion', () => {
  const index = buildMissingPercentIndex(loadHaaitzaManifest());

  it('diverts a finding confined entirely to wrapper pages', () => {
    expect(classifyDiversion({ pageUrls: ['https://haaitza.com/social/facebook/'] }, index)).toBe(
      'wrapper',
    );
  });

  it('diverts a finding confined entirely to legal pages', () => {
    expect(
      classifyDiversion(
        { pageUrls: ['https://haaitza.com/conditions-generales-d-utilisation/'] },
        index,
      ),
    ).toBe('legal');
  });

  it('does not divert a finding that also touches an ordinary page', () => {
    expect(
      classifyDiversion(
        { pageUrls: ['https://haaitza.com/social/facebook/', 'https://haaitza.com/'] },
        index,
      ),
    ).toBeNull();
  });

  it('does not divert a finding with no pages', () => {
    expect(classifyDiversion({ pageUrls: [] }, index)).toBeNull();
  });
});

describe('partitionFindings', () => {
  it('diverts only wrapper- and legal-confined findings from the real haaitza scan', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();

    const { forModel, diverted } = partitionFindings(findings, manifest);

    expect(forModel.length + diverted.length).toBe(findings.length);
    expect(diverted.length).toBeGreaterThan(0);

    for (const { finding, reason } of diverted) {
      const index = buildMissingPercentIndex(manifest);
      expect(classifyDiversion(finding, index)).toBe(reason);
    }
    for (const finding of forModel) {
      expect(classifyDiversion(finding, buildMissingPercentIndex(manifest))).toBeNull();
    }

    // The two /social/ wrapper pages and the noindex legal pages must not
    // reach the model as page-scoped SEO advice - this is the exact A1/A3
    // failure mode the partition exists to prevent.
    const divertedRuleIds = new Set(diverted.map((d) => d.finding.ruleId));
    expect(divertedRuleIds.has('is-crawlable')).toBe(true);
  });
});
