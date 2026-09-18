/**
 * Plan 059 step 39 fault-injection cases for the scope/inventory rows of the
 * section 18 adversarial evidence matrix that are exercisable offline: every
 * discovery provenance and disposition the inventory ledger records, the
 * bound-truncation disclosure/blocking split, duplicate merging, and the
 * seeds and exclusions an operator sets. Each case runs through the real
 * assembly and approval pipeline via the harness. Deterministic and offline.
 */
import { describe, expect, it } from 'vitest';
import {
  assertApproved,
  assertFailClosed,
  inputForScope,
  inputWithInventoryRows,
  runFaultCase,
  type EvidenceFaultCase,
  type FaultCaseResult,
  type InventoryRowInput,
} from './evidence-quality-harness.js';
import { ORIGIN, scope } from './evidence-graph-fixtures.js';

const SEED = `${ORIGIN}/salles`;

describe('scope/inventory matrix rows', () => {
  it('blocks a sitemap orphan that never received a terminal disposition', () => {
    const orphan = `${ORIGIN}/plan-du-site-seul`;
    const result = runFaultCase({
      id: 'scope/sitemap-orphan-undispositioned',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [{ url: orphan, source: 'sitemap' }]),
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('inventory-unreconciled');
    const unreconciled = result.issues.find((issue) => issue.code === 'inventory-unreconciled');
    expect(unreconciled?.evidenceRefs).toContain(orphan);
  });

  it('blocks a default page cap that left eligible pages unscanned', () => {
    const cut = `${ORIGIN}/sejour-41`;
    const result = runFaultCase({
      id: 'scope/page-cap-default-bound-blocks',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: cut, source: 'link', disposition: 'page-cap' },
        ]),
      }),
    });
    assertFailClosed(result);
    expect(result.verdict).toBe('needs-operator-review');
    expect(result.blockingCodes).toContain('inventory-unreconciled');
    // A shipped default shrinking a paid full audit is not a disclosure.
    expect(result.disclosureCodes).toEqual([]);
    const unreconciled = result.issues.find((issue) => issue.code === 'inventory-unreconciled');
    expect(unreconciled?.evidenceRefs).toContain(cut);
  });

  it('discloses an operator page cap instead of blocking', () => {
    const base = scope();
    const frozen = scope({
      bounds: { ...base.bounds, maxPages: { value: 2, origin: 'operator' } },
    });
    const result = runFaultCase({
      id: 'scope/page-cap-operator-bound-discloses',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(frozen, [
          { url: `${ORIGIN}/sejour-41`, source: 'link', disposition: 'page-cap' },
        ]),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-with-known-limitations');
    expect(result.disclosureCodes).toContain('scope-bound-truncation');
  });

  it('blocks a default depth bound that left eligible pages unscanned', () => {
    const deep = `${ORIGIN}/chambres/suite/etage/7`;
    const result = runFaultCase({
      id: 'scope/depth-bound-default-blocks',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: deep, source: 'link', disposition: 'depth-bound' },
        ]),
      }),
    });
    assertFailClosed(result);
    expect(result.verdict).toBe('needs-operator-review');
    expect(result.blockingCodes).toContain('inventory-unreconciled');
  });

  it('discloses a robots-disallowed page and still approves', () => {
    const result = runFaultCase({
      id: 'scope/robots-disallowed-page-discloses',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: `${ORIGIN}/prive`, source: 'link', disposition: 'robots' },
        ]),
      }),
    });
    assertApproved(result);
    expect(result.disclosureCodes).toContain('robots-disallowed-pages');
  });

  it('blocks rendered-only and hydrated-only discoveries left without a disposition', () => {
    const rendered = `${ORIGIN}/route-client`;
    const hydrated = `${ORIGIN}/donnees-apres-hydratation`;
    const result = runFaultCase({
      id: 'scope/rendered-hydrated-only-links-need-dispositions',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: rendered, source: 'rendered-link' },
          { url: hydrated, source: 'hydrated-link' },
        ]),
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('inventory-unreconciled');
    const unreconciled = result.issues.find((issue) => issue.code === 'inventory-unreconciled');
    expect(unreconciled?.evidenceRefs).toContain(rendered);
    expect(unreconciled?.evidenceRefs).toContain(hydrated);
  });

  it('blocks a hreflang-only language page left without a disposition', () => {
    const english = `${ORIGIN}/en`;
    const result = runFaultCase({
      id: 'scope/hreflang-only-page-needs-disposition',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [{ url: english, source: 'hreflang' }]),
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('inventory-unreconciled');
  });

  it('omits extension-dropped PDF/image candidates without inventing a gap', () => {
    const result = runFaultCase({
      id: 'scope/extension-dropped-pdf-image',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: `${ORIGIN}/carte-menus.pdf`, source: 'link', disposition: 'non-html' },
          { url: `${ORIGIN}/piscine.jpg`, source: 'link', disposition: 'non-html' },
        ]),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-complete');
    expect(result.issueCodes).toEqual([]);
  });

  it('merges trailing-slash spelling duplicates onto one page identity', () => {
    const roomsUrl = `${ORIGIN}/chambres`;
    const result = runFaultCase({
      id: 'scope/trailing-slash-duplicates-merge',
      inject: (clean) => ({
        ...clean,
        inventory: inputWithInventoryRows(clean.scope, [
          {
            url: roomsUrl,
            source: 'link',
            referrer: `${ORIGIN}/destinations`,
            observedUrl: `${roomsUrl}/`,
          },
        ]).inventory,
      }),
    });
    assertApproved(result);
    // The identity ledger holds one candidate for the page, whatever spelling
    // the links used, and keeps the observed spelling beside it.
    const spellings = result.input.inventory.candidates.filter(
      (candidate) => candidate.url.replace(/\/+$/u, '') === roomsUrl,
    );
    expect(spellings).toHaveLength(1);
    expect(
      spellings[0]?.discoveries.some((discovery) => discovery.observedUrl === `${roomsUrl}/`),
    ).toBe(true);
    // One coverage cell per check for the merged identity, not two.
    const cells = result.graph.coverage.entries.filter(
      (entry) => entry.checkId === 'axe' && entry.targetKey === `page:${roomsUrl}`,
    );
    expect(cells).toHaveLength(1);
  });

  it('does not over-merge similar pages', () => {
    const result = runFaultCase({
      id: 'scope/similar-pages-stay-distinct',
      inject: (clean) => ({
        ...clean,
        ...inputForScope(clean.scope, [
          `${ORIGIN}/chambres/suite-rouge`,
          `${ORIGIN}/chambres/suite-bleue`,
        ]),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-complete');
    const axeTargets = result.graph.coverage.entries
      .filter((entry) => entry.checkId === 'axe')
      .map((entry) => entry.targetKey);
    expect(axeTargets).toHaveLength(4);
    expect(axeTargets).toContain(`page:${ORIGIN}/chambres/suite-rouge`);
    expect(axeTargets).toContain(`page:${ORIGIN}/chambres/suite-bleue`);
  });

  it('approves a sparse single-page graph with no sitemap anywhere', () => {
    const result = runFaultCase({
      id: 'scope/sparse-graph-no-sitemap',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, []),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-complete');
    expect(result.issueCodes).toEqual([]);
  });

  it('approves a manually seeded page that was scanned', () => {
    const frozen = scope({ seeds: [{ url: SEED, origin: 'operator', reason: 'salles rejected' }] });
    const result = runFaultCase({
      id: 'scope/manual-seed-scanned-approves',
      inject: (clean) => ({
        ...clean,
        ...inputForScope(frozen, [SEED]),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-complete');
    expect(result.issueCodes).toEqual([]);
  });

  it('blocks a manually seeded page that lacks its scan evidence', () => {
    const frozen = scope({ seeds: [{ url: SEED, origin: 'operator' }] });
    const result = runFaultCase({
      id: 'scope/manual-seed-unscanned-blocks',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(frozen, [
          { url: SEED, source: 'seed', disposition: 'link-discovery-only' },
        ]),
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('unresolved-material-gap');
    const gap = result.issues.find(
      (issue) => issue.code === 'unresolved-material-gap' && issue.summary.includes('seed'),
    );
    expect(gap?.evidenceRefs).toContain(SEED);
  });

  it('discloses an operator exclusion instead of counting it as a gap', () => {
    const result = runFaultCase({
      id: 'scope/operator-exclusion-discloses',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: `${ORIGIN}/espace-perso`, source: 'link', disposition: 'operator-excluded' },
        ]),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-with-known-limitations');
    expect(result.disclosureCodes).toContain('operator-excluded-pages');
  });

  it('discloses a continuation-family bound without blocking', () => {
    const result = runFaultCase({
      id: 'scope/continuation-family-bound-discloses',
      inject: (clean) => ({
        ...clean,
        ...inputWithInventoryRows(clean.scope, [
          { url: `${ORIGIN}/sejour?page=41`, source: 'link', disposition: 'continuation-guard' },
        ]),
      }),
    });
    assertApproved(result);
    expect(result.disclosureCodes).toContain('continuation-family-bound');
  });

  it('treats every disposition row the same way twice (harness determinism)', () => {
    const rows: readonly InventoryRowInput[] = [
      { url: `${ORIGIN}/prive`, source: 'link', disposition: 'robots' },
    ];
    const cases: readonly EvidenceFaultCase[] = [
      {
        id: 'scope/determinism-first',
        inject: (clean) => ({ ...clean, ...inputWithInventoryRows(clean.scope, rows) }),
      },
      {
        id: 'scope/determinism-second',
        inject: (clean) => ({ ...clean, ...inputWithInventoryRows(clean.scope, rows) }),
      },
    ];
    const first: FaultCaseResult = runFaultCase(cases[0]!);
    const second: FaultCaseResult = runFaultCase(cases[1]!);
    expect(second.graph.raw.digest).toBe(first.graph.raw.digest);
    expect(second.verdict).toBe(first.verdict);
  });
});
