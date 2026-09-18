import { randomBytes } from 'node:crypto';
import type { LlmCallTelemetryEvent } from './events.js';
import type { LlmTelemetrySink } from './llm-telemetry.js';

export interface LangfuseTelemetryConfig {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Metadata-only Langfuse OTLP sink.
 *
 * Deliberately does not use Langfuse's OpenAI wrapper: automatic
 * instrumentation would capture prompt/response content, which Odysseus's
 * telemetry rules prohibit. We emit one complete OTLP span containing only
 * the already-redacted closed LlmCallTelemetryEvent fields.
 */
export class LangfuseLlmTelemetrySink implements LlmTelemetrySink {
  private readonly endpoint: string;
  private readonly authorization: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LangfuseTelemetryConfig) {
    this.endpoint = `${config.baseUrl.replace(/\/$/, '')}/api/public/otel/v1/traces`;
    this.authorization = `Basic ${Buffer.from(
      `${config.publicKey}:${config.secretKey}`,
      'utf8',
    ).toString('base64')}`;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  capture(event: LlmCallTelemetryEvent): void {
    void this.send(event).catch(() => {
      // Telemetry is never load-bearing. The caller has already applied the
      // repository redaction contract before this sink receives the event.
    });
  }

  private async send(event: LlmCallTelemetryEvent): Promise<void> {
    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const end = BigInt(Date.now()) * 1_000_000n;
    const start = end - BigInt(Math.max(0, event.durationMs)) * 1_000_000n;

    const attributes: Array<{ key: string; value: { stringValue: string } }> = [
      ['langfuse.observation.type', 'generation'],
      ['gen_ai.system', 'openai'],
      ['gen_ai.request.model', event.model],
      ['odysseus.telemetry.kind', event.kind],
      ['odysseus.llm.pass', event.pass],
      ['odysseus.llm.attempt_count', String(event.attemptCount)],
      ['odysseus.llm.duration_ms', String(event.durationMs)],
    ].map(([key, value]) => ({ key, value: { stringValue: value } }));

    if (event.language) {
      attributes.push({
        key: 'odysseus.llm.language',
        value: { stringValue: event.language },
      });
    }
    if (event.kind === 'call-succeeded') {
      attributes.push({
        key: 'odysseus.llm.schema_valid_first_attempt',
        value: { stringValue: String(event.schemaValidFirstAttempt) },
      });
      for (const [key, value] of [
        ['gen_ai.usage.input_tokens', event.promptTokens],
        ['gen_ai.usage.output_tokens', event.completionTokens],
        ['odysseus.llm.total_tokens', event.totalTokens],
        ['odysseus.llm.reasoning_tokens', event.reasoningTokens],
      ] as const) {
        if (value !== undefined) {
          attributes.push({ key, value: { stringValue: String(value) } });
        }
      }
    }
    if (event.kind === 'call-rejected' || event.kind === 'style-violation-shipped') {
      attributes.push({
        key: 'odysseus.llm.guard_codes',
        value: { stringValue: event.guards.join(',') },
      });
    }
    if (event.kind === 'call-rejected') {
      attributes.push({
        key: 'odysseus.llm.style_only',
        value: { stringValue: String(event.styleOnly) },
      });
    }

    const body = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: 'odysseus-llm' },
              },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'odysseus.llm.telemetry' },
              spans: [
                {
                  traceId,
                  spanId,
                  name: `llm.${event.pass}.${event.kind}`,
                  startTimeUnixNano: start.toString(),
                  endTimeUnixNano: end.toString(),
                  attributes,
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json',
        'x-langfuse-ingestion-version': '4',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      throw new Error(`Langfuse OTLP export failed with HTTP ${response.status}`);
    }
  }
}
