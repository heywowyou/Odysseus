import {
  getReferenceAuditBucketAccessKeyId,
  getReferenceAuditBucketEndpoint,
  getReferenceAuditBucketName,
  getReferenceAuditBucketRegion,
  getReferenceAuditBucketSecretAccessKey,
} from '../config.js';
import { createScalewayReferenceAuditStore } from './scaleway-reference-audit-store.js';

export function createConfiguredReferenceAuditStore() {
  return createScalewayReferenceAuditStore({
    bucket: getReferenceAuditBucketName(),
    endpoint: getReferenceAuditBucketEndpoint(),
    region: getReferenceAuditBucketRegion(),
    accessKeyId: getReferenceAuditBucketAccessKeyId(),
    secretAccessKey: getReferenceAuditBucketSecretAccessKey(),
  });
}
