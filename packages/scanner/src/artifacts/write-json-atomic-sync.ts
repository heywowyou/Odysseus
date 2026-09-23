import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface AtomicJsonFileOps {
  writeFileSync(filePath: string, data: string, encoding: 'utf8'): unknown;
  renameSync(oldPath: string, newPath: string): unknown;
  rmSync(filePath: string, options: { force: true }): unknown;
}

/** Write JSON beside its target, then atomically replace the target by rename. */
export function writeJsonAtomicSync(
  filePath: string,
  value: unknown,
  fileOps: AtomicJsonFileOps = fs,
): void {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) throw new TypeError('writeJsonAtomicSync cannot serialize undefined');

  const temporary = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  try {
    fileOps.writeFileSync(temporary, `${json}\n`, 'utf8');
    fileOps.renameSync(temporary, filePath);
  } catch (error) {
    try {
      fileOps.rmSync(temporary, { force: true });
    } catch {
      // Keep the original write/rename error; cleanup is best effort.
    }
    throw error;
  }
}
