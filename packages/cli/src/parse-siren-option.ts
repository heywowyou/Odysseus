/**
 * Shared --siren <number> validator for audit.ts and scan.ts. A manually
 * supplied SIREN goes through the exact same INSEE checksum a scanner-
 * extracted one does - no separate, looser path - and fails fast here
 * rather than letting an invalid value travel further into the pipeline.
 */

import { InvalidArgumentError } from 'commander';
import { isValidSiren } from '@odysseus/core';

export function parseSirenOption(value: string): string {
  const cleaned = value.replace(/\s/g, '');
  if (!isValidSiren(cleaned)) {
    throw new InvalidArgumentError(`"${value}" is not a valid SIREN (failed the INSEE checksum)`);
  }
  return cleaned;
}
