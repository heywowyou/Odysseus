/**
 * Mongo adapter for `OutreachPreviewStorePort`, milestone 9c plan 009.
 *
 * Assembles one publication row out of the three collections that each hold a
 * piece of it: the candidate knows the hotel's name and its current prescan
 * pointer, the prescan holds the evidence and where its screenshots live, and
 * the qualification holds the Sirene join whose registry facts argument B is
 * allowed to quote. Doing that here rather than in the orchestrator is what
 * keeps `publishPreview` free of queries and testable without a database.
 */

import path from 'node:path';
import type { Connection } from 'mongoose';
import { getPrescansRoot } from '@odysseus/scanner';
import {
  getHotelCandidate,
  getHotelQualification,
  getLatestPrescan,
  isSuppressed,
  listLivePreviewsForDomain,
  recordOutreachPreview,
  revokeOutreachPreview,
} from '@odysseus/store';
import type {
  LivePreviewRef,
  OutreachPreviewStorePort,
  PreviewPublicationRow,
  RecordPreviewInput,
} from './publish-preview.js';

export interface MongoOutreachPreviewStoreOptions {
  prescanVersion: string;
  qualificationVersion: string;
}

export function createMongoOutreachPreviewStore(
  connection: Connection,
  options: MongoOutreachPreviewStoreOptions,
): OutreachPreviewStorePort {
  return {
    async findPublicationRow(candidateId: string): Promise<PreviewPublicationRow | null> {
      const candidate = await getHotelCandidate(connection, candidateId);
      if (candidate === null) return null;

      const prescan = await getLatestPrescan(connection, candidateId, options.prescanVersion);
      if (prescan === null) return null;

      const qualification = await getHotelQualification(
        connection,
        options.qualificationVersion,
        candidateId,
      );
      const join = qualification?.sireneJoin;

      return {
        candidateId,
        domain: prescan.domain,
        businessName: candidate.name,
        prescanId: prescan.prescanId,
        prescanVersion: prescan.prescanVersion,
        // Stored relative to the prescans root, so a stored prescan survives
        // that root moving, and resolved to an absolute path here because a
        // relative one only works from whichever directory the process happens
        // to have started in.
        artifactsDir: path.resolve(getPrescansRoot(), prescan.artifactsDir),
        observedAt: prescan.startedAt,
        prescanExpiresAt: prescan.expiresAt,
        ...(prescan.evidence === undefined ? {} : { evidence: prescan.evidence }),
        ...(join?.status === 'matched' && join.denomination !== undefined
          ? {
              sirene: {
                denomination: join.denomination,
                ...(join.effectifBandCode === undefined
                  ? {}
                  : { effectifBandCode: join.effectifBandCode }),
                checkedAt: join.checkedAt,
                ...(join.stockVersion === undefined ? {} : { stockVersion: join.stockVersion }),
              },
            }
          : {}),
      };
    },

    isSuppressed(domain: string): Promise<boolean> {
      return isSuppressed(connection, domain);
    },

    async recordPreview(
      input: RecordPreviewInput,
    ): Promise<{ previewId: string; publicExpiresAt: Date }> {
      const recorded = await recordOutreachPreview(connection, input);
      return { previewId: recorded.previewId, publicExpiresAt: recorded.publicExpiresAt };
    },

    async listLivePreviews(domain: string): Promise<LivePreviewRef[]> {
      const rows = await listLivePreviewsForDomain(connection, domain);
      return rows.map((row) => ({
        previewId: row.previewId,
        objectKey: row.objectKey,
        domain: row.domain,
      }));
    },

    async revokePreview(previewId: string, reason: string): Promise<{ changed: boolean }> {
      const result = await revokeOutreachPreview(connection, previewId, reason);
      return { changed: result.changed };
    },
  };
}
