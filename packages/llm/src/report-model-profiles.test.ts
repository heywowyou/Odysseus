import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportQualityRole } from '@odysseus/core';
import {
  REPORT_MODEL_PROFILES,
  ReportModelProfileMissingError,
  getReportModelProfile,
  getReportModelProfileDigest,
  getReportModelProfileMatrixDigest,
} from './report-model-profiles.js';
import type { ReportProfileBenchmarkApproval } from './report-profile-benchmarks.js';
import {
  REPORT_PROFILE_BENCHMARK_MANIFEST,
  ReportProfileBenchmarkNotCurrentError,
  assertProductionProfileBenchmarksCurrent,
  findStaleReportProfileBenchmarks,
} from './report-profile-benchmarks.js';

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Plan 058 report model profiles', () => {
  it('covers every report-quality role with an explicit Sol profile', () => {
    expect(Object.keys(REPORT_MODEL_PROFILES).sort()).toEqual([...ROLES].sort());

    const profileIds = new Set<string>();
    for (const role of ROLES) {
      const profile = getReportModelProfile(role);
      expect(profile.profileId).toMatch(/^058-.+-v1$/);
      expect(profile.role).toBe(role);
      expect(profile.provider).toBe('openai');
      expect(profile.promptVersion).toMatch(/^058-prompt-v\d+$/);
      expect(profile.schemaVersion).toMatch(/^058-schema-v\d+$/);
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

  it('requires vision modality exactly for the roles that review rendered pages', () => {
    for (const role of ROLES) {
      const needsVision = [
        'visual-reviewer-physical',
        'visual-reviewer-design',
        'visual-issue-adjudicator',
        'final-visual-reviewer',
      ].includes(role);
      expect(getReportModelProfile(role).modality).toBe(needsVision ? 'vision' : 'text');
    }
  });

  it('fails closed on a role without an approved profile instead of defaulting', () => {
    // The registry is compile-time exhaustive, so the runtime risk is a
    // role arriving through an untyped boundary; resolution must refuse
    // rather than return undefined or a catch-all entry.
    expect(() => getReportModelProfile('unexpected-role' as ReportQualityRole)).toThrow(
      ReportModelProfileMissingError,
    );
    expect(Object.values(REPORT_MODEL_PROFILES)).toHaveLength(ROLES.length);
  });

  it('never falls back to a legacy or generic environment model', () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-5.4-mini');
    vi.stubEnv('ODYSSEUS_REPORT_QUALITY_MODEL', 'gpt-5.4-mini');
    for (const role of ROLES) {
      expect(getReportModelProfile(role).model).toBe('gpt-5.6-sol');
    }
  });

  it('cannot silently reach the legacy Mini or generic report-quality model seams', () => {
    const criticalSources = [
      './report-model-profiles.ts',
      './report-quality-client.ts',
      './report-profile-benchmarks.ts',
      '../../interface/src/pipeline/report-quality-pipeline.ts',
      '../../interface/src/pipeline/report-quality-promotion.ts',
    ].map((relativePath) =>
      readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'),
    );

    for (const source of criticalSources) {
      expect(source).not.toContain('ODYSSEUS_REPORT_QUALITY_MODEL');
      expect(source).not.toContain('OPENAI_MODEL');
      expect(source).not.toContain('gpt-5.4-mini');
    }
  });
});

describe('Plan 058 profile benchmark manifest', () => {
  it('names a manifest approval for every production profile', () => {
    const approvalIds = new Set(Object.keys(REPORT_PROFILE_BENCHMARK_MANIFEST));
    for (const role of ROLES) {
      const { benchmarkApprovalId } = getReportModelProfile(role);
      expect(approvalIds.has(benchmarkApprovalId)).toBe(true);
    }
    for (const approval of Object.values(REPORT_PROFILE_BENCHMARK_MANIFEST)) {
      expect(approval.corpusId).toBe('plan-058-saved-corpus');
    }
  });

  it('lets a current approval stand only with a run date and committed artifact', () => {
    const manifest: Record<string, ReportProfileBenchmarkApproval> =
      REPORT_PROFILE_BENCHMARK_MANIFEST;
    for (const approval of Object.values(manifest)) {
      if (approval.status === 'current') {
        expect(approval.ranAt).toBeTruthy();
        expect(approval.artifactRef).toMatch(/^docs\//);
      }
    }
  });

  it('blocks production promotion while any profile corpus approval is not current', () => {
    expect(findStaleReportProfileBenchmarks().length).toBeGreaterThan(0);
    expect(() => assertProductionProfileBenchmarksCurrent()).toThrow(
      ReportProfileBenchmarkNotCurrentError,
    );

    const allCurrent: Record<string, ReportProfileBenchmarkApproval> = Object.fromEntries(
      Object.entries(REPORT_PROFILE_BENCHMARK_MANIFEST).map(([id, approval]) => [
        id,
        {
          ...approval,
          status: 'current',
          ranAt: '2026-09-18T00:00:00.000Z',
          artifactRef: 'docs/research/example.md',
        },
      ]),
    );
    expect(findStaleReportProfileBenchmarks(allCurrent)).toEqual([]);
    expect(() => assertProductionProfileBenchmarksCurrent(allCurrent)).not.toThrow();
  });

  it('treats an approval missing from the manifest as blocked, never as approved', () => {
    const withoutApproval: Record<string, ReportProfileBenchmarkApproval> = {
      'some-other-approval': {
        benchmarkApprovalId: 'some-other-approval',
        corpusId: 'plan-058-saved-corpus',
        corpusVersion: '2026-09',
        status: 'current',
        ranAt: '2026-09-18T00:00:00.000Z',
        artifactRef: 'docs/research/example.md',
      },
    };
    const stale = findStaleReportProfileBenchmarks(withoutApproval);
    expect(stale.map((entry) => entry.status)).toEqual(['missing']);
    expect(() => assertProductionProfileBenchmarksCurrent(withoutApproval)).toThrow(
      ReportProfileBenchmarkNotCurrentError,
    );
  });
});
