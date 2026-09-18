import { hostname, userInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import {
  buildAuditEnvironmentFingerprint,
  buildEvidenceCoverageSignature,
  classifyLogicalCores,
  classifyMemory,
  coarsenKernelRelease,
  compareCheckAcrossRuns,
  compareEvidenceCoverage,
  compareObservationAcrossRuns,
  describeCurrentBuildProfile,
  describeCurrentRuntimeProfile,
  findHostIdentifyingValues,
  normalizeLaunchFlagNames,
  type AuditEnvironmentFingerprintInput,
  type CheckObservability,
  type EvidenceCoverageSignatureInput,
} from './audit-environment-fingerprint.js';

const GIB = 1024 ** 3;

function environmentInput(
  overrides: Partial<AuditEnvironmentFingerprintInput> = {},
): AuditEnvironmentFingerprintInput {
  return {
    build: {
      odysseusBuildId: '2b7eec6',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      normalizationFingerprint: NORMALIZATION_FINGERPRINT,
    },
    runtime: {
      nodeVersion: 'v22.12.0',
      platform: 'linux',
      architecture: 'x64',
      kernelRelease: '6.6',
      kernelFlavour: 'microsoft-standard-WSL2',
      logicalCoreClass: '9-16',
      memoryClass: '16-32gb',
      containerProfileId: 'rootless-userns-container',
    },
    tools: {
      playwrightVersion: '1.56.0',
      chromiumVersion: '141.0.7390.54',
      axeCoreVersion: '4.10.2',
      lighthouseVersion: '12.2.1',
    },
    browser: {
      isolationProfile: 'approved-equivalent',
      declaredIsolationProfileId: 'rootless-userns-container',
      launchFlagNames: ['--no-sandbox', '--remote-debugging-port'],
      userAgent: 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)',
    },
    surfaces: [
      {
        id: 'desktop-baseline',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        hasTouch: false,
      },
    ],
    locale: { locale: 'fr-FR', acceptLanguage: 'fr-FR,fr;q=0.9', timezone: 'Europe/Paris' },
    networkPolicyId: 'public-site',
    lighthouse: {
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      throttlingProfileId: 'lighthouse-default-simulated-4g',
      categories: ['performance', 'seo'],
      maxWaitForLoadMs: 120_000,
    },
    timings: {
      pageTimeoutMs: 30_000,
      renderSettleTimeoutMs: 8_000,
      lighthouseTimeoutMs: 120_000,
      crawlDelayMs: 1000,
      scanConcurrency: 3,
    },
    registries: {
      capabilityRegistryVersion: 'capability-registry-v1',
      checkRegistryVersion: 'check-registry-v1',
    },
    ...overrides,
  };
}

describe('the audit environment fingerprint', () => {
  it('digests the same environment to the same value on two separate runs', () => {
    // Nothing time-varying is recorded, which is what lets a re-audit tell a
    // changed environment apart from a changed site.
    expect(buildAuditEnvironmentFingerprint(environmentInput()).digest).toBe(
      buildAuditEnvironmentFingerprint(environmentInput()).digest,
    );
  });

  it('digests differently when a tool that can move a measurement changes', () => {
    const before = buildAuditEnvironmentFingerprint(environmentInput());
    const after = buildAuditEnvironmentFingerprint(
      environmentInput({
        tools: { ...environmentInput().tools, axeCoreVersion: '4.11.0' },
      }),
    );
    expect(after.digest).not.toBe(before.digest);
  });

  it('digests two hosts in the same capacity class identically', () => {
    // The point of recording classes rather than counts: a fleet of hosts
    // provisioned the same way must not produce a different fingerprint each,
    // or every cross-run comparison would be against a different environment.
    const input = environmentInput();
    const twin = environmentInput({
      runtime: {
        ...input.runtime,
        logicalCoreClass: classifyLogicalCores(12),
        memoryClass: classifyMemory(16 * GIB),
      },
    });
    expect(buildAuditEnvironmentFingerprint(twin).digest).toBe(
      buildAuditEnvironmentFingerprint(input).digest,
    );
  });
});

