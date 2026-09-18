import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ReportQualityRole } from '@odysseus/core';
import {
  REPORT_MODEL_PROFILES,
  getReportModelProfile,
  getReportModelProfileDigest,
  getReportModelProfileMatrixDigest,
} from './report-model-profiles.js';

const ROLES: ReportQualityRole[] = [
  'senior-analyst',
  'writer-fr',
  'writer-en',
  'content-critic-evidence',
  'content-critic-editorial',
  'issue-adjudicator',
  'editor',
  'visual-reviewer-physical',
  'visual-reviewer-design',
  'visual-issue-adjudicator',
  'parity-reviewer',
  'final-visual-reviewer',
  'final-document-arbiter',
];

describe('Plan 058 report model profiles', () => {
  it('covers every report-quality role with an explicit Sol profile', () => {
    expect(Object.keys(REPORT_MODEL_PROFILES).sort()).toEqual([...ROLES].sort());

    const profileIds = new Set<string>();
    for (const role of ROLES) {
      const profile = getReportModelProfile(role);
      expect(profile.profileId).toMatch(/^058-.+-v1$/);
      profileIds.add(profile.profileId);
      expect(profile.model).toBe('gpt-5.6-sol');
      expect(['high', 'xhigh']).toContain(profile.reasoningEffort);
      expect(getReportModelProfileDigest(role)).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(profileIds.size).toBe(ROLES.length);
    expect(getReportModelProfileMatrixDigest()).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('uses xhigh for senior/adjudication/final arbitration roles', () => {
    for (const role of [
      'senior-analyst',
      'issue-adjudicator',
      'visual-issue-adjudicator',
      'final-document-arbiter',
    ] as const) {
      expect(getReportModelProfile(role).reasoningEffort).toBe('xhigh');
    }
  });

  it('cannot silently reach the legacy Mini or generic report-quality model seams', () => {
    const criticalSources = [
      './report-model-profiles.ts',
      './report-quality-client.ts',
      '../../interface/src/pipeline/report-quality-pipeline.ts',
    ].map((relativePath) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'),
    );

    for (const source of criticalSources) {
      expect(source).not.toContain('ODYSSEUS_REPORT_QUALITY_MODEL');
      expect(source).not.toContain("OPENAI_MODEL");
      expect(source).not.toContain("gpt-5.4-mini");
    }
  });
});
