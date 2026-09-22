#!/usr/bin/env node

/**
 * Re-normalizes stored audits inside the production container after a
 * normalization change, without re-running the paid writing passes:
 * re-normalize the stored scan data, backfill the audit and findings rows,
 * and sync the audit directory to the artifact bucket.
 *
 * usage (inside odysseus-app-1): node renormalize-audits.mjs <auditId-prefix> [...]
 */

import { renormalizeAudit } from '/app/packages/interface/dist/pipeline/renormalize-audit.js';
import { backfillAuditRow } from '/app/packages/interface/dist/pipeline/backfill-audit-row.js';
import { syncAuditDirToBucket } from '/app/packages/interface/dist/artifacts/sync-audit-artifacts.js';
import { createConfiguredArtifactStore } from '/app/packages/interface/dist/artifacts/configured-artifact-store.js';
import { connectToMongo, disconnectFromMongo } from '/app/packages/store/dist/index.js';
import { buildAuditDir, getArtifactsRoot } from '/app/packages/scanner/dist/index.js';

const prefixes = process.argv.slice(2);
if (prefixes.length === 0) {
  console.error('usage: renormalize-audits.mjs <auditId-prefix> [...]');
  process.exit(1);
}

const store = createConfiguredArtifactStore();
const connection = await connectToMongo();
try {
  for (const prefix of prefixes) {
    const audit = await connection
      .collection('audits')
      .findOne(
        { auditId: { $regex: `^${prefix}` } },
        { projection: { auditId: 1, siteUrl: 1, startedAt: 1 } },
      );
    if (!audit) {
      console.log(`skip ${prefix}: no audit row`);
      continue;
    }
    const hostname = new URL(audit.siteUrl).hostname;
    const startedAt = new Date(audit.startedAt);
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, startedAt);
    const result = await renormalizeAudit(auditDir, store);
    await backfillAuditRow(auditDir, connection);
    await syncAuditDirToBucket(store, auditDir, hostname, startedAt);
    console.log(
      `${hostname} ${result.auditId}: ${result.findingCount} findings, fingerprint ${result.manifest.findingsProvenance?.normalizationFingerprint}`,
    );
  }
} finally {
  await disconnectFromMongo(connection);
}
