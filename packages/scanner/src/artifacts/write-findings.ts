import * as fs from 'node:fs';
import path from 'node:path';
import type { Finding } from '@odysseus/core';

// Synchronous write for the same reason as write-audit.ts: this is the
// paid audit's only findings record, and an async libuv write that never
// completes destroys the whole run.
export async function writeFindingsFile(
  auditDir: string,
  findings: readonly Finding[],
): Promise<void> {
  fs.writeFileSync(path.join(auditDir, 'findings.json'), JSON.stringify(findings, null, 2));
}
