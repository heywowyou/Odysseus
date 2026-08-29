import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AuditManifest } from '@odysseus/core';

export async function writeManifestFile(auditDir: string, manifest: AuditManifest): Promise<void> {
  await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
