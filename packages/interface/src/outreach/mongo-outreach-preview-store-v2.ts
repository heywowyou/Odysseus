/** Mongo adapter for the prospect-native full-audit preview contract. */

import type { Connection } from 'mongoose';
import type { Finding } from '@odysseus/core';
import {
  createAuditModel,
  getFindingsForAudit,
  getProspectHub,
  isSuppressed,
  listLivePreviewsForDomain,
  recordOutreachPreview,
  revokeOutreachPreview,
  selectNewestQualifyingAudit,
  type ProspectWorkAudit,
} from '@odysseus/store';
import type {
  OutreachPublicationAudit,
  OutreachPublicationRowV2,
  OutreachPreviewStorePortV2,
  PublishPreviewV2Refusal,
  RecordPreviewV2Input,
} from './publish-preview-v2.js';

type PublicationAudit = ProspectWorkAudit & OutreachPublicationAudit;

export function createMongoOutreachPreviewStoreV2(
  connection: Connection,
  options: { prospectId: string; qualificationVersion?: string },
): OutreachPreviewStorePortV2 {
  void options.qualificationVersion;
  return {
    async findPublicationRow(
      prospectId: string,
    ): Promise<OutreachPublicationRowV2 | { refused: PublishPreviewV2Refusal }> {
      const prospect = await getProspectHub(connection, prospectId);
      if (prospect === null) return { refused: 'prospect-unknown' };

      const audits = await createAuditModel(connection)
        .find({ prospectId })
        .select({
          _id: 0,
          auditId: 1,
          prospectId: 1,
          siteUrl: 1,
          kind: 1,
          startedAt: 1,
          finishedAt: 1,
          pages: 1,
          crawl: 1,
          continuationGuardSummary: 1,
          'findingsProvenance.normalizationFingerprint': 1,
          gradeOverride: 1,
        })
        .sort({ startedAt: -1, auditId: -1 })
        .lean<PublicationAudit[]>();
      const qualification = selectNewestQualifyingAudit(audits);
      if (qualification.audit === undefined) {
        return {
          refused:
            qualification.state === 'missing'
              ? 'no-audit'
              : qualification.state === 'stale'
                ? 'stale-provenance'
                : 'coverage-incomplete',
        };
      }

      const website = prospect.websites.find((item) => item.primary) ?? prospect.websites[0];
      if (website === undefined) return { refused: 'domain-mismatch' };
      const findings: Finding[] = await getFindingsForAudit(
        connection,
        qualification.audit.auditId,
      );
      return {
        prospectId,
        domain: website.registrableDomain,
        businessName: prospect.name,
        audit: qualification.audit,
        findings,
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
