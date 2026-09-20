import type { Connection } from 'mongoose';
import { logger } from '../logger.js';
import { createConfiguredReferenceAuditReceiptBucket } from './configured-reference-audit-receipt-bucket.js';
import {
  REFERENCE_AUDIT_RECEIPT_PREFIX,
  type ReferenceAuditReceiptBucket,
} from './reference-audit-receipt-bucket.js';
import { recordReferenceAuditRequest } from '@odysseus/store';

export interface ReferenceAuditReceipt {
  tokenHash: string;
  requestedAt: string;
  referenceVersion: string;
}

function parseReceipt(value: unknown): ReferenceAuditReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('receipt is not an object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'referenceVersion,requestedAt,tokenHash') {
    throw new Error('receipt contains fields outside the bounded contract');
  }
  if (
    typeof record['tokenHash'] !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(record['tokenHash']) ||
    typeof record['requestedAt'] !== 'string' ||
    Number.isNaN(new Date(record['requestedAt']).getTime()) ||
    typeof record['referenceVersion'] !== 'string' ||
    record['referenceVersion'].length === 0 ||
    record['referenceVersion'].length > 120
  ) {
    throw new Error('receipt failed validation');
  }
  return {
    tokenHash: record['tokenHash'],
    requestedAt: record['requestedAt'],
    referenceVersion: record['referenceVersion'],
  };
}

export interface ProcessReferenceAuditReceiptResult {
  processed: number;
  accepted: number;
  discarded: number;
  failed: number;
}

export async function processReferenceAuditReceipts(options: {
  connection: Connection;
  bucket: ReferenceAuditReceiptBucket;
  now?: Date;
}): Promise<ProcessReferenceAuditReceiptResult> {
  const result: ProcessReferenceAuditReceiptResult = {
    processed: 0,
    accepted: 0,
    discarded: 0,
    failed: 0,
  };
  const keys = await options.bucket.list(REFERENCE_AUDIT_RECEIPT_PREFIX);
  for (const key of keys) {
    try {
      const raw = await options.bucket.getJson(key);
      if (raw === null) {
        await options.bucket.delete(key);
        result.discarded += 1;
        continue;
      }
      let receipt: ReferenceAuditReceipt;
      try {
        receipt = parseReceipt(raw);
      } catch {
        await options.bucket.delete(key);
        result.discarded += 1;
        continue;
      }
      const requestedAt = new Date(receipt.requestedAt);
      if (requestedAt.getTime() > (options.now ?? new Date()).getTime()) {
        await options.bucket.delete(key);
        result.discarded += 1;
        continue;
      }
      const recorded = await recordReferenceAuditRequest(options.connection, {
        tokenHash: receipt.tokenHash,
        referenceVersion: receipt.referenceVersion,
        requestedAt,
      });
      await options.bucket.delete(key);
      result.processed += 1;
      if (recorded.accepted) result.accepted += 1;
      else result.discarded += 1;
    } catch (error) {
      // Keep a transient object for the next tick. The key is deliberately
      // omitted from the log: it is an opaque but still sensitive receipt id.
      result.failed += 1;
      logger.error({ err: error }, 'reference audit receipt could not be consumed');
    }
  }
  return result;
}

const REFERENCE_AUDIT_RECEIPT_POLL_INTERVAL_MS = 60_000;

export function startReferenceAuditReceiptPoller(connection: Connection): () => void {
  let bucket: ReferenceAuditReceiptBucket;
  try {
    bucket = createConfiguredReferenceAuditReceiptBucket();
  } catch {
    logger.info('reference audit receipt bucket not configured; attribution is disabled');
    return () => undefined;
  }

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await processReferenceAuditReceipts({ connection, bucket });
      if (result.processed > 0 || result.failed > 0) {
        logger.info(result, 'processed reference audit receipts');
      }
    } catch (error) {
      logger.error({ err: error }, 'reference audit receipt bucket could not be read');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), REFERENCE_AUDIT_RECEIPT_POLL_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
