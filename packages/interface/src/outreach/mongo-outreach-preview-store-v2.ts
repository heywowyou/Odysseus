/**
 * The Mongo adapter for the v2 preview publication port (plan 037).
 *
 * Reads the candidate's outreach audit through the store's exact-resolution
 * projection, so the port can never see a stale, failed, wrong-domain,
 * suppressed, or coverage-incomplete audit as a publishable row, and joins
 * the same candidate name and qualification Sirene facts the v1 adapter
 * joined. This module issues the only queries; the port stays pure.
 */

import type { Connection } from 'mongoose';
import type { Finding } from '@odysseus/core';
import {
  getHotelCandidate,
  getFindingsForAudit,
  getHotelQualification,
  isSuppressed,
  listLivePreviewsForDomain,
  recordOutreachPreview,
  resolveOutreachAuditForCandidate,
  revokeOutreachPreview,
  type OutreachAuditRefusal,
} from '@odysseus/store';
import type {
  OutreachPreviewStorePortV2,
  OutreachPublicationRowV2,
  RecordPreviewV2Input,
} from './publish-preview-v2.js';
import type { PreviewSireneFacts } from './publish-preview.js';

export function createMongoOutreachPreviewStoreV2(
  connection: Connection,
  options: { qualificationVersion: string },
): OutreachPreviewStorePortV2 {
  return {
    async findPublicationRow(
      candidateId: string,
    ): Promise<OutreachPublicationRowV2 | { refused: OutreachAuditRefusal }> {
      const resolution = await resolveOutreachAuditForCandidate(connection, candidateId);
      if (resolution.state === 'refused') return { refused: resolution.reason };

      const candidate = await getHotelCandidate(connection, candidateId);
      if (candidate === null) return { refused: 'candidate-unknown' };

      const findings: Finding[] = await getFindingsForAudit(connection, resolution.audit.auditId);

      const qualification = await getHotelQualification(
        connection,
        options.qualificationVersion,
        candidateId,
      );
      const join = qualification?.sireneJoin;

      return {
        candidateId,
        domain: candidate.ownRegistrableDomain ?? resolution.audit.siteUrl,
        businessName: candidate.name,
        audit: resolution.audit,
        findings,
        ...(join?.status === 'matched' && join.denomination !== undefined
          ? {
              sirene: {
                denomination: join.denomination,
                ...(join.effectifBandCode === undefined
                  ? {}
                  : { effectifBandCode: join.effectifBandCode }),
                checkedAt: join.checkedAt,
                ...(join.stockVersion === undefined ? {} : { stockVersion: join.stockVersion }),
              } satisfies PreviewSireneFacts,
            }
          : {}),
      };
    },

    isSuppressed(domain: string): Promise<boolean> {
      return isSuppressed(connection, domain);
    },

    async recordPreview(
      input: RecordPreviewV2Input,
    ): Promise<{ recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false }> {
      const outcome = await recordOutreachPreview(connection, {
        ...input,
        sourceKind: 'full-audit',
        previewContentVersion: 'v2',
      });
      return outcome.outcome === 'recorded'
        ? { recorded: true, previewId: outcome.previewId, publicExpiresAt: outcome.publicExpiresAt }
        : { recorded: false };
    },

    async listLivePreviews(domain: string) {
      const rows = await listLivePreviewsForDomain(connection, domain);
      return rows.map((row) => ({ previewId: row.previewId, objectKey: row.objectKey }));
    },

    async revokePreview(previewId: string, reason: string) {
      const result = await revokeOutreachPreview(connection, previewId, reason);
      return { changed: result.changed };
    },
  };
}
