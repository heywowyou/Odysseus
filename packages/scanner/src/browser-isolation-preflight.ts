/**
 * The safety check that runs before a full audit is allowed to start a
 * browser (plan 059 sections 3.10 and 7, definition-of-done item 4).
 *
 * The scanner's job is to execute arbitrary JavaScript written by people who
 * did not ask to be audited, on a machine that also holds the database URI,
 * the model API key and every stored client report. That is a normal thing for
 * a scanner to do and an abnormal thing to do without isolation, so plan 059
 * makes isolation a precondition of scanning rather than a deployment detail
 * nobody checks.
 *
 * Two findings drove the specific checks here.
 *
 * The first is that `--no-sandbox` is already reachable in production:
 * `browser.ts` accepts arbitrary Chromium flags through
 * `ODYSSEUS_CHROMIUM_EXTRA_ARGS` precisely so a rootless container can pass it,
 * and nothing then recorded that Chromium's own sandbox had been turned off.
 * Plan 059 permits running without it, but only behind a container profile
 * that provides equivalent isolation and only when a person has said so. An
 * unattested `--no-sandbox` blocks the scan.
 *
 * The second is that a Chromium launched by `chromium.launch()` inherits the
 * whole server environment. Page JavaScript cannot read `process.env`, so this
 * is not a one-step compromise, but it means every renderer process created to
 * run a stranger's code sits next to `MONGODB_URI` and the OpenAI key for no
 * reason at all. `buildSanitizedBrowserEnv` removes them, and the preflight
 * refuses to start if they are still there.
 *
 * Deliberately a pure function over a described environment, with the actual
 * reading of `process.env` left to `describeCurrentBrowserEnvironment`. The
 * interesting cases - running as root, CDP bound to every interface, a
 * credential still in scope - are all ones a test needs to construct without
 * being in that state itself.
 */

export type IsolationFindingCode =
  | 'chromium-sandbox-disabled-without-attestation'
  | 'unapproved-isolation-profile'
  | 'web-security-disabled'
  | 'local-file-access-enabled'
  | 'remote-debugging-exposed'
  | 'running-as-root'
  | 'credentials-visible-to-browser'
  | 'non-production-network-policy';

export interface IsolationFinding {
  code: IsolationFindingCode;
  detail: string;
  remediation: string;
}

export type BrowserIsolationProfile = 'chromium-sandbox' | 'approved-equivalent' | 'none';

export interface BrowserIsolationPreflightResult {
  ok: boolean;
  profile: BrowserIsolationProfile;
  findings: readonly IsolationFinding[];
}

/**
 * Container profiles accepted in place of Chromium's own sandbox. Adding one
 * is a deployment decision that belongs in `deploy/runbook.md`, not a value a
 * job payload supplies: the point of the list is that a person evaluated the
 * profile, so an open-ended string would defeat it.
 *
 * The current production deployment satisfies NEITHER of these. Trade-off 92
 * records that Chromium runs with `--no-sandbox` as the same unprivileged user,
 * in the same container, as `odysseus serve`, and states plainly that there is
 * no second layer. Running as a non-root user in a shared container is not an
 * isolation profile; it is the configuration the accepted risk is about. So
 * this list deliberately does not contain an entry today's compose file could
 * truthfully declare, and wiring this preflight into scan start will refuse to
 * scan until trade-off 92's own first remedy - a scan container holding no
 * secrets - is actually built.
 */
export const APPROVED_ISOLATION_PROFILES: readonly string[] = [
  // Trade-off 92's preferred remedy: scanning and PDF rendering in their own
  // container, with the artifacts volume and a narrow job channel and none of
  // the mailbox, bucket, model or database credentials. This removes the blast
  // radius without needing the sandbox at all.
  'secretless-scan-container',
  // A kernel-level sandbox substituting for Chromium's own.
  'gvisor',
];

/** Flags that hand a scanned page more reach than it is owed. */
const WEB_SECURITY_FLAGS = ['--disable-web-security', '--disable-site-isolation-trials'];
const FILE_ACCESS_FLAGS = ['--allow-file-access-from-files', '--allow-file-access'];
const SANDBOX_DISABLING_FLAGS = ['--no-sandbox', '--disable-setuid-sandbox'];

