import { describe, expect, it } from 'vitest';
import {
  buildAuditScopeSnapshot,
  type AuditScopeSnapshot,
  type ScanIntent,
  type ScopeBoundOrigin,
} from '@odysseus/core';
import {
  InventoryLedger,
  inventoryOutcomeOf,
  type InventoryLedgerSnapshot,
} from './inventory-ledger.js';

const SCOPE_DIGEST = 'sha256:scope';
const AT = new Date('2026-09-18T09:00:00.000Z');
const LATER = new Date('2026-09-18T11:00:00.000Z');

function ledger(): InventoryLedger {
  return new InventoryLedger({ evidenceEpoch: 1, scopeDigest: SCOPE_DIGEST });
}

function scopeOf(
  overrides: {
    scanIntent?: ScanIntent;
    maxPagesOrigin?: ScopeBoundOrigin;
    maxDepthOrigin?: ScopeBoundOrigin;
  } = {},
): AuditScopeSnapshot {
  return buildAuditScopeSnapshot({
    evidenceEpoch: 1,
    startUrl: 'https://hotel-exemple.fr/',
    hostAliases: ['hotel-exemple.fr'],
    scanIntent: overrides.scanIntent ?? 'full-audit',
    seeds: [],
    exclusions: [],
    externalTransactionalFlows: [],
    bounds: {
      maxPages: { value: 200, origin: overrides.maxPagesOrigin ?? 'implementation-default' },
      maxDepth: { value: 4, origin: overrides.maxDepthOrigin ?? 'implementation-default' },
      crawlDelayMs: 1000,
      scanConcurrency: 1,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 120_000,
      renderSettleTimeoutMs: 5000,
    },
    sitemapMode: 'supplement',
    expectedLanguages: [],
    networkPolicyId: 'production',
  });
}

describe('candidate identity and discovery provenance', () => {
  it('keeps one row per identity so a page found twice is not inventoried twice', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'link',
      discoveredAt: AT,
      referrer: 'https://hotel-exemple.fr/',
    });
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'sitemap',
      discoveredAt: LATER,
    });

    expect(inventory.candidates()).toHaveLength(1);
  });

  it('adds the second route instead of replacing the first, so a sitemap orphan stays distinguishable from a linked page', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'link',
      discoveredAt: AT,
      referrer: 'https://hotel-exemple.fr/',
    });
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'sitemap',
      discoveredAt: LATER,
    });

    const candidate = inventory.candidate('https://hotel-exemple.fr/chambres');
    expect(candidate?.discoveries.map((discovery) => discovery.source)).toEqual([
      'link',
      'sitemap',
    ]);
    expect(candidate?.discoveries[0]?.referrer).toBe('https://hotel-exemple.fr/');
    expect(candidate?.discoveries[0]?.discoveredAt).toBe(AT.toISOString());
  });

  it('keeps two routes that share a source, so a page linked from two places keeps both referrers', () => {
    const inventory = ledger();
    for (const referrer of ['https://hotel-exemple.fr/', 'https://hotel-exemple.fr/tarifs']) {
      inventory.recordDiscovery({
        url: 'https://hotel-exemple.fr/chambres',
        source: 'link',
        discoveredAt: AT,
        referrer,
      });
    }

    expect(inventory.candidate('https://hotel-exemple.fr/chambres')?.discoveries).toHaveLength(2);
  });

  it('ignores an exact repeat of one route so a page linked twice from the same page does not inflate its provenance', () => {
    const inventory = ledger();
    for (let index = 0; index < 3; index += 1) {
      inventory.recordDiscovery({
        url: 'https://hotel-exemple.fr/chambres',
        source: 'link',
        discoveredAt: AT,
        referrer: 'https://hotel-exemple.fr/',
      });
    }

    expect(inventory.candidate('https://hotel-exemple.fr/chambres')?.discoveries).toHaveLength(1);
  });

  it('records the spelling actually seen when it merged into a normalized identity, so the merge can be audited', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'link',
      discoveredAt: AT,
      observedUrl: 'https://hotel-exemple.fr/chambres/',
    });
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'hreflang',
      discoveredAt: AT,
      observedUrl: 'https://hotel-exemple.fr/chambres',
    });

    const discoveries = inventory.candidate('https://hotel-exemple.fr/chambres')?.discoveries;
    expect(discoveries?.[0]?.observedUrl).toBe('https://hotel-exemple.fr/chambres/');
    // Identical to the identity, so there is nothing to explain and nothing
    // recorded.
    expect(discoveries?.[1]?.observedUrl).toBeUndefined();
  });

  it('does not reopen a disposed candidate when a later surface rediscovers it', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/prive',
      source: 'link',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/prive',
      disposition: 'robots',
      decidedAt: AT,
      detail: 'Disallow: /prive',
    });
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/prive',
      source: 'hydrated-link',
      discoveredAt: LATER,
      surfaceId: 'surface-7',
    });

    const candidate = inventory.candidate('https://hotel-exemple.fr/prive');
    expect(candidate?.disposition?.disposition).toBe('robots');
    expect(candidate?.discoveries).toHaveLength(2);
    expect(inventory.reconcile().reconciled).toBe(true);
  });
});