describe('keeping infrastructure identity out of stored evidence', () => {
  it('refuses a filesystem path where a stable profile id belongs', () => {
    const input = environmentInput({
      runtime: {
        ...environmentInput().runtime,
        containerProfileId: '/var/lib/containers/odysseus-scanner-7',
      },
    });
    expect(() => buildAuditEnvironmentFingerprint(input)).toThrow(/runtime\.containerProfileId/u);
  });

  it('refuses an address that leaked in through a launch flag', () => {
    const input = environmentInput({
      browser: {
        ...environmentInput().browser,
        launchFlagNames: ['--no-sandbox', '--proxy-server=10.0.3.14'],
      },
    });
    expect(() => buildAuditEnvironmentFingerprint(input)).toThrow(/browser\.launchFlagNames\[1\]/u);
  });

  it('does not mistake a Chromium version for an address', () => {
    // Four dot-separated numbers, which is why the guard bounds each part to
    // an octet: a false positive here would refuse every real scan.
    expect(findHostIdentifyingValues({ chromiumVersion: '141.0.7390.54' })).toEqual([]);
    expect(findHostIdentifyingValues({ nodeVersion: 'v22.12.0' })).toEqual([]);
  });

  it('does not mistake the crawler user agent for a filesystem path', () => {
    expect(
      findHostIdentifyingValues({ userAgent: 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)' }),
    ).toEqual([]);
  });

  it('reports every offending field rather than only the first', () => {
    const paths = findHostIdentifyingValues({
      a: '/home/heywow/artifacts',
      nested: { b: 'file:///srv/odysseus/profile' },
      c: 'rootless-userns-container',
    });
    expect(paths).toEqual(['a', 'nested.b']);
  });

  it('records nothing that names the machine this process is running on', () => {
    const runtime = describeCurrentRuntimeProfile({ containerProfileId: 'bare-metal-development' });
    const fingerprint = buildAuditEnvironmentFingerprint(environmentInput({ runtime }));
    const serialized = JSON.stringify(fingerprint);

    expect(serialized).not.toContain(hostname());
    expect(serialized).not.toContain(userInfo().username);
    expect(serialized).not.toContain(process.cwd());
    expect(findHostIdentifyingValues(fingerprint)).toEqual([]);
  });

  it('reads the build identity through the manifest resolver rather than its own', () => {
    // Issue #58 was two resolvers disagreeing about which build produced an
    // artifact; a fingerprint that disagreed with its own manifest would be
    // worse than no fingerprint.
    const build = describeCurrentBuildProfile();
    expect(build.findingsSchemaVersion).toBe(FINDINGS_SCHEMA_VERSION);
    expect(build.normalizationFingerprint).toBe(NORMALIZATION_FINGERPRINT);
    expect(build.odysseusBuildId.trim()).not.toBe('');
  });
});

describe('coarsening the environment before it is recorded', () => {
  it('keeps a launch flag name and drops the value that would identify a host', () => {
    expect(
      normalizeLaunchFlagNames([
        '--remote-debugging-port=41235',
        '--user-data-dir=/home/heywow/.cache/chromium-profile',
        '--no-sandbox',
      ]),
    ).toEqual(['--no-sandbox', '--remote-debugging-port', '--user-data-dir']);
  });

  it('sorts and deduplicates flags so launch order cannot change the digest', () => {
    expect(
      normalizeLaunchFlagNames(['--no-sandbox', '--disable-web-security', '--no-sandbox']),
    ).toEqual(['--disable-web-security', '--no-sandbox']);
  });

  it('survives a kernel patch upgrade while still naming the platform', () => {
    // An unattended kernel upgrade changes nothing this scanner can observe,
    // so two runs a week apart must still share a fingerprint.
    expect(coarsenKernelRelease('6.6.87.2-microsoft-standard-WSL2')).toEqual(
      coarsenKernelRelease('6.6.91.1-microsoft-standard-WSL2'),
    );
    expect(coarsenKernelRelease('6.6.87.2-microsoft-standard-WSL2')).toEqual({
      release: '6.6',
      flavour: 'microsoft-standard-WSL2',
    });
    expect(coarsenKernelRelease('5.15.0-91-generic')).toEqual({
      release: '5.15',
      flavour: 'generic',
    });
  });

  it('classifies a host advertised as 8 GB as 8 GB despite the firmware reservation', () => {
    expect(classifyMemory(7.6 * GIB)).toBe('4-8gb');
    expect(classifyMemory(15.5 * GIB)).toBe('8-16gb');
    expect(classifyMemory(128 * GIB)).toBe('64gb-plus');
  });

  it('puts neighbouring core counts in one class and distant ones apart', () => {
    expect(classifyLogicalCores(12)).toBe(classifyLogicalCores(16));
    expect(classifyLogicalCores(12)).not.toBe(classifyLogicalCores(64));
  });
});

/* ------------------------------------------------------------------ */

function check(overrides: Partial<CheckObservability> = {}): CheckObservability {
  return {
    checkId: 'image-alt-text',
    version: 'v3',
    surfaces: ['desktop-baseline'],
    frameCapability: 'same-origin-frames',
    semanticallyConditional: false,
    ...overrides,
  };
}

function coverageInput(
  overrides: Partial<EvidenceCoverageSignatureInput> = {},
): EvidenceCoverageSignatureInput {
  return {
    scopeDigest: 'sha256:scope-a',
    inventorySignature: 'sha256:inventory-a',
    capabilityRegistryVersion: 'capability-registry-v1',
    semanticClassifierVersion: 'semantic-v2',
    normalizationContract: {
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      normalizationFingerprint: NORMALIZATION_FINGERPRINT,
    },
    enabledSurfaces: ['desktop-baseline'],
    checks: [check()],
    ...overrides,
  };
}

describe('the evidence coverage signature', () => {
  it('digests the same observability regardless of iteration order', () => {
    const one = buildEvidenceCoverageSignature(
      coverageInput({
        enabledSurfaces: ['mobile-baseline', 'desktop-baseline'],
        checks: [check({ checkId: 'reflow' }), check()],
      }),
    );
    const other = buildEvidenceCoverageSignature(
      coverageInput({
        enabledSurfaces: ['desktop-baseline', 'mobile-baseline'],
        checks: [check(), check({ checkId: 'reflow' })],
      }),
    );
    expect(other.digest).toBe(one.digest);
  });

  it('digests differently when a check that could change its verdict is upgraded', () => {
    const before = buildEvidenceCoverageSignature(coverageInput());
    const after = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check({ version: 'v4' })] }),
    );
    expect(after.digest).not.toBe(before.digest);
  });
});

