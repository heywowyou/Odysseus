import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { toAuditPageFinding } from './audit-finding-response.js';

/** The largest committed fixture (2 MB findings.json on disk). */
const findings = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/test-audits/multi-page/findings.json', import.meta.url),
    'utf8',
  ),
) as Finding[];

describe('the audit page finding view (issue #510)', () => {
  const trimmed = findings.map(toAuditPageFinding);

  it('drops rawEvidence and caps pages at eight and elements at five, with the full counts', () => {
    for (const [index, finding] of trimmed.entries()) {
      const source = findings[index]!;
      expect(finding).not.toHaveProperty('rawEvidence');
      expect(finding.pageUrls.length).toBeLessThanOrEqual(8);
      expect(finding.elements.length).toBeLessThanOrEqual(5);
      expect(finding.pageUrlCount).toBe(new Set(source.pageUrls).size);
      expect(finding.elementCount).toBe(source.elements.length);
    }
    expect(trimmed.some((finding) => finding.pageUrlCount > 8)).toBe(true);
  });

  it('sends less than half the bytes of the stored findings', () => {
    const before = JSON.stringify(findings).length;
    const after = JSON.stringify(trimmed).length;
    // Recorded 2026-09-25 on this fixture: 1,294,942 characters of JSON
    // before, 96,596 after (93% smaller).
    expect(after).toBeLessThan(before / 2);
  });
});
