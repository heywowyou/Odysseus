#!/usr/bin/env node

/**
 * An audit run from the CLI writes its audit and findings but no job row,
 * and the dashboard's scan list is built from jobs (`/api/scans` ->
 * `listJobs`). A perfectly good full audit is therefore invisible there, so
 * it cannot be opened from the list, previewed, or used for outreach.
 *
 * This script writes the missing job row for audits named on the command
 * line, so an already-finished CLI audit lists exactly like a queued one.
 * It never invents audit data: every field comes from the stored audit, and
 * an audit that already has a job is left alone.
 *
 * It runs inside the production container, where MONGODB_URI is set:
 *
 *   node /app/scripts/backfill-cli-audit-jobs.mjs <auditId> [...]   # dry run
 *   node /app/scripts/backfill-cli-audit-jobs.mjs --apply <auditId> [...]
 *
 * Dry run is the default and prints the exact rows it would insert.
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolveMongoDbName } from './lib/mongo-db-name.mjs';

// The driver is a transitive dependency here: the repo root resolves it, and
// the production image keeps it under the store package. Try both rather
// than assuming the layout of whichever machine this runs on.
const require = createRequire(import.meta.url);
const { MongoClient } = (() => {
  for (const specifier of [
    'mongodb',
    '/app/packages/store/node_modules/mongoose/node_modules/mongodb',
    '/app/packages/store/node_modules/mongoose',
  ]) {
    try {
      const loaded = require(specifier);
      if (loaded?.MongoClient) return loaded;
      if (loaded?.mongo?.MongoClient) return loaded.mongo;
    } catch {
      // Try the next candidate.
    }
  }
  console.error('backfill-cli-audit-jobs: no MongoDB driver found');
  process.exit(1);
})();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const auditIds = args.filter((arg) => !arg.startsWith('--'));

if (auditIds.length === 0) {
  console.error('usage: backfill-cli-audit-jobs.mjs [--apply] <auditId> [...]');
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('backfill-cli-audit-jobs: MONGODB_URI is not set');
  process.exit(1);
}

// Issue #524: the store's rule, not the driver default. client.db() with no
// name used whatever the URI named, which only worked because production's
// database happens to be the driver's default `test`.
const dbName = resolveMongoDbName(uri);
if (dbName === undefined) {
  console.error(
    'backfill-cli-audit-jobs: MONGODB_URI names no database and MONGODB_DB_NAME is not set; refusing to guess one',
  );
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const audits = db.collection('audits');
  const jobs = db.collection('jobs');

  const planned = [];
  for (const auditId of auditIds) {
    const audit = await audits.findOne(
      { auditId },
      { projection: { auditId: 1, siteUrl: 1, startedAt: 1, finishedAt: 1, prospectId: 1 } },
    );
    if (!audit) {
      console.log(`skip ${auditId}: no audit row`);
      continue;
    }
    const existing = await jobs.findOne({ auditId }, { projection: { jobId: 1 } });
    if (existing) {
      console.log(`skip ${auditId}: job ${existing.jobId} already exists`);
      continue;
    }
    // The dashboard row reads type/status/phase/siteUrl/createdAt/
    // finishedAt/auditId; runIdentity is what a queued full audit carries,
    // and keeping it truthful here means a later re-claim resolves the same
    // artifact directory this audit already wrote.
    planned.push({
      jobId: randomUUID(),
      type: 'full-audit',
      status: 'complete',
      phase: 'complete',
      siteUrl: audit.siteUrl,
      // The prospect link lives on options.prospectId, which is where the
      // dashboard row and the prospect-hub lookups read it from.
      options: audit.prospectId === undefined ? {} : { prospectId: audit.prospectId },
      createdAt: audit.startedAt,
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      auditId: audit.auditId,
      runIdentity: { startedAt: audit.startedAt, auditId: audit.auditId },
      progress: {},
    });
  }

  for (const row of planned) {
    console.log(
      `${apply ? 'insert' : 'would insert'} ${row.jobId} -> ${row.auditId} ${row.siteUrl}`,
    );
  }

  if (!apply) {
    console.log(`dry run: ${planned.length} job row(s) would be written; pass --apply to write`);
  } else if (planned.length > 0) {
    const result = await jobs.insertMany(planned, { ordered: true });
    console.log(`inserted ${result.insertedCount} job row(s)`);
  }
} finally {
  await client.close();
}