describe('deciding what a re-audit is allowed to say', () => {
  it('calls a check the baseline never ran newly observable, not a new finding', () => {
    // The failure this whole module exists to prevent: a scanner upgrade that
    // adds a check would otherwise invoice the client for a regression their
    // site never had.
    const baseline = buildEvidenceCoverageSignature(coverageInput());
    const current = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check(), check({ checkId: 'placeholder-labels' })] }),
    );

    expect(compareCheckAcrossRuns(baseline, current, 'placeholder-labels')).toEqual({
      kind: 'newly-observable',
      reason: 'check-absent-in-baseline',
    });
    expect(compareCheckAcrossRuns(baseline, current, 'image-alt-text')).toEqual({
      kind: 'comparable',
    });
  });

  it('calls a check the current run did not execute not comparable, never resolved', () => {
    const baseline = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check(), check({ checkId: 'video-captions' })] }),
    );
    const current = buildEvidenceCoverageSignature(coverageInput());

    expect(compareCheckAcrossRuns(baseline, current, 'video-captions')).toEqual({
      kind: 'not-comparable',
      reason: 'check-absent-in-current',
    });
  });

  it('separates a newly added mobile surface from the desktop surface it shares', () => {
    // A mobile-only finding against a desktop-only baseline is Odysseus
    // seeing further, not the site getting worse.
    const baseline = buildEvidenceCoverageSignature(coverageInput());
    const current = buildEvidenceCoverageSignature(
      coverageInput({
        enabledSurfaces: ['desktop-baseline', 'mobile-baseline'],
        checks: [check({ surfaces: ['desktop-baseline', 'mobile-baseline'] })],
      }),
    );

    expect(
      compareObservationAcrossRuns(baseline, current, {
        checkId: 'image-alt-text',
        surfaceId: 'mobile-baseline',
      }),
    ).toEqual({ kind: 'newly-observable', reason: 'surface-absent-in-baseline' });
    expect(
      compareObservationAcrossRuns(baseline, current, {
        checkId: 'image-alt-text',
        surfaceId: 'desktop-baseline',
      }),
    ).toEqual({ kind: 'comparable' });
    // Gaining a surface does not make the check as a whole less comparable.
    expect(compareCheckAcrossRuns(baseline, current, 'image-alt-text')).toEqual({
      kind: 'comparable',
    });
  });

  it('keeps a surviving surface comparable when a different surface was dropped', () => {
    const baseline = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check({ surfaces: ['desktop-baseline', 'mobile-baseline'] })] }),
    );
    const current = buildEvidenceCoverageSignature(coverageInput());

    expect(compareCheckAcrossRuns(baseline, current, 'image-alt-text')).toEqual({
      kind: 'not-comparable',
      reason: 'surface-absent-in-current',
    });
    expect(
      compareObservationAcrossRuns(baseline, current, {
        checkId: 'image-alt-text',
        surfaceId: 'desktop-baseline',
      }),
    ).toEqual({ kind: 'comparable' });
    expect(
      compareObservationAcrossRuns(baseline, current, {
        checkId: 'image-alt-text',
        surfaceId: 'mobile-baseline',
      }),
    ).toEqual({ kind: 'not-comparable', reason: 'surface-absent-in-current' });
  });

  it('refuses every check when the two runs disagree on how findings are identified', () => {
    const baseline = buildEvidenceCoverageSignature(coverageInput());
    const current = buildEvidenceCoverageSignature(
      coverageInput({
        normalizationContract: {
          findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
          normalizationFingerprint: '0000000000000000',
        },
      }),
    );

    expect(compareCheckAcrossRuns(baseline, current, 'image-alt-text')).toEqual({
      kind: 'not-comparable',
      reason: 'normalization-contract-changed',
    });
    expect(compareEvidenceCoverage(baseline, current).normalizationContractChanged).toBe(true);
  });

  it('refuses a check whose frame traversal changed, since its silence means something else', () => {
    const baseline = buildEvidenceCoverageSignature(coverageInput());
    const current = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check({ frameCapability: 'document-only' })] }),
    );

    expect(compareCheckAcrossRuns(baseline, current, 'image-alt-text')).toEqual({
      kind: 'not-comparable',
      reason: 'frame-capability-changed',
    });
  });

  it('lets a capability registry bump be recorded without silencing unrelated checks', () => {
    // The registry is versioned as a whole, so treating a bump as
    // incomparability would end every re-audit comparison after any change to
    // any check.
    const baseline = buildEvidenceCoverageSignature(coverageInput());
    const current = buildEvidenceCoverageSignature(
      coverageInput({ capabilityRegistryVersion: 'capability-registry-v2' }),
    );

    const comparison = compareEvidenceCoverage(baseline, current);
    expect(comparison.capabilityRegistryChanged).toBe(true);
    expect(comparison.checks).toEqual([
      { checkId: 'image-alt-text', comparability: { kind: 'comparable' } },
    ]);
  });

  it('lets the semantic classifier break only the checks whose eligibility it decides', () => {
    const checks = [
      check(),
      check({ checkId: 'accessibility-statement', semanticallyConditional: true }),
    ];
    const baseline = buildEvidenceCoverageSignature(coverageInput({ checks }));
    const current = buildEvidenceCoverageSignature(
      coverageInput({ checks, semanticClassifierVersion: 'semantic-v3' }),
    );

    expect(compareCheckAcrossRuns(baseline, current, 'accessibility-statement')).toEqual({
      kind: 'not-comparable',
      reason: 'semantic-classifier-changed',
    });
    expect(compareCheckAcrossRuns(baseline, current, 'image-alt-text')).toEqual({
      kind: 'comparable',
    });
  });

  it('discloses a grown inventory instead of treating it as lost comparability', () => {
    // A site that gained pages has more to compare, not less. The rescoping is
    // reported so the pairing can account for it.
    const baseline = buildEvidenceCoverageSignature(coverageInput());
    const current = buildEvidenceCoverageSignature(
      coverageInput({ scopeDigest: 'sha256:scope-b', inventorySignature: 'sha256:inventory-b' }),
    );

    const comparison = compareEvidenceCoverage(baseline, current);
    expect(comparison.scopeChanged).toBe(true);
    expect(comparison.inventoryChanged).toBe(true);
    expect(comparison.identical).toBe(false);
    expect(comparison.checks).toEqual([
      { checkId: 'image-alt-text', comparability: { kind: 'comparable' } },
    ]);
  });

  it('lists a check either run knows about, so a removal is as visible as an addition', () => {
    const baseline = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check(), check({ checkId: 'video-captions' })] }),
    );
    const current = buildEvidenceCoverageSignature(
      coverageInput({ checks: [check(), check({ checkId: 'placeholder-labels' })] }),
    );

    expect(compareEvidenceCoverage(baseline, current).checks).toEqual([
      { checkId: 'image-alt-text', comparability: { kind: 'comparable' } },
      {
        checkId: 'placeholder-labels',
        comparability: { kind: 'newly-observable', reason: 'check-absent-in-baseline' },
      },
      {
        checkId: 'video-captions',
        comparability: { kind: 'not-comparable', reason: 'check-absent-in-current' },
      },
    ]);
  });

  it('reports two identical runs as identical', () => {
    const signature = buildEvidenceCoverageSignature(coverageInput());
    expect(compareEvidenceCoverage(signature, signature).identical).toBe(true);
  });
});