describe('terminal dispositions', () => {
  function disposed(): InventoryLedger {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/spa',
      source: 'link',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/spa',
      disposition: 'error',
      decidedAt: AT,
      detail: 'navigation timeout',
      attemptRefs: ['attempt-1'],
    });
    return inventory;
  }

  it('refuses a second disposition so an outcome cannot be silently re-explained', () => {
    expect(() =>
      disposed().recordDisposition({
        url: 'https://hotel-exemple.fr/spa',
        disposition: 'scanned',
        decidedAt: LATER,
      }),
    ).toThrow(/already disposed as 'error'/u);
  });

  it('keeps the answer it replaced when recovery supersedes it, so the audit trail shows both', () => {
    const inventory = disposed();
    inventory.supersedeDisposition({
      url: 'https://hotel-exemple.fr/spa',
      disposition: 'scanned',
      decidedAt: LATER,
      justification: 'targeted recovery pass succeeded on attempt 2',
      attemptRefs: ['attempt-1', 'attempt-2'],
      evidenceRefs: ['sha256:page-spa'],
    });

    const candidate = inventory.candidate('https://hotel-exemple.fr/spa');
    expect(candidate?.disposition?.disposition).toBe('scanned');
    expect(candidate?.superseded).toHaveLength(1);
    expect(candidate?.superseded[0]?.disposition).toBe('error');
    expect(candidate?.superseded[0]?.justification).toMatch(/recovery/u);
    expect(candidate?.superseded[0]?.supersededAt).toBe(LATER.toISOString());
  });

  it('refuses to supersede a candidate that never had an answer, so a supersession always names what it replaced', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/spa',
      source: 'link',
      discoveredAt: AT,
    });

    expect(() =>
      inventory.supersedeDisposition({
        url: 'https://hotel-exemple.fr/spa',
        disposition: 'scanned',
        decidedAt: LATER,
        justification: 'nothing to replace',
      }),
    ).toThrow(/no disposition to supersede/u);
  });

  it('refuses a disposition for a URL nobody discovered, so the ledger answers for exactly what it holds', () => {
    expect(() =>
      ledger().recordDisposition({
        url: 'https://hotel-exemple.fr/fantome',
        disposition: 'scanned',
        decidedAt: AT,
      }),
    ).toThrow(/never discovered/u);
  });

  it('derives the outcome from the cause, so the site answering 404 is never filed as our scanner failing', () => {
    expect(inventoryOutcomeOf('http-error-status')).toBe('site-error');
    expect(inventoryOutcomeOf('error')).toBe('scan-failed');
    expect(inventoryOutcomeOf('page-cap')).toBe('omitted');
    expect(inventoryOutcomeOf('link-discovery-only')).toBe('discovered-not-scanned');
  });

  it('carries the redirect target and attempt references onto the disposition', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/reserver',
      source: 'link',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/reserver',
      disposition: 'external',
      decidedAt: AT,
      finalUrl: 'https://booking.example.com/hotel-exemple',
      httpStatus: 301,
      attemptRefs: ['attempt-9'],
    });

    const disposition = inventory.candidate('https://hotel-exemple.fr/reserver')?.disposition;
    expect(disposition?.finalUrl).toBe('https://booking.example.com/hotel-exemple');
    expect(disposition?.httpStatus).toBe(301);
    expect(disposition?.attemptRefs).toEqual(['attempt-9']);
  });
});

