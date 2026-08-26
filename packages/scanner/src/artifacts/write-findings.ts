import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Finding } from '@odysseus/core';

export async function writeFindingsFile(
  auditDir: string,
  findings: readonly Finding[],
): Promise<void> {
  await fs.writeFile(path.join(auditDir, 'findings.json'), JSON.stringify(findings, null, 2));
}
