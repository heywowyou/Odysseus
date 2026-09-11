/**
 * Loader for config/social-exclusion.json: the versioned default social-
 * platform exclusion list, shared by two independent call sites that both
 * need to recognise these hosts for different reasons: transactional-
 * flow.ts never follows a link to one of these (a social platform is
 * never a booking engine), and crawl.ts never treats a page whose crawl
 * redirects out to one of these as part of the audited site (an internal
 * stub URL like /facebook that 30x's out to facebook.com is not a page
 * this tool can audit). One list, so a platform added for one reason is
 * recognised for the other automatically.
 *
 * Same versioned-JSON-with-rationale shape as
 * packages/core/src/prospecting/config/naf-sector-allowlist.json, and the
 * same readFileSync-at-first-use idiom as its loader
 * (naf-allowlist.ts) - a bundled config asset, not live infrastructure.
 * Unlike the NAF list this only ever gates crawl/detection behavior, not
 * anything client-facing on its own; the report's methodology section
 * discloses the exclusion count, not the pattern table itself.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SocialExclusionPattern {
  pattern: string;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  enabled: boolean;
}

export interface SocialExclusionConfig {
  version: string;
  sourceNote: string;
  patterns: SocialExclusionPattern[];
}

function isSocialExclusionPattern(value: unknown): value is SocialExclusionPattern {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['pattern'] === 'string' &&
    typeof record['rationale'] === 'string' &&
    (record['confidence'] === 'high' ||
      record['confidence'] === 'medium' ||
      record['confidence'] === 'low') &&
    typeof record['enabled'] === 'boolean'
  );
}

/** Malformed JSON (a bad operator edit) throws loudly at first use rather
 *  than silently excluding nothing, matching getNafSectorAllowlist's own
 *  fail-fast reasoning. */
function parseSocialExclusionConfig(raw: unknown): SocialExclusionConfig {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('odysseus: social-exclusion.json must be a JSON object');
  }
  const record = raw as Record<string, unknown>;
  if (typeof record['version'] !== 'string' || typeof record['sourceNote'] !== 'string') {
    throw new Error('odysseus: social-exclusion.json is missing version or sourceNote');
  }
  if (!Array.isArray(record['patterns']) || !record['patterns'].every(isSocialExclusionPattern)) {
    throw new Error('odysseus: social-exclusion.json has a malformed patterns array');
  }
  return {
    version: record['version'],
    sourceNote: record['sourceNote'],
    patterns: record['patterns'],
  };
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let cachedConfig: SocialExclusionConfig | undefined;
let cachedRegexes: RegExp[] | undefined;

function getSocialExclusionConfig(): SocialExclusionConfig {
  if (cachedConfig) return cachedConfig;
  const filePath = path.join(moduleDir, 'config', 'social-exclusion.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  cachedConfig = parseSocialExclusionConfig(raw);
  return cachedConfig;
}

function enabledPatternRegexes(): RegExp[] {
  if (cachedRegexes) return cachedRegexes;
  cachedRegexes = getSocialExclusionConfig()
    .patterns.filter((entry) => entry.enabled)
    .map((entry) => new RegExp(entry.pattern, 'i'));
  return cachedRegexes;
}

export function isSocialPlatformHost(hostname: string): boolean {
  return enabledPatternRegexes().some((pattern) => pattern.test(hostname));
}
