import { logger } from './logger.js';

// ok: credentials-in-logs
export function logUnhandledError(error: unknown, requestId: string): void {
  logger.error({ err: error, requestId }, 'unhandled error while handling request');
}

// ok: credentials-in-logs
export function logBucketConfigured(bucket: { name: string; configured: boolean }): void {
  logger.info({ bucket: bucket.name, configured: bucket.configured }, 'storage bucket ready');
}
