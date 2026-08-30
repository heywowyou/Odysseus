/**
 * Loader for config/naf-sector-allowlist.json: the versioned,
 * operator-editable NAF sector recall filter, per
 * docs/rules/prospect-qualification.md section 4's three constraints (ship as
 * JSON, not a TS constant; split every entry definitional vs inferred;
 * gate what's actually active behind `enabled`).
 *
 * A readFileSync at module load is a narrow, deliberate exception to this
 * package's "no I/O" charter (see the package-level note in
 * package.json's build script comment) - reading a bundled config asset
 * is treated as categorically different from live infrastructure
 * (network, DB drivers). If a future reviewer disagrees, the fallback is
 * for core to expose only the file path/schema and have
 * packages/interface perform the read.
 *
 * NAF is a recall filter, never evidence: it narrows which Sirene stock
 * rows are worth an HTTP fetch, but a matching NAF code alone never
 * qualifies a prospect (see qualify-prospect.ts) and must never be cited
 * to a prospect as the basis of anything (docs/rules/prospect-qualification.md
 * section 4).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const nafSectorAllowlistEntrySchema = z.object({
  code: z.string(),
  label: z.string(),
  confidence: z.enum(['definitional', 'inferred']),
  enabled: z.boolean(),
  rationale: z.string(),
});

const nafSectorAllowlistSchema = z.object({
  version: z.string(),
  sourceNote: z.string(),
  codes: z.array(nafSectorAllowlistEntrySchema),
});

export type NafSectorAllowlistEntry = z.infer<typeof nafSectorAllowlistEntrySchema>;
export type NafSectorAllowlist = z.infer<typeof nafSectorAllowlistSchema>;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let cached: NafSectorAllowlist | undefined;

/** Malformed JSON (a bad operator edit) throws loudly at first use rather
 *  than silently filtering nothing - a job that can't resolve its own
 *  targeting config should fail fast, not qualify zero or all candidates
 *  by accident. */
export function getNafSectorAllowlist(): NafSectorAllowlist {
  if (cached) return cached;
  const filePath = path.join(moduleDir, 'config', 'naf-sector-allowlist.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const parsed = nafSectorAllowlistSchema.parse(raw);

  const enabledInferred = parsed.codes.filter(
    (entry) => entry.enabled && entry.confidence === 'inferred',
  );
  if (enabledInferred.length > 0) {
    console.warn(
      `odysseus: naf-sector-allowlist.json has ${enabledInferred.length} 'inferred'-confidence code(s) enabled: ${enabledInferred
        .map((entry) => entry.code)
        .join(', ')}`,
    );
  }

  cached = parsed;
  return parsed;
}

export function getEnabledNafCodes(): ReadonlySet<string> {
  return new Set(
    getNafSectorAllowlist()
      .codes.filter((entry) => entry.enabled)
      .map((entry) => entry.code),
  );
}
