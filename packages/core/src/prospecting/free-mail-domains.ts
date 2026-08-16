/**
 * Loader for config/free-mail-domains.json. Same load/validate/memoize
 * pattern as naf-allowlist.ts, and for the same reason: this list is
 * compliance-adjacent (docs/prospect-qualification.md section 6) and
 * needs occasional additions - a new French ISP, a new consumer webmail
 * brand - without a code change.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const freeMailDomainsSchema = z.object({
  version: z.string(),
  sourceNote: z.string(),
  domains: z.array(z.string()),
});

export type FreeMailDomainsConfig = z.infer<typeof freeMailDomainsSchema>;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let cached: ReadonlySet<string> | undefined;

export function getFreeMailDomains(): ReadonlySet<string> {
  if (cached) return cached;
  const filePath = path.join(moduleDir, 'config', 'free-mail-domains.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const parsed = freeMailDomainsSchema.parse(raw);
  cached = new Set(parsed.domains.map((domain) => domain.toLowerCase()));
  return cached;
}

export function isFreeMailDomain(domain: string): boolean {
  return getFreeMailDomains().has(domain.toLowerCase());
}
