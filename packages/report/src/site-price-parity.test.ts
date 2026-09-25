/**
 * Issue #523: the public site (packages/site) cannot import the audit-engine
 * packages, so it keeps its own copy of the published prices in its pages.
 * This test holds every copy equal to the constants the report and the
 * dashboard render: changing a price on one side only fails here instead of
 * shipping two prices. It lives in `report` because that package sees both
 * constants: the full-audit price in core and the re-audit price here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { ODYSSEUS_REAUDIT_PRICE_EUR_HT } from './template/html-utils.js';

const SITE_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/app');

/** Every site file that states a price, and which prices it states. */
const PRICED_FILES: Record<string, readonly number[]> = {
  'page.tsx': [ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT],
  'offre/page.tsx': [ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT, ODYSSEUS_REAUDIT_PRICE_EUR_HT],
  'llms.txt/route.ts': [ODYSSEUS_FULL_AUDIT_PRICE_EUR_HT],
};

const SPACE = '(?:&#160;|\\u00a0| )';
/** A price as the site writes it, in French and in English. */
const PRICE_PATTERNS = [
  new RegExp(`(\\d[\\d\\u00a0 ]*)${SPACE}€${SPACE}HT`, 'gu'),
  /EUR (\d[\d,]*) excl\. VAT/gu,
];

function statedPrices(source: string): Set<number> {
  return new Set(
    PRICE_PATTERNS.flatMap((pattern) =>
      [...source.matchAll(pattern)].map((match) => Number(match[1]!.replace(/[^\d]/gu, ''))),
    ),
  );
}

describe('the public site states the engine prices (issue #523)', () => {
  it.each(Object.entries(PRICED_FILES))('%s states exactly its prices', (file, expected) => {
    expect(statedPrices(readFileSync(path.join(SITE_APP, file), 'utf8')), file).toEqual(
      new Set(expected),
    );
  });
});
