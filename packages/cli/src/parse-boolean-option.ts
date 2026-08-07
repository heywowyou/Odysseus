/**
 * Shared --override-transactional-flow <true|false> validator for
 * audit.ts and scan.ts, mirroring parse-siren-option.ts: fail fast at the
 * CLI boundary rather than letting an ambiguous string travel further
 * into the pipeline.
 */

import { InvalidArgumentError } from 'commander';

export function parseBooleanOption(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new InvalidArgumentError(`must be "true" or "false", got "${value}"`);
}
