import {
  buildAuditScopeSnapshot,
  type AuditConfigSnapshot,
  type AuditScopeSnapshot,
  type ScanIntent,
} from '@odysseus/core';
import { PUBLIC_SITE_NETWORK_POLICY_ID } from '@odysseus/scanner';

export function buildRunAuditScope(input: {
  url: string;
  scanIntent: ScanIntent;
  config: AuditConfigSnapshot;
  maxPagesWasExplicit: boolean;
  maxDepthWasExplicit: boolean;
}): AuditScopeSnapshot {
  const start = new URL(input.url);
  return buildAuditScopeSnapshot({
    evidenceEpoch: 1,
    startUrl: start.href,
    hostAliases: [start.hostname],
    scanIntent: input.scanIntent,
    seeds: [],
    exclusions: [],
    externalTransactionalFlows: [],
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
