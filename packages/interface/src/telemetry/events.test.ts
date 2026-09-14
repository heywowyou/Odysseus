import { describe, expect, it } from 'vitest';
import { classifyJobError, redactJobTelemetryEvent, type JobTelemetryEvent } from './events.js';

describe('redactJobTelemetryEvent', () => {
  it('passes a legitimate stage-transition event through unchanged', () => {
    const event: JobTelemetryEvent = {
      kind: 'stage-transition',
      jobId: 'job-1',
      jobType: 'full-audit',
      buildId: 'abc123',
      stage: 'crawl',
      previousStage: 'queue-wait',
      previousStageDurationMs: 42,
    };
    expect(redactJobTelemetryEvent(event)).toEqual(event);
  });

  it('passes a legitimate job-failed event through unchanged', () => {
    const event: JobTelemetryEvent = {
      kind: 'job-failed',
      jobId: 'job-1',
      jobType: 'full-audit',
      buildId: 'abc123',
      stage: 'crawl',
      errorKind: 'timeout',
    };
    expect(redactJobTelemetryEvent(event)).toEqual(event);
  });

  it('drops any key outside the allowlist, e.g. a call site accidentally spreading page data onto the event', () => {
    const legit: JobTelemetryEvent = {
      kind: 'stage-transition',
      jobId: 'job-1',
      jobType: 'full-audit',
      buildId: 'abc123',
      stage: 'crawl',
    };
    const withLeakedFields = {
      ...legit,
      url: 'https://client-site.example/secret-path?token=abc',
      cookie: 'session=deadbeef',
      pageHtml: '<html>full page content</html>',
    } as unknown as JobTelemetryEvent;

    const redacted = redactJobTelemetryEvent(withLeakedFields);

    expect(redacted).toEqual(legit);
    expect(Object.keys(redacted)).not.toContain('url');
    expect(Object.keys(redacted)).not.toContain('cookie');
    expect(Object.keys(redacted)).not.toContain('pageHtml');
  });
});

describe('classifyJobError', () => {
  it('classifies an AbortError as a timeout', () => {
    const error = new Error('the operation was aborted');
    error.name = 'AbortError';
    expect(classifyJobError(error)).toBe('timeout');
  });

  it('classifies a TimeoutError as a timeout', () => {
    const error = new Error('deadline exceeded');
    error.name = 'TimeoutError';
    expect(classifyJobError(error)).toBe('timeout');
  });

  it('classifies a ZodError as validation', () => {
    class ZodError extends Error {}
    expect(classifyJobError(new ZodError('bad shape'))).toBe('validation');
  });

  it('classifies an unrecognized error as unknown rather than guessing', () => {
    expect(classifyJobError(new Error('something specific to this site broke'))).toBe('unknown');
  });

  it('classifies a non-Error thrown value as unknown', () => {
    expect(classifyJobError('a string was thrown')).toBe('unknown');
  });
});