describe('reconciliation and the bounded discovery fixed point', () => {
  it('names the candidates still owed an answer rather than reporting a bare count', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/',
      source: 'start',
      discoveredAt: AT,
    });
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/chambres',
      source: 'link',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/',
      disposition: 'scanned',
      decidedAt: AT,
    });

    expect(inventory.reconcile()).toEqual({
      reconciled: false,
      candidateCount: 2,
      dispositionedCount: 1,
      unreconciledUrls: ['https://hotel-exemple.fr/chambres'],
    });
  });

  it('is not at the fixed point while a hydrated discovery is still pending, so the wave cannot be declared the last one', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/',
      source: 'start',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/',
      disposition: 'scanned',
      decidedAt: AT,
    });
    expect(inventory.isDiscoveryFixedPointReached()).toBe(true);

    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/offres',
      source: 'hydrated-link',
      discoveredAt: LATER,
      referrer: 'https://hotel-exemple.fr/',
      surfaceId: 'surface-3',
    });

    expect(inventory.isDiscoveryFixedPointReached()).toBe(false);
    expect(inventory.pendingCandidateUrls()).toEqual(['https://hotel-exemple.fr/offres']);
  });

  it('treats a refusal as an answer, so a robots-excluded page closes its question instead of hanging the audit', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/prive',
      source: 'link',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/prive',
      disposition: 'robots',
      decidedAt: AT,
    });

    expect(inventory.isDiscoveryFixedPointReached()).toBe(true);
    expect(inventory.reconcile().reconciled).toBe(true);
  });
});

describe('truncation by our own page and depth bounds', () => {
  function omitting(disposition: 'page-cap' | 'depth-bound', url: string): InventoryLedger {
    const inventory = ledger();
    inventory.recordDiscovery({ url, source: 'link', discoveredAt: AT, depth: 5 });
    inventory.recordDisposition({ url, disposition, decidedAt: AT });
    return inventory;
  }

  it('reports no truncation when every candidate was answered for a reason of its own', () => {
    const inventory = ledger();
    inventory.recordDiscovery({
      url: 'https://hotel-exemple.fr/brochure.pdf',
      source: 'link',
      discoveredAt: AT,
    });
    inventory.recordDisposition({
      url: 'https://hotel-exemple.fr/brochure.pdf',
      disposition: 'non-html',
      decidedAt: AT,
    });

    expect(inventory.assessTruncation(scopeOf())).toMatchObject({
      truncated: false,
      status: 'none',
      blockingBounds: [],
    });
  });

  it('blocks a paid full audit that stopped at the shipped page cap with eligible pages left over', () => {
    const assessment = omitting('page-cap', 'https://hotel-exemple.fr/chambre-12').assessTruncation(
      scopeOf(),
    );

    expect(assessment.truncated).toBe(true);
    expect(assessment.status).toBe('blocking');
    expect(assessment.blockingBounds).toEqual(['maxPages']);
    expect(assessment.pageCapOmittedUrls).toEqual(['https://hotel-exemple.fr/chambre-12']);
  });

  it('blocks a depth bound on exactly the same terms as a page cap, because an omitted page is omitted either way', () => {
    const assessment = omitting(
      'depth-bound',
      'https://hotel-exemple.fr/blog/2024/03/article',
    ).assessTruncation(scopeOf());

    expect(assessment.status).toBe('blocking');
    expect(assessment.blockingBounds).toEqual(['maxDepth']);
    expect(assessment.depthBoundOmittedUrls).toHaveLength(1);
  });

  it('discloses rather than blocks when the operator narrowed the scope on purpose', () => {
    const assessment = omitting('page-cap', 'https://hotel-exemple.fr/chambre-12').assessTruncation(
      scopeOf({ maxPagesOrigin: 'operator' }),
    );

    expect(assessment.status).toBe('disclosable');
    expect(assessment.disclosableBounds).toEqual(['maxPages']);
    expect(assessment.blockingBounds).toEqual([]);
  });

  it('discloses an implementation bound outside a paid full audit, where being bounded is the point', () => {
    const assessment = omitting('depth-bound', 'https://hotel-exemple.fr/deep').assessTruncation(
      scopeOf({ scanIntent: 'quick-check' }),
    );

    expect(assessment.status).toBe('disclosable');
  });

  it('blocks when only one of the two bounds was operator-chosen, so a deliberate page cap cannot excuse a default depth bound', () => {
    const inventory = ledger();
    for (const [url, disposition] of [
      ['https://hotel-exemple.fr/chambre-12', 'page-cap'],
      ['https://hotel-exemple.fr/blog/deep', 'depth-bound'],
    ] as const) {
      inventory.recordDiscovery({ url, source: 'link', discoveredAt: AT });
      inventory.recordDisposition({ url, disposition, decidedAt: AT });
    }

    const assessment = inventory.assessTruncation(scopeOf({ maxPagesOrigin: 'operator' }));
    expect(assessment.status).toBe('blocking');
    expect(assessment.disclosableBounds).toEqual(['maxPages']);
    expect(assessment.blockingBounds).toEqual(['maxDepth']);
  });

  it('does not count a continuation-guard or network-safety omission as an implementation bound, since no budget would admit them', () => {
    const inventory = ledger();
    for (const [url, disposition] of [
      ['https://hotel-exemple.fr/agenda?page=900', 'continuation-guard'],
      ['https://hotel-exemple.fr/proxy?to=169.254.169.254', 'network-safety'],
      ['https://hotel-exemple.fr/interne', 'operator-excluded'],
    ] as const) {
      inventory.recordDiscovery({ url, source: 'link', discoveredAt: AT });
      inventory.recordDisposition({ url, disposition, decidedAt: AT });
    }

    expect(inventory.assessTruncation(scopeOf()).truncated).toBe(false);
  });
});

