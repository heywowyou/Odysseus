/**
 * Issue #253: single startup entry point. No-ops (NullTelemetrySink)
 * unless SENTRY_DSN is set, so every environment without an explicit
 * opt-in - including every test run - behaves exactly as it did before
 * this pilot existed. Call once, from packages/interface/src/index.ts.
 */

import { readOdysseusBuildId } from '@odysseus/scanner';
import { configureJobTelemetrySink, NullTelemetrySink } from './job-telemetry.js';
import { createSentryTelemetrySink } from './sentry-sink.js';

export function configureTelemetryFromEnv(env: NodeJS.ProcessEnv = process.env): void {
  const dsn = env['SENTRY_DSN'];
  if (dsn === undefined || dsn.trim() === '') {
    configureJobTelemetrySink(new NullTelemetrySink());
    return;
  }
  configureJobTelemetrySink(
    createSentryTelemetrySink({
      dsn,
      environment: env['SENTRY_ENVIRONMENT'] ?? env['NODE_ENV'] ?? 'production',
      release: readOdysseusBuildId(),
    }),
  );
}
