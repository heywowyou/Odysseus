import { describe, expect, it } from 'vitest';
import {
  buildAuditScopeSnapshot,
  isScopeTruncationDisclosable,
  verifyAuditScopeSnapshot,
  type AuditScopeSnapshotInput,
} from './audit-scope.js';

function scopeInput(overrides: Partial<AuditScopeSnapshotInput> = {}): AuditScopeSnapshotInput {
  return {
    evidenceEpoch: 1,
    startUrl: 'https://hotel-exemple.fr/',
    hostAliases: ['hotel-exemple.fr', 'www.hotel-exemple.fr'],
    scanIntent: 'full-audit',
    seeds: [],
    exclusions: [],
    externalTransactionalFlows: [],
    bounds: {
      maxPages: { value: Number.MAX_SAFE_INTEGER, origin: 'implementation-default' },
      maxDepth: { value: 5, origin: 'implementation-default' },
      crawlDelayMs: 1000,
      scanConcurrency: 3,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 120_000,
      renderSettleTimeoutMs: 8_000,
    },
    sitemapMode: 'supplement',
    expectedLanguages: [],
    networkPolicyId: 'public-site',
    ...overrides,
  };
}

describe('audit scope snapshot', () => {
  it('gives the same digest to the same scope declared in a different key order', () => {
    const base = scopeInput();
    const reordered: AuditScopeSnapshotInput = {
      networkPolicyId: base.networkPolicyId,
      expectedLanguages: base.expectedLanguages,
      sitemapMode: base.sitemapMode,
      bounds: base.bounds,
      externalTransactionalFlows: base.externalTransactionalFlows,
      exclusions: base.exclusions,
      seeds: base.seeds,
      scanIntent: base.scanIntent,
      hostAliases: base.hostAliases,
      startUrl: base.startUrl,
      evidenceEpoch: base.evidenceEpoch,
    };

    expect(buildAuditScopeSnapshot(reordered).digest).toBe(buildAuditScopeSnapshot(base).digest);
  });

  it('changes the digest when a bound origin changes but its value does not', () => {
    const asDefault = buildAuditScopeSnapshot(scopeInput());
    const asOperator = buildAuditScopeSnapshot(
      scopeInput({
        bounds: { ...scopeInput().bounds, maxDepth: { value: 5, origin: 'operator' } },
      }),
    );

    // The distinction this plan turns on: the same effective depth means a
    // different audit depending on who chose it.
    expect(asOperator.digest).not.toBe(asDefault.digest);
  });

  it('treats seed order as content rather than sorting it away', () => {
    const first = buildAuditScopeSnapshot(
      scopeInput({
        seeds: [
          { url: 'https://hotel-exemple.fr/chambres', origin: 'operator' },
          { url: 'https://hotel-exemple.fr/tarifs', origin: 'operator' },
        ],
      }),
    );
    const swapped = buildAuditScopeSnapshot(
      scopeInput({
        seeds: [
          { url: 'https://hotel-exemple.fr/tarifs', origin: 'operator' },
          { url: 'https://hotel-exemple.fr/chambres', origin: 'operator' },
        ],
      }),
    );

    expect(swapped.digest).not.toBe(first.digest);
  });

  it('separates a scope by evidence epoch and by network policy profile', () => {
    const base = buildAuditScopeSnapshot(scopeInput());
    expect(buildAuditScopeSnapshot(scopeInput({ evidenceEpoch: 2 })).digest).not.toBe(base.digest);
    expect(buildAuditScopeSnapshot(scopeInput({ networkPolicyId: 'test-only' })).digest).not.toBe(
      base.digest,
    );
  });

  it('verifies an untouched snapshot and refuses one edited after freezing', () => {
    const snapshot = buildAuditScopeSnapshot(scopeInput());
    expect(verifyAuditScopeSnapshot(snapshot)).toBe(true);

    const widened = {
      ...snapshot,
      exclusions: [{ pattern: '/blog/*', origin: 'operator' as const }],
    };
    expect(verifyAuditScopeSnapshot(widened)).toBe(false);
  });
});

describe('scope truncation disclosability', () => {
  it('refuses to excuse a paid full audit truncated by a shipped default', () => {
    const snapshot = buildAuditScopeSnapshot(scopeInput());
    expect(isScopeTruncationDisclosable(snapshot, 'maxPages')).toBe(false);
    expect(isScopeTruncationDisclosable(snapshot, 'maxDepth')).toBe(false);
  });

  it('allows disclosure when the operator narrowed that bound on purpose', () => {
    const snapshot = buildAuditScopeSnapshot(
      scopeInput({
        bounds: { ...scopeInput().bounds, maxPages: { value: 40, origin: 'operator' } },
      }),
    );

    expect(isScopeTruncationDisclosable(snapshot, 'maxPages')).toBe(true);
    // Narrowing pages says nothing about depth, which is still a default.
    expect(isScopeTruncationDisclosable(snapshot, 'maxDepth')).toBe(false);
  });

  it('leaves a quick check free to be bounded by its own defaults', () => {
    const snapshot = buildAuditScopeSnapshot(scopeInput({ scanIntent: 'quick-check' }));
    expect(isScopeTruncationDisclosable(snapshot, 'maxPages')).toBe(true);
  });
});