describe('checkpointing and the ledger digest', () => {
  function populated(order: 'forwards' | 'backwards'): InventoryLedger {
    const inventory = ledger();
    const urls = ['https://hotel-exemple.fr/a', 'https://hotel-exemple.fr/b'];
    for (const url of order === 'forwards' ? urls : [...urls].reverse()) {
      inventory.recordDiscovery({ url, source: 'link', discoveredAt: AT });
      inventory.recordDisposition({ url, disposition: 'scanned', decidedAt: AT });
    }
    return inventory;
  }

  it('digests the same inventory identically whatever order the frontier happened to find it in', () => {
    expect(populated('forwards').digest()).toBe(populated('backwards').digest());
  });

  it('changes the digest when an outcome changes, so a swapped disposition cannot pass as the same evidence', () => {
    const before = populated('forwards').digest();
    const after = populated('forwards');
    after.supersedeDisposition({
      url: 'https://hotel-exemple.fr/a',
      disposition: 'error',
      decidedAt: LATER,
      justification: 'later revalidation found the page unreachable',
    });

    expect(after.digest()).not.toBe(before);
  });

  it('survives a JSON round trip unchanged, so a resumed run keeps every candidate it had already answered for', () => {
    const original = populated('forwards');
    const restored = InventoryLedger.fromSnapshot(
      JSON.parse(JSON.stringify(original.snapshot())) as InventoryLedgerSnapshot,
    );

    expect(restored.digest()).toBe(original.digest());
    expect(restored.reconcile()).toEqual(original.reconcile());
  });

  it('refuses a snapshot written by another ledger version, so restored coverage means what this code thinks it means', () => {
    const snapshot = { ...populated('forwards').snapshot(), ledgerVersion: 'inventory-ledger-v0' };

    expect(() => InventoryLedger.fromSnapshot(snapshot as InventoryLedgerSnapshot)).toThrow(
      /does not match this code/u,
    );
  });

  it('refuses to lose a disposition a resumed run had already recorded', () => {
    const restored = InventoryLedger.fromSnapshot(populated('forwards').snapshot());

    expect(() =>
      restored.recordDisposition({
        url: 'https://hotel-exemple.fr/a',
        disposition: 'page-cap',
        decidedAt: LATER,
      }),
    ).toThrow(/already disposed/u);
  });
});
