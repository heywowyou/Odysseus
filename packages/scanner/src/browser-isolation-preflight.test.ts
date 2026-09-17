import { describe, expect, it } from 'vitest';
import {
  assertBrowserIsolation,
  assessBrowserIsolation,
  buildSanitizedBrowserEnv,
  describeCurrentBrowserEnvironment,
  isSecretEnvName,
  type BrowserIsolationInput,
} from './browser-isolation-preflight.js';

function input(overrides: Partial<BrowserIsolationInput> = {}): BrowserIsolationInput {
  return {
    chromiumArgs: ['--remote-debugging-port=9222'],
    browserEnvNames: ['PATH', 'HOME', 'DISPLAY'],
    runningAsRoot: false,
    networkPolicyId: 'public-site',
    ...overrides,
  };
}

describe('a clean sandboxed launch', () => {
  it('passes and reports the Chromium sandbox as the profile', () => {
    const result = assessBrowserIsolation(input());
    expect(result.ok).toBe(true);
    expect(result.profile).toBe('chromium-sandbox');
    expect(result.findings).toEqual([]);
  });
});

describe('the sandbox attestation', () => {
  it('blocks an unattested --no-sandbox, which the extra-args env var makes reachable today', () => {
    const result = assessBrowserIsolation(input({ chromiumArgs: ['--no-sandbox'] }));

    expect(result.ok).toBe(false);
    expect(result.profile).toBe('none');
    expect(result.findings[0]?.code).toBe('chromium-sandbox-disabled-without-attestation');
  });

  it('blocks --disable-setuid-sandbox for the same reason', () => {
    const result = assessBrowserIsolation(input({ chromiumArgs: ['--disable-setuid-sandbox'] }));
    expect(result.findings[0]?.code).toBe('chromium-sandbox-disabled-without-attestation');
  });

  it('accepts a declared profile this repository has evaluated', () => {
    const result = assessBrowserIsolation(
      input({
        chromiumArgs: ['--no-sandbox'],
        declaredIsolationProfile: 'rootless-userns-container',
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.profile).toBe('approved-equivalent');
  });

  it('refuses a profile name nobody evaluated, so the attestation cannot be self-issued', () => {
    const result = assessBrowserIsolation(
      input({ chromiumArgs: ['--no-sandbox'], declaredIsolationProfile: 'trust-me' }),
    );

    expect(result.ok).toBe(false);
    expect(result.findings[0]?.code).toBe('unapproved-isolation-profile');
  });
});

describe('flags that widen what a scanned page can reach', () => {
  it.each([
    ['--disable-web-security', 'web-security-disabled'],
    ['--disable-site-isolation-trials', 'web-security-disabled'],
    ['--allow-file-access-from-files', 'local-file-access-enabled'],
  ])('blocks %s', (flag, code) => {
    const result = assessBrowserIsolation(
      input({ chromiumArgs: ['--remote-debugging-port=9222', flag] }),
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(code);
  });

  it('allows the loopback debugging port Lighthouse needs', () => {
    const result = assessBrowserIsolation(
      input({
        chromiumArgs: ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1'],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('blocks a debugging port bound to every interface', () => {
    const result = assessBrowserIsolation(
      input({
        chromiumArgs: ['--remote-debugging-port=9222', '--remote-debugging-address=0.0.0.0'],
      }),
    );

    expect(result.findings.map((finding) => finding.code)).toContain('remote-debugging-exposed');
  });
});

describe('least privilege', () => {
  it('blocks a scan worker running as root', () => {
    const result = assessBrowserIsolation(input({ runningAsRoot: true }));
    expect(result.findings.map((finding) => finding.code)).toContain('running-as-root');
  });

  it('blocks a run under any network policy but the production one', () => {
    const result = assessBrowserIsolation(input({ networkPolicyId: 'test-only-loopback' }));
    expect(result.findings.map((finding) => finding.code)).toContain(
      'non-production-network-policy',
    );
  });
});

describe('credentials in the browser environment', () => {
  it.each([
    'MONGODB_URI',
    'OPENAI_API_KEY',
    'CLOUDINARY_API_SECRET',
    'GITHUB_TOKEN',
    'DATABASE_URL',
    'SMTP_PASSWORD',
    'SENTRY_DSN',
  ])('treats %s as a secret', (name) => {
    expect(isSecretEnvName(name)).toBe(true);
  });

  it.each(['PATH', 'HOME', 'DISPLAY', 'LD_LIBRARY_PATH', 'TMPDIR', 'SSH_AUTH_SOCK'])(
    'leaves %s alone, since Chromium or the toolchain may need it',
    (name) => {
      expect(isSecretEnvName(name)).toBe(false);
    },
  );

  it('blocks a launch whose environment still carries them', () => {
    const result = assessBrowserIsolation(
      input({ browserEnvNames: ['PATH', 'MONGODB_URI', 'OPENAI_API_KEY'] }),
    );

    expect(result.ok).toBe(false);
    const finding = result.findings.find(
      (candidate) => candidate.code === 'credentials-visible-to-browser',
    );
    expect(finding?.detail).toContain('MONGODB_URI');
    expect(finding?.detail).toContain('OPENAI_API_KEY');
  });

  it('strips exactly those variables and keeps the rest', () => {
    const sanitized = buildSanitizedBrowserEnv({
      PATH: '/usr/bin',
      HOME: '/home/scanner',
      MONGODB_URI: 'mongodb://user:pass@host/db',
      OPENAI_API_KEY: 'sk-live',
      ODYSSEUS_CHROMIUM_EXTRA_ARGS: '--no-sandbox',
      UNSET: undefined,
    });

    expect(sanitized).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/scanner',
      ODYSSEUS_CHROMIUM_EXTRA_ARGS: '--no-sandbox',
    });
  });

  it('describes the real launch environment as the sanitized one, so the check agrees with the launch', () => {
    const described = describeCurrentBrowserEnvironment({
      chromiumArgs: ['--remote-debugging-port=9222'],
      networkPolicyId: 'public-site',
      env: { PATH: '/usr/bin', MONGODB_URI: 'mongodb://host/db' },
      getUid: () => 1000,
    });

    expect(described.browserEnvNames).toEqual(['PATH']);
    expect(assessBrowserIsolation(described).ok).toBe(true);
  });
});

describe('stopping the scan', () => {
  it('throws before the browser starts, naming every failure and its remedy', () => {
    const result = assessBrowserIsolation(
      input({ chromiumArgs: ['--no-sandbox'], runningAsRoot: true }),
    );

    expect(() => assertBrowserIsolation(result)).toThrow(/browser isolation preflight failed/u);
    expect(() => assertBrowserIsolation(result)).toThrow(/running-as-root/u);
    expect(() => assertBrowserIsolation(result)).toThrow(/ODYSSEUS_BROWSER_ISOLATION_PROFILE/u);
  });

  it('does nothing when the preflight passed', () => {
    expect(() => assertBrowserIsolation(assessBrowserIsolation(input()))).not.toThrow();
  });
});
