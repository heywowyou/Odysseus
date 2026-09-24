import type { Connection, Model } from 'mongoose';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createBenchmarkCandidateModel } from './schemas/benchmark-candidate.schema.js';
import { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';
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
import { createReferenceAuditLinkModel } from './schemas/reference-audit-link.schema.js';
import {
  createActiveReportBundleModel,
  createReportBundleModel,
  createReportQualityLeaseModel,
  createReportQualityRunModel,
} from './schemas/report-quality.schema.js';

export interface RequiredUniqueIndex {
  modelName: string;
  key: Record<string, 1 | -1>;
  options: Record<string, unknown>;
}

const MODEL_FACTORIES: ReadonlyArray<(connection: Connection) => Model<never>> = [
  createAnalysisModel,
  createAuditModel,
  createBenchmarkCandidateModel,
  createDirectoryEntryModel,
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
  createReferenceAuditLinkModel,
  createActiveReportBundleModel,
  createReportBundleModel,
  createReportQualityLeaseModel,
  createReportQualityRunModel,
] as never;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
}

export function findMissingUniqueIndexes(
  required: readonly RequiredUniqueIndex[],
  actual: readonly {
    key: Record<string, unknown>;
    unique?: boolean;
    sparse?: boolean;
    partialFilterExpression?: unknown;
  }[],
): RequiredUniqueIndex[] {
  return required.filter(
    (index) =>
      !actual.some(
        (present) =>
          present.unique === true &&
          stable(present.key) === stable(index.key) &&
          Boolean(present.sparse) === Boolean(index.options['sparse']) &&
          stable(present.partialFilterExpression) ===
            stable(index.options['partialFilterExpression']),
      ),
  );
}

/** Reads deployed indexes without creating or changing any index. Missing
 *  unique constraints are returned for a startup operator alert. */
export async function verifyUniqueIndexes(connection: Connection): Promise<RequiredUniqueIndex[]> {
  if (connection.db === undefined) throw new Error('MongoDB is not connected');
  const missing: RequiredUniqueIndex[] = [];
  for (const factory of MODEL_FACTORIES) {
    const model = factory(connection);
    const required = model.schema
      .indexes()
      .filter(([, options]) => options['unique'] === true)
      .map(([key, options]) => ({
        modelName: model.modelName,
        key: key as Record<string, 1 | -1>,
        options: options as Record<string, unknown>,
      }));
    if (required.length === 0) continue;
    let actual: Array<{
      key: Record<string, unknown>;
      unique?: boolean;
      sparse?: boolean;
      partialFilterExpression?: unknown;
    }>;
    try {
      actual = (await connection.db
        .collection(model.collection.collectionName)
        .listIndexes()
        .toArray()) as unknown as typeof actual;
    } catch (error) {
      if ((error as { codeName?: string }).codeName !== 'NamespaceNotFound') throw error;
      actual = [];
    }
    missing.push(
      ...findMissingUniqueIndexes(
        required,
        actual.map((index) => ({
          key: index.key as Record<string, unknown>,
          ...(index.unique !== undefined ? { unique: index.unique } : {}),
          ...(index.sparse !== undefined ? { sparse: index.sparse } : {}),
          ...(index.partialFilterExpression !== undefined
            ? { partialFilterExpression: index.partialFilterExpression }
            : {}),
        })),
      ),
    );
  }
  return missing;
}
