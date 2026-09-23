import path from 'node:path';
import type { AuditManifest } from '@odysseus/core';
import { writeJsonAtomicSync } from './write-json-atomic-sync.js';

export async function writeManifestFile(auditDir: string, manifest: AuditManifest): Promise<void> {
  writeJsonAtomicSync(path.join(auditDir, 'manifest.json'), manifest);
}