/**
 * Environment variable names whose value must never be in the browser
 * process's environment. Matched by shape rather than by an exhaustive list,
 * because the failure mode worth designing against is the variable added next
 * month that nobody remembered to add here.
 */
const SECRET_NAME_PATTERN =
  /(SECRET|PASSWORD|PASSWD|TOKEN|_KEY$|APIKEY|API_KEY|CREDENTIAL|PRIVATE|MONGODB_URI|DATABASE_URL|_DSN$|SESSION)/iu;

/** Names that match the pattern but carry no secret and that Chromium or the
 *  toolchain may legitimately need. Kept short and explicit. */
const SECRET_NAME_EXCEPTIONS = new Set([
  'SSH_AUTH_SOCK',
  'GPG_TTY',
  'XDG_SESSION_TYPE',
  'XDG_SESSION_CLASS',
  'XDG_SESSION_ID',
  'XDG_SESSION_DESKTOP',
]);

export function isSecretEnvName(name: string): boolean {
  if (SECRET_NAME_EXCEPTIONS.has(name)) return false;
  return SECRET_NAME_PATTERN.test(name);
}

/**
 * Strips secret-shaped variables from an environment while leaving everything
 * else alone.
 *
 * A deny list rather than an allow list on purpose. Chromium needs a long and
 * platform-dependent tail of variables - `DISPLAY`, `LD_LIBRARY_PATH`,
 * `XDG_RUNTIME_DIR`, `FONTCONFIG_PATH` and more - and an allow list that
 * missed one would fail as "the browser will not start on this host", which is
 * a worse and much harder-to-diagnose outcome than a secret-shaped variable
 * surviving into a process that cannot read it from JavaScript anyway.
 */
export function buildSanitizedBrowserEnv(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (isSecretEnvName(name)) continue;
    sanitized[name] = value;
  }
  return sanitized;
}

export interface BrowserIsolationInput {
  /** Every Chromium flag the launch will actually use. */
  chromiumArgs: readonly string[];
  /** The operator's attestation, where the platform cannot run the sandbox. */
  declaredIsolationProfile?: string | undefined;
  /** Variable names the browser process will see. */
  browserEnvNames: readonly string[];
  /** Effective uid 0. Least privilege is part of the contract, and a root
   *  Chromium also refuses its own sandbox, so the two usually travel
   *  together. */
  runningAsRoot: boolean;
  /** Which network policy governs the run; only the production one may scan. */
  networkPolicyId: string;
}

