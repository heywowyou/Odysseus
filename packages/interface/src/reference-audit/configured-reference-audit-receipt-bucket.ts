import {
  getReferenceAuditReceiptBucketAccessKeyId,
  getReferenceAuditReceiptBucketEndpoint,
  getReferenceAuditReceiptBucketName,
  getReferenceAuditReceiptBucketRegion,
  getReferenceAuditReceiptBucketSecretKey,
} from '../config.js';
import {
  createScalewayReferenceAuditReceiptBucket,
  type ReferenceAuditReceiptBucket,
} from './reference-audit-receipt-bucket.js';

export function createConfiguredReferenceAuditReceiptBucket(): ReferenceAuditReceiptBucket {
  return createScalewayReferenceAuditReceiptBucket({
    bucket: getReferenceAuditReceiptBucketName(),
    endpoint: getReferenceAuditReceiptBucketEndpoint(),
    region: getReferenceAuditReceiptBucketRegion(),
    accessKeyId: getReferenceAuditReceiptBucketAccessKeyId(),
    secretAccessKey: getReferenceAuditReceiptBucketSecretKey(),
  });
}
