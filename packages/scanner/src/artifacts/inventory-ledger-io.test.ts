import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InventoryLedger, type InventoryLedgerSnapshot } from '../inventory-ledger.js';
import { reconcileInventoryWithPageVerdicts, writeInventoryLedger } from './inventory-ledger-io.js';

let auditDir: string | undefined;
afterEach(() => {
  if (auditDir !== undefined) rmSync(auditDir, { recursive: true, force: true });
});

const HOME = 'https://leprieuredeboulogne.com/';
const WAVE_404 = 'https://leprieuredeboulogne.com/?page_id=1089';
const FEED = 'https://leprieuredeboulogne.com/feed';

function ledgerWithScannedWavePages(): InventoryLedger {
  const ledger = new InventoryLedger({ evidenceEpoch: 1, scopeDigest: 'sha256:test' });
  const at = new Date('2026-09-29T18:29:15Z');
  for (const url of [HOME, WAVE_404, FEED]) {
    ledger.recordDiscovery({
      url,
      source: url === HOME ? 'start' : 'hydrated-link',
      discoveredAt: at,
      depth: 1,
    });
    ledger.recordDisposition({ url, disposition: 'scanned', decidedAt: at });
  }
  return ledger;
}

describe('reconcileInventoryWithPageVerdicts (plan 075 M4)', () => {
  it('supersedes a scanned disposition the page verdict contradicts, keeping the original', () => {
    auditDir = mkdtempSync(path.join(os.tmpdir(), 'odysseus-inventory-'));
    writeInventoryLedger(auditDir, ledgerWithScannedWavePages().snapshot());

    reconcileInventoryWithPageVerdicts(
      auditDir,
      [
        { url: HOME, status: 'visited' },
        { url: WAVE_404, status: 'http-error-status', httpStatus: 404 },
        { url: FEED, status: 'skipped-non-html' },
      ],
      new Date('2026-09-29T19:17:12Z'),
    );

    const stored = JSON.parse(
      readFileSync(path.join(auditDir, 'evidence', 'inventory-ledger.json'), 'utf8'),
    ) as InventoryLedgerSnapshot;
    const byUrl = new Map(stored.candidates.map((candidate) => [candidate.url, candidate]));
    expect(byUrl.get(HOME)?.disposition?.disposition).toBe('scanned');
    expect(byUrl.get(WAVE_404)?.disposition).toMatchObject({
      disposition: 'http-error-status',
      outcome: 'site-error',
      httpStatus: 404,
    });
    expect(byUrl.get(WAVE_404)?.superseded[0]?.disposition).toBe('scanned');
    expect(byUrl.get(FEED)?.disposition?.disposition).toBe('non-html');
  });

  it('does nothing for an audit without an inventory ledger', () => {
    auditDir = mkdtempSync(path.join(os.tmpdir(), 'odysseus-inventory-'));
    expect(() =>
      reconcileInventoryWithPageVerdicts(
        auditDir!,
        [{ url: FEED, status: 'skipped-non-html' }],
        new Date(),
      ),
    ).not.toThrow();
  });
});