function hasFlag(args: readonly string[], flags: readonly string[]): boolean {
  return args.some((arg) => flags.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
}

export function assessBrowserIsolation(
  input: BrowserIsolationInput,
): BrowserIsolationPreflightResult {
  const findings: IsolationFinding[] = [];

  const sandboxDisabled = hasFlag(input.chromiumArgs, SANDBOX_DISABLING_FLAGS);
  const declared = input.declaredIsolationProfile;
  let profile: BrowserIsolationProfile = 'chromium-sandbox';

  if (sandboxDisabled) {
    if (declared === undefined || declared === '') {
      profile = 'none';
      findings.push({
        code: 'chromium-sandbox-disabled-without-attestation',
        detail:
          'Chromium is launched with its sandbox disabled and no equivalent container isolation profile is declared.',
        remediation:
          'Remove the sandbox flag from ODYSSEUS_CHROMIUM_EXTRA_ARGS, or declare an approved profile in ODYSSEUS_BROWSER_ISOLATION_PROFILE.',
      });
    } else if (!APPROVED_ISOLATION_PROFILES.includes(declared)) {
      profile = 'none';
      findings.push({
        code: 'unapproved-isolation-profile',
        detail: `Isolation profile ${JSON.stringify(declared)} is not one this repository has evaluated.`,
        remediation: `Use one of: ${APPROVED_ISOLATION_PROFILES.join(', ')}, and record the evaluation in deploy/runbook.md.`,
      });
    } else {
      profile = 'approved-equivalent';
    }
  }

  if (hasFlag(input.chromiumArgs, WEB_SECURITY_FLAGS)) {
    findings.push({
      code: 'web-security-disabled',
      detail:
        'Chromium is launched with web security or site isolation disabled, so a scanned page is not confined to its own origin.',
      remediation: 'Remove the flag; no Odysseus check requires cross-origin reads.',
    });
  }

  if (hasFlag(input.chromiumArgs, FILE_ACCESS_FLAGS)) {
    findings.push({
      code: 'local-file-access-enabled',
      detail:
        'Chromium is launched with local file access enabled, which puts the artifact store within reach of page-origin code.',
      remediation: 'Remove the flag; artifacts are read by the scanner process, never by a page.',
    });
  }

  // The debug port itself is required, since Lighthouse cannot take a
  // Playwright page. Binding it off-loopback is what turns it into remote
  // control of the browser by anyone who can reach the host.
  const exposedDebugAddress = input.chromiumArgs.find(
    (arg) =>
      arg.startsWith('--remote-debugging-address=') &&
      !['127.0.0.1', 'localhost', '::1'].includes(arg.slice('--remote-debugging-address='.length)),
  );
  if (exposedDebugAddress !== undefined) {
    findings.push({
      code: 'remote-debugging-exposed',
      detail: `The CDP debugging port is bound to ${exposedDebugAddress.split('=')[1]} rather than loopback.`,
      remediation: 'Bind the debugging address to 127.0.0.1.',
    });
  }

  if (input.runningAsRoot) {
    findings.push({
      code: 'running-as-root',
      detail: 'The scan worker is running as root, which breaks the least-privilege requirement.',
      remediation: 'Run the scan worker as an unprivileged user.',
    });
  }

  const visibleSecrets = input.browserEnvNames.filter(isSecretEnvName).sort();
  if (visibleSecrets.length > 0) {
    findings.push({
      code: 'credentials-visible-to-browser',
      detail: `The browser process environment still carries credential-shaped variables: ${visibleSecrets.join(', ')}.`,
      remediation: 'Launch Chromium with buildSanitizedBrowserEnv(process.env).',
    });
  }

  if (input.networkPolicyId !== 'public-site') {
    findings.push({
      code: 'non-production-network-policy',
      detail: `A scan may not run under network policy ${JSON.stringify(input.networkPolicyId)}.`,
      remediation: 'Run the scan under the public-site network policy.',
    });
  }

  return { ok: findings.length === 0, profile, findings };
}

/**
 * Fails the scan before the browser starts.
 *
 * Plan 059 section 21 lists an isolation preflight failure among the
 * conditions that must stop a run, and the point of stopping *here* is that
 * every later stopping point has already executed the page's JavaScript.
 */
export function assertBrowserIsolation(result: BrowserIsolationPreflightResult): void {
  if (result.ok) return;
  const detail = result.findings
    .map((finding) => `  - [${finding.code}] ${finding.detail}\n    ${finding.remediation}`)
    .join('\n');
  throw new Error(
    `odysseus: refusing to start a scan; browser isolation preflight failed.\n${detail}`,
  );
}

export interface DescribeEnvironmentOptions {
  chromiumArgs: readonly string[];
  networkPolicyId: string;
  env?: Readonly<Record<string, string | undefined>>;
  getUid?: () => number | undefined;
}

/** Reads the real process state into the shape `assessBrowserIsolation` takes.
 *  The environment reported is the sanitized one, since that is what the
 *  browser will actually be launched with. */
export function describeCurrentBrowserEnvironment(
  options: DescribeEnvironmentOptions,
): BrowserIsolationInput {
  const env = options.env ?? process.env;
  const getUid = options.getUid ?? (() => process.getuid?.());
  return {
    chromiumArgs: options.chromiumArgs,
    declaredIsolationProfile: env['ODYSSEUS_BROWSER_ISOLATION_PROFILE'],
    browserEnvNames: Object.keys(buildSanitizedBrowserEnv(env)),
    runningAsRoot: getUid() === 0,
    networkPolicyId: options.networkPolicyId,
  };
}
