import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { renderFindingsAppendix } from './findings-appendix.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings } from '../../test-fixtures.js';

describe('renderFindingsAppendix against the real sas-fernande.fr findings', () => {
  it('includes minor findings, which never reach the LLM layer', async () => {
    const findings = await loadSasFernandeFindings();
    expect(findings.some((f) => f.severity === 'minor')).toBe(true);

    const html = renderFindingsAppendix(getStrings('en'), findings);
    const minorFinding = findings.find((f) => f.severity === 'minor');
    expect(html).toContain(minorFinding?.ruleId ?? '__missing__');
  });

  it('groups findings under their category heading', async () => {
    const findings = await loadSasFernandeFindings();
    const html = renderFindingsAppendix(getStrings('en'), findings);

    expect(html).toContain('Accessibility');
    expect(html).toContain('Performance');
  });

  it('escapes finding titles so injected markup cannot execute', () => {
    const findings: Finding[] = [
      {
        findingId: 'f001',
        auditId: 'a',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['1.4.3'],
        title: '<img src=x onerror=alert(1)>',
        description: 'desc',
        pageUrls: ['https://example.com/'],
        occurrences: 1,
        elements: [],
        rawEvidence: {},
        dedupeKey: 'k',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    const html = renderFindingsAppendix(getStrings('en'), findings);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });
});
