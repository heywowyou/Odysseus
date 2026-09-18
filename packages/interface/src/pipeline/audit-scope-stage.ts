import {
  buildAuditScopeSnapshot,
  type AuditConfigSnapshot,
  type AuditScopeSnapshot,
  type ScanIntent,
} from '@odysseus/core';
import { PUBLIC_SITE_NETWORK_POLICY_ID } from '@odysseus/scanner';

export interface RunAuditScopeInput {
  url: string;
  scanIntent: ScanIntent;
  config: AuditConfigSnapshot;
  maxPagesWasExplicit: boolean;
  maxDepthWasExplicit: boolean;
  seeds?: readonly string[];
  exclusions?: readonly string[];
  bookingEngineUrl?: string;
}

export function buildRunAuditScope(input: RunAuditScopeInput): AuditScopeSnapshot {
  const start = new URL(input.url);
  const pairedHost = start.hostname.startsWith('www.')
    ? start.hostname.slice('www.'.length)
    : `www.${start.hostname}`;

  return buildAuditScopeSnapshot({
    evidenceEpoch: 1,
    startUrl: start.href,
    hostAliases: [...new Set([start.hostname, pairedHost])].sort(),
    scanIntent: input.scanIntent,
    seeds: (input.seeds ?? []).map((url) => ({ url, origin: 'operator' as const })),
    exclusions: (input.exclusions ?? []).map((pattern) => ({
      pattern,
      origin: 'operator' as const,
    })),
    externalTransactionalFlows:
      input.bookingEngineUrl === undefined
        ? []
        : [{ url: input.bookingEngineUrl, origin: 'operator' as const }],
    bounds: {
      maxPages: {
        value: input.config.maxPages,
        origin: input.maxPagesWasExplicit ? 'operator' : 'implementation-default',
      },
      maxDepth: {
        value: input.config.maxDepth,
        origin: input.maxDepthWasExplicit ? 'operator' : 'implementation-default',
      },
      crawlDelayMs: input.config.crawlDelayMs,
      scanConcurrency: input.config.scanConcurrency,
      pageTimeoutMs: input.config.pageTimeoutMs,
      lighthouseTimeoutMs: input.config.lighthouseTimeoutMs,
      renderSettleTimeoutMs: input.config.renderSettleTimeoutMs ?? 0,
    },
    sitemapMode: input.config.sitemapMode ?? 'supplement',
    expectedLanguages: [],
    networkPolicyId: PUBLIC_SITE_NETWORK_POLICY_ID,
  });
}
