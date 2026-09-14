/**
 * Issue #253: the only file in this package that imports @sentry/node.
 * Nothing here sends HTML, screenshots, cookies, authorization headers,
 * page content, or full URLs - the event type it receives (./events.ts)
 * cannot carry any of those, and sendDefaultPii/beforeSend below are
 * defense in depth against Sentry's own automatic collection, not the
 * primary safeguard.
 */

import * as Sentry from '@sentry/node';
import type { JobTelemetryEvent } from './events.js';
import type { TelemetrySink } from './job-telemetry.js';

export interface SentrySinkOptions {
  dsn: string;
  environment: string;
  release?: string;
  /** Fraction of events sent, 0-1. Defaults to 1 (every event) since job
   *  telemetry volume is inherently low - one job at a time in this
   *  queue's design, not a high-QPS web request path. */
  sampleRate?: number;
}

/** Initializes the Sentry Node client and returns a sink that reports job
 *  telemetry through it. Never called unless a DSN is configured - see
 *  ./configure.ts - so importing this module has no side effect on its
 *  own. */
export function createSentryTelemetrySink(options: SentrySinkOptions): TelemetrySink {
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release !== undefined ? { release: options.release } : {}),
    sampleRate: options.sampleRate ?? 1,
    // No IP addresses, request headers, or cookies - this is job-queue
    // telemetry, not request tracing.
    sendDefaultPii: false,
    beforeSend(sentryEvent) {
      delete sentryEvent.request;
      delete sentryEvent.user;
      return sentryEvent;
    },
  });

  return {
    capture(event: JobTelemetryEvent): void {
      Sentry.addBreadcrumb({
        category: 'job-pipeline',
        level: event.kind === 'job-failed' ? 'error' : 'info',
        data: { ...event },
      });
      if (event.kind === 'job-failed') {
        Sentry.captureMessage(`job ${event.jobType} failed at stage ${event.stage}`, {
          level: 'error',
          tags: { jobType: event.jobType, stage: event.stage, errorKind: event.errorKind },
        });
      }
    },
  };
}
