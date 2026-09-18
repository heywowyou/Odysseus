import { LangfuseLlmTelemetrySink } from './langfuse-sink.js';
import { configureLlmTelemetrySink, NullLlmTelemetrySink } from './llm-telemetry.js';

export function configureLlmTelemetryFromEnv(env: NodeJS.ProcessEnv = process.env): void {
  const baseUrl = env['LANGFUSE_BASE_URL']?.trim();
  const publicKey = env['LANGFUSE_PUBLIC_KEY']?.trim();
  const secretKey = env['LANGFUSE_SECRET_KEY']?.trim();

  if (!baseUrl && !publicKey && !secretKey) {
    configureLlmTelemetrySink(new NullLlmTelemetrySink());
    return;
  }

  if (!baseUrl || !publicKey || !secretKey) {
    throw new Error(
      'odysseus: LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be configured together',
    );
  }

  configureLlmTelemetrySink(new LangfuseLlmTelemetrySink({ baseUrl, publicKey, secretKey }));
}
