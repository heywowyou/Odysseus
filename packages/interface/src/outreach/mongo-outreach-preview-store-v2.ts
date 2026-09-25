/** Mongo adapter for the current v3 prospect-native preview contract. */

import type { Connection } from 'mongoose';
import { primaryWebsite, type Finding } from '@odysseus/core';
import {
  createAuditModel,
  createJobModel,
  effectiveAuditScanIntent,
  findingsProvenanceMatches,
  getAudit,
  getFindingsForAudit,
  getLatestReport,
  getProspectHub,
  isSuppressed,
  listOutreachPreviews,
  loadOutreachReportReadiness,
  recordOutreachPreview,
  resolveSelectedAnalysisPairForAudit,
  revokeOutreachPreview,
  selectNewestQualifyingAudit,
  type AuditDocumentFields,
  type AuditIntentSourceJob,
  type ProspectWorkAudit,
} from '@odysseus/store';
import type {
  OutreachPublicationAudit,
  OutreachPublicationRowV3,
  OutreachPreviewStorePortV3,
  PublishPreviewV3Refusal,
  RecordPreviewV3Input,
} from './publish-preview-v2.js';

type PublicationAudit = ProspectWorkAudit &
  Pick<AuditDocumentFields, 'crawl' | 'continuationGuardSummary'>;

export function createMongoOutreachPreviewStoreV3(
  connection: Connection,
  options: { prospectId: string; qualificationVersion?: string },
): OutreachPreviewStorePortV3 {
  void options.qualificationVersion;

  return {
    async findPublicationRow(
      prospectId: string,
    ): Promise<OutreachPublicationRowV3 | { refused: PublishPreviewV3Refusal }> {
      const prospect = await getProspectHub(connection, prospectId);
      if (prospect === null) return { refused: 'prospect-unknown' };

      const audits = await createAuditModel(connection)
        .find({ prospectId })
        .select({
          _id: 0,
          auditId: 1,
          prospectId: 1,
          scanIntent: 1,
          siteUrl: 1,
          kind: 1,
          startedAt: 1,
          finishedAt: 1,
          pages: 1,
          crawl: 1,
          continuationGuardSummary: 1,
          findingsProvenance: 1,
        })
        .sort({ startedAt: -1, auditId: -1 })
        .lean<PublicationAudit[]>();

      const auditIds = audits.map((audit) => audit.auditId);
      const jobScope: Record<string, unknown>[] = [{ 'options.prospectId': prospectId }];
      if (auditIds.length > 0) {
        jobScope.push({ auditId: { $in: auditIds } }, { auditIds: { $in: auditIds } });
      }
      const jobs = await createJobModel(connection)
        .find({ $or: jobScope })
        .select({ _id: 0, type: 1, auditId: 1, auditIds: 1, 'options.scanType': 1 })
        .lean<AuditIntentSourceJob[]>();
      const classifiedAudits = audits.map((audit) => {
        const scanIntent = effectiveAuditScanIntent(audit, jobs);
        return scanIntent === undefined ? audit : { ...audit, scanIntent };
      });
      const qualification = selectNewestQualifyingAudit(classifiedAudits);
      if (qualification.audit === undefined) {
        return {
          refused: qualification.state === 'missing' ? 'no-audit' : 'coverage-incomplete',
        };
      }

      const auditId = qualification.audit.auditId;
      const readiness = await loadOutreachReportReadiness(connection, { auditId, prospectId });
      if (readiness.state !== 'ready') return { refused: 'report-not-ready' };

      const [audit, findings, selected, frReport] = await Promise.all([
        getAudit(connection, auditId),
        getFindingsForAudit(connection, auditId),
        resolveSelectedAnalysisPairForAudit(connection, auditId),
        getLatestReport(connection, auditId, 'fr'),
      ]);
      if (
        audit === null ||
        selected.kind === 'none' ||
        frReport === null ||
        !findingsProvenanceMatches(selected.fr.findingsProvenance, audit.findingsProvenance) ||
        !findingsProvenanceMatches(frReport.findingsProvenance, audit.findingsProvenance) ||
        audit.findingsProvenance?.findingsDigest === undefined
      ) {
        return { refused: 'report-not-ready' };
      }

      const website = primaryWebsite(prospect.websites);
      if (website === undefined) return { refused: 'domain-mismatch' };
      const dataOrigins: OutreachPublicationRowV3['dataOrigins'] = [
        'public-hotel-catalogue',
        'public-website',
        ...(selected.fr.obligationAssessment?.registrySnapshot !== undefined
          ? (['public-business-registry'] as const)
          : []),
      ];

      return {
        prospectId,
        domain: website.registrableDomain,
        businessName: prospect.name,
        dataOrigins,
        audit: audit as OutreachPublicationAudit,
        findings: findings as Finding[],
        analysis: selected.fr,
      };
    },

    isSuppressed(domain: string): Promise<boolean> {
      return isSuppressed(connection, domain);
    },

    async recordPreview(
      input: RecordPreviewV3Input,
    ): Promise<{ recorded: true; previewId: string; publicExpiresAt: Date } | { recorded: false }> {
      const outcome = await recordOutreachPreview(connection, {
        ...input,
        sourceKind: 'full-audit',
        previewContentVersion: 'v3',
      });
      return outcome.outcome === 'recorded'
        ? { recorded: true, previewId: outcome.previewId, publicExpiresAt: outcome.publicExpiresAt }
        : { recorded: false };
    },

    async listLivePreviewsForProspect(prospectId: string) {
      const rows = await listOutreachPreviews(connection, { prospectId, status: 'live' });
      return rows.map((row) => ({ previewId: row.previewId, objectKey: row.objectKey }));
    },

    async revokePreview(previewId: string, reason: string) {
      const result = await revokeOutreachPreview(connection, previewId, reason);
      return { changed: result.changed };
    },
  };
}
