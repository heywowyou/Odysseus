import { afterAll, describe, expect, it } from 'vitest';
import type { Connection, Model } from 'mongoose';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createBenchmarkCandidateModel } from './schemas/benchmark-candidate.schema.js';
import { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';
import { createReportModel } from './schemas/report.schema.js';
import { createSireneCacheModel } from './schemas/sirene-cache.schema.js';
import { createSuppressionModel } from './schemas/suppression.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

/** Every model factory under schemas/. Mongoose's auto-index swallows an
 *  index build error, so an index MongoDB cannot build (an unsupported
 *  partial filter, say) otherwise ships silently and simply never exists.
 *  A new schema file must be added here. */
const MODEL_FACTORIES: ReadonlyArray<(connection: Connection) => Model<never>> = [
  createAnalysisModel,
  createAuditModel,
  createBenchmarkCandidateModel,
  createDirectoryEntryModel,
  createFindingModel,
  createJobModel,
  createOutreachDraftModel,
  createOutreachOutcomeModel,
  createOutreachPreviewModel,
  createOutreachThreadModel,
  createProspectEventModel,
  createProspectHubModel,
  createReportApprovalModel,
  createReportModel,
  createSireneCacheModel,
  createSuppressionModel,
] as never;

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('schema_indexes'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('schema indexes', () => {
  it('builds every declared index on every model without error', async () => {
    for (const factory of MODEL_FACTORIES) {
      const model = factory(connection!);
      await expect(model.syncIndexes(), model.modelName).resolves.toBeDefined();
      const declared = model.schema.indexes().length;
      const built = (await model.listIndexes()).filter((index) => index.name !== '_id_');
      expect(built.length, model.modelName).toBeGreaterThanOrEqual(declared);
    }
  });
});
