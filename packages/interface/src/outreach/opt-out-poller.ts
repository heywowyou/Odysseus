/**
 * Polls the opt-out drop box once a minute. The public page promises the
 * request is handled right away; a minute is the honest reading of that.
 *
 * Off when the preview bucket is not configured (local runs, tests): without
 * a bucket there is nowhere a request could have been dropped.
 */

import type { Connection } from 'mongoose';
import { logger } from '../logger.js';
import {
  createConfiguredOptOutBucket,
  createConfiguredPreviewPublisher,
} from './configured-preview-publisher.js';
import { processOptOutRequests } from './opt-out-requests.js';

const OPT_OUT_POLL_INTERVAL_MS = 60_000;

export function startOptOutPoller(connection: Connection): () => void {
  let bucket;
  let publisher;
  try {
    bucket = createConfiguredOptOutBucket();
    publisher = createConfiguredPreviewPublisher();
  } catch {
    logger.info('preview bucket not configured; opt-out requests are not polled');
    return () => undefined;
  }

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await processOptOutRequests({ connection, bucket, publisher });
      if (result.applied + result.discarded + result.failed > 0) {
        logger.info(result, 'processed opt-out requests');
      }
    } catch (error) {
      logger.error({ err: error }, 'opt-out drop box could not be read');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), OPT_OUT_POLL_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
