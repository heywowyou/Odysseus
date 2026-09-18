import * as fs from 'node:fs';
import path from 'node:path';
import type { InventoryLedgerSnapshot } from '../inventory-ledger.js';

export const INVENTORY_LEDGER_FILENAME = 'inventory-ledger.json';

export function writeInventoryLedger(
  auditDir: string,
  snapshot: InventoryLedgerSnapshot,
): void {
  const evidenceDir = path.join(auditDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const filePath = path.join(evidenceDir, INVENTORY_LEDGER_FILENAME);
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}
