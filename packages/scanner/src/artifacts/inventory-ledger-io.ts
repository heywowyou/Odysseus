import * as fs from 'node:fs';
import path from 'node:path';
import type { ManifestPageStatus } from '@odysseus/core';
import {
  InventoryLedger,
  type InventoryDisposition,
  type InventoryLedgerSnapshot,
} from '../inventory-ledger.js';

const INVENTORY_LEDGER_FILENAME = 'inventory-ledger.json';

export function writeInventoryLedger(auditDir: string, snapshot: InventoryLedgerSnapshot): void {
  const evidenceDir = path.join(auditDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const filePath = path.join(evidenceDir, INVENTORY_LEDGER_FILENAME);
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

/** The page verdicts that contradict a `scanned` inventory disposition, and
 *  the disposition the crawl would have recorded for them. */
const VERDICT_DISPOSITIONS: Partial<Record<ManifestPageStatus, InventoryDisposition>> = {
  'http-error-status': 'http-error-status',
  'skipped-non-html': 'non-html',
};

/**
 * Plan 075 M4. A discovery-wave page is disposed `scanned` when it is
 * admitted, before anything reads its answer, and the page verdict decided at
 * write time can then find a 404 or a feed. The evidence graph counts
 * dispositions while the coverage counts statuses, so the same report stated
 * « 11 erreurs HTTP » and « 7 pages ont répondu par une erreur HTTP ». Each
 * contradicted disposition is superseded, keeping the original.
 */
export function reconcileInventoryWithPageVerdicts(
  auditDir: string,
  pages: readonly { url: string; status: ManifestPageStatus; httpStatus?: number }[],
  decidedAt: Date,
): void {
  const filePath = path.join(auditDir, 'evidence', INVENTORY_LEDGER_FILENAME);
  if (!fs.existsSync(filePath)) return;
  const ledger = InventoryLedger.fromSnapshot(
    JSON.parse(fs.readFileSync(filePath, 'utf8')) as InventoryLedgerSnapshot,
  );
  let changed = false;
  for (const page of pages) {
    const disposition = VERDICT_DISPOSITIONS[page.status];
    if (disposition === undefined) continue;
    if (ledger.candidate(page.url)?.disposition?.disposition !== 'scanned') continue;
    ledger.supersedeDisposition({
      url: page.url,
      disposition,
      decidedAt,
      ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
      justification: `the page verdict after the scan found ${page.status}`,
    });
    changed = true;
  }
  if (changed) writeInventoryLedger(auditDir, ledger.snapshot());
}
