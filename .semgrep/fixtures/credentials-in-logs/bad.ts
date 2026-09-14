import { logger } from './logger.js';
import { getOpenAiApiKey } from './config.js';

// ruleid: credentials-in-logs
export function debugConfig(bucket: { secretKey: string }): void {
  logger.warn(bucket.secretKey, 'bucket secret key for debugging');
}

// ruleid: credentials-in-logs
export function debugOpenAiKey(): void {
  logger.info(getOpenAiApiKey(), 'openai key loaded');
}

// ruleid: credentials-in-logs
export function debugEnv(): void {
  console.log(process.env, 'startup environment');
}
