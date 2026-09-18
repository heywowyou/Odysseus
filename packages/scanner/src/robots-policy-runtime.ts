import type { HostRequestScheduler } from './host-request-scheduler.js';
import type {
  NetworkSafetyDisposition,
  NetworkTargetPolicy,
} from './network-target-policy.js';
import {
  buildRobotsPolicySnapshot,
  describeRobotsPolicyTransition,
  effectiveCrawlDelayMs,
  isPathAllowedForEpoch,
  shouldRevalidateRobots,
  type RobotsPolicyChain,
  type RobotsPolicySnapshot,
  type RobotsPolicyTransition,
} from './robots-policy-snapshot.js';
import { fetchRobotsText, parseRobotsTxt, type RobotsRules } from './robots.js';

export const DEFAULT_ROBOTS_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;

function robotsTarget(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

export class RobotsPolicyTightenedError extends Error {
  readonly newlyDisallowed: readonly string[];

  constructor(urls: readonly string[]) {
    super(
      `robots policy tightened during the audit and now disallows ${urls.length} planned target(s)`,
    );
    this.name = 'RobotsPolicyTightenedError';
    this.newlyDisallowed = urls;
  }
}

export interface RobotsPolicyRuntimeOptions {
  evidenceEpoch: number;
  origin: string;
  userAgent: string;
  configuredDelayMs: number;
  timeoutMs: number;
  scheduler: HostRequestScheduler;
  initialChain: RobotsPolicyChain;
  intervalMs?: number;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
  onChainChanged?: (chain: RobotsPolicyChain) => void;
}

export interface RobotsPolicyRefreshResult {
  revalidated: boolean;
  chain: RobotsPolicyChain;
  transition?: RobotsPolicyTransition;
}

/**
 * Owns the current robots policy chain after crawl discovery. Revalidation is
 * serialized so concurrent scan lanes can all ask before work without racing
 * separate robots requests or creating duplicate revisions.
 */
export class RobotsPolicyRuntime {
  private chainValue: RobotsPolicySnapshot[];
  private refreshPromise: Promise<RobotsPolicyRefreshResult> | undefined;

  constructor(private readonly options: RobotsPolicyRuntimeOptions) {
    this.chainValue = [...options.initialChain];
  }

  get chain(): RobotsPolicyChain {
    return this.chainValue;
  }

  async refresh(
    plannedUrls: readonly string[],
    options: { phaseBoundary?: boolean } = {},
  ): Promise<RobotsPolicyRefreshResult> {
    const due = shouldRevalidateRobots(this.chainValue, new Date(), {
      intervalMs: this.options.intervalMs ?? DEFAULT_ROBOTS_REVALIDATION_INTERVAL_MS,
      ...(options.phaseBoundary === true ? { atPhaseBoundary: true } : {}),
    });
    if (!due.due) return { revalidated: false, chain: this.chainValue };

    this.refreshPromise ??= this.performRefresh(plannedUrls).finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  assertAllowed(url: string): void {
    if (this.chainValue.length === 0) return;
    if (!isPathAllowedForEpoch(this.chainValue, robotsTarget(url))) {
      throw new RobotsPolicyTightenedError([url]);
    }
  }

  private async performRefresh(plannedUrls: readonly string[]): Promise<RobotsPolicyRefreshResult> {
    const robotsText = await this.options.scheduler.schedule(() =>
      fetchRobotsText(
        this.options.origin,
        this.options.timeoutMs,
        this.options.userAgent,
        {
          ...(this.options.networkPolicy !== undefined
            ? { networkPolicy: this.options.networkPolicy }
            : {}),
          ...(this.options.onNetworkSafetyBlocked !== undefined
            ? { onNetworkSafetyBlocked: this.options.onNetworkSafetyBlocked }
            : {}),
        },
      ),
    );
    const rules: RobotsRules =
      robotsText === null
        ? { found: false, disallow: [], allow: [], sitemapUrls: [] }
        : parseRobotsTxt(robotsText, this.options.userAgent);
    const next = buildRobotsPolicySnapshot({
      evidenceEpoch: this.options.evidenceEpoch,
      revision: (this.chainValue.at(-1)?.revision ?? -1) + 1,
      origin: this.options.origin,
      userAgent: this.options.userAgent,
      robotsText,
      retrievedAt: new Date(),
      rules,
      configuredDelayMs: this.options.configuredDelayMs,
    });

    const samplePaths = plannedUrls.map(robotsTarget);
    const transition = describeRobotsPolicyTransition(this.chainValue, next, samplePaths);
    this.chainValue = [...this.chainValue, next];
    this.options.scheduler.raiseDelayTo(effectiveCrawlDelayMs(this.chainValue));
    this.options.onChainChanged?.(this.chainValue);

    if (transition.newlyDisallowed.length > 0) {
      const newlyDisallowed = plannedUrls.filter((url) =>
        transition.newlyDisallowed.includes(robotsTarget(url)),
      );
      throw new RobotsPolicyTightenedError(newlyDisallowed);
    }

    return { revalidated: true, chain: this.chainValue, transition };
  }
}
